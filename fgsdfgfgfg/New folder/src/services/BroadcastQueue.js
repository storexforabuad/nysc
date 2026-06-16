import { db } from './firebase.js';
import sessionManager from '../bot/SessionManager.js';
import { logger } from '../config/env.js';

class BroadcastQueue {
    constructor() {
        this.checkInterval = 10 * 1000; // Check loop every 10 seconds
        this.timer = null;
        this.isActive = false;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        logger.info('Starting BroadcastQueue background runner');
        this.timer = setInterval(() => this.processQueue(), this.checkInterval);
    }

    async queueBroadcast(userId, messageTemplate, targetJids) {
        if (!db.ledger) return;

        logger.info(`Queuing broadcast for ${userId} to ${targetJids.length} contacts`);

        try {
            const batchDoc = {
                type: 'BROADCAST_BATCH',
                userId,
                messageTemplate,
                targetJids, // Array of JIDs waiting to receive
                sentCount: 0,
                totalCount: targetJids.length,
                status: 'PENDING',
                lastSentAt: 0,
                createdAt: new Date().toISOString()
            };

            await db.ledger.add(batchDoc);
        } catch (err) {
            logger.error('Failed to queue broadcast', err);
        }
    }

    async processQueue() {
        if (!db.ledger) return;

        try {
            const snaps = await db.ledger.where('type', '==', 'BROADCAST_BATCH').get();

            // We filter in memory to avoid missing composite index errors on the database
            const batches = snaps.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.status === 'PENDING');

            for (const batch of batches) {
                const now = Date.now();
                // Jitter Delay: Normally 5 minutes to prevent spam. Down to 5 seconds for local mock MVP display format.
                const minJitterMs = 5000;

                if (now - batch.lastSentAt < minJitterMs) {
                    continue; // Enforce slow dispatching
                }

                const remainingTargets = batch.targetJids || [];
                if (remainingTargets.length === 0) {
                    await db.ledger.doc(batch.id).update({
                        status: 'COMPLETED',
                        updatedAt: new Date().toISOString()
                    });
                    continue;
                }

                const targetJid = remainingTargets.shift();
                const isOptedOut = await this.isOptedOut(targetJid);

                if (!isOptedOut) {
                    const sock = sessionManager.sessions.get(batch.userId);
                    if (sock) {
                        try {
                            const footerMsg = '\n\n_Reply "STOP" to opt out._';
                            await sock.sendMessage(targetJid, { text: batch.messageTemplate + footerMsg });
                            logger.info(`[BROADCAST] -> Sent to ${targetJid} on behalf of ${batch.userId}`);
                        } catch (sendErr) {
                            logger.error(`Broadcast Failed for ${targetJid}`, sendErr.message);
                        }
                    } else {
                        logger.warn(`Cannot broadcast. Proxy bot for ${batch.userId} is offline.`);
                    }
                } else {
                    logger.info(`[BROADCAST] Skipped ${targetJid} (Opted out)`);
                }

                await db.ledger.doc(batch.id).update({
                    targetJids: remainingTargets,
                    sentCount: batch.sentCount + 1,
                    lastSentAt: Date.now()
                });
            }
        } catch (err) {
            logger.error('Queue processing error', err.message);
        }
    }

    async isOptedOut(phoneJid) {
        if (!db.users) return false;
        try {
            const snap = await db.users.where('optOuts', 'array-contains', phoneJid).limit(1).get();
            return !snap.empty;
        } catch (e) {
            return false;
        }
    }

    async setOptOut(proxyUserId, customerPhoneJid) {
        if (!db.users) return;
        try {
            const userRef = db.users.doc(proxyUserId);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
                const optOuts = userDoc.data().optOuts || [];
                if (!optOuts.includes(customerPhoneJid)) {
                    optOuts.push(customerPhoneJid);
                    await userRef.update({ optOuts });
                }
            }
        } catch (err) {
            logger.error('Failed to opt out', err.message);
        }
    }
}

export default new BroadcastQueue();
