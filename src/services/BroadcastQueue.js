import { db } from './firebase.js';
import sessionManager from '../bot/SessionManager.js';
import { logger } from '../config/env.js';
import payflex from './payflex.js';
import { detectNetwork } from '../utils/networkUtils.js';
import fs from 'fs';
import path from 'path';

// Absolute paths to the network marketing images
const PLAN_IMAGES_DIR = path.join(process.cwd(), 'fgsdfgfgfg', 'plan images');
const NETWORK_IMAGES = {
    mtn_data_share: path.join(PLAN_IMAGES_DIR, 'mtndatashare.png'),
    mtn_gifting_data: path.join(PLAN_IMAGES_DIR, 'mtngifting.png'),
    airtel_data: path.join(PLAN_IMAGES_DIR, 'airtel.png'),
    glo_data: path.join(PLAN_IMAGES_DIR, 'glo.png'),
    '9mobile_data': path.join(PLAN_IMAGES_DIR, '9mobile.png'),
};

// Pick the right images for a detected network string (e.g. 'mtn', 'airtel', 'glo', '9mobile')
// Returns an array because MTN requires sending both Data Share and Gifting posters.
function getNetworkImages(detectedNetwork) {
    if (!detectedNetwork) return [];
    const net = detectedNetwork.toLowerCase();
    if (net === 'mtn') return [NETWORK_IMAGES['mtn_data_share'], NETWORK_IMAGES['mtn_gifting_data']];
    if (net === 'airtel') return [NETWORK_IMAGES['airtel_data']];
    if (net === 'glo') return [NETWORK_IMAGES['glo_data']];
    if (net === '9mobile') return [NETWORK_IMAGES['9mobile_data']];
    return [];
}


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
                // Jitter Delay: Scale to production rate-limits (15 seconds between sends)
                const minJitterMs = 15000;

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
                            let customMenu = '';
                            const detectedNetwork = detectNetwork(targetJid);

                            if (detectedNetwork) {
                                const plans = await payflex.getAvailablePlans();
                                const filteredPlans = plans.filter(p => {
                                    if (detectedNetwork === 'mtn') return p.network.includes('mtn');
                                    return p.network.includes(detectedNetwork);
                                });

                                if (filteredPlans.length > 0) {
                                    customMenu = `\n\n📶 *Your ${detectedNetwork.toUpperCase()} Plans:*\n`;
                                    filteredPlans.forEach(plan => {
                                        customMenu += `🔹 *${plan.name}* - ₦${plan.sellPrice}\n   Reply *BUY ${plan.serial}* to order.\n`;
                                    });
                                }
                            }

                            const footerMsg = '\n\n_Powered by Clarion A.I._';
                            const finalMessage = batch.messageTemplate + customMenu + footerMsg;

                            // Send the network-specific plan image(s) FIRST, then the text
                            const imagePaths = getNetworkImages(detectedNetwork);
                            for (const imgPath of imagePaths) {
                                if (fs.existsSync(imgPath)) {
                                    try {
                                        await sock.sendMessage(targetJid, {
                                            image: fs.readFileSync(imgPath),
                                            caption: `📶 Beautiful discounts for your ${detectedNetwork?.toUpperCase() || ''} network!`
                                        });
                                    } catch (imgErr) {
                                        logger.warn(`Could not send plan image to ${targetJid}: ${imgErr.message}`);
                                    }
                                }
                            }

                            await sock.sendMessage(targetJid, { text: finalMessage });
                            logger.info(`[CLARION-BROADCAST] -> Sent to ${targetJid} on behalf of ${batch.userId}`);
                        } catch (sendErr) {
                            logger.error(`Broadcast Failed for ${targetJid}`, sendErr.message);
                        }
                    } else {
                        logger.warn(`Clarion Store for ${batch.userId} is currently offline. Skipping segment.`);
                    }
                } else {
                    logger.info(`[CLARION-BROADCAST] Skipping opted-out partner: ${targetJid}`);
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
