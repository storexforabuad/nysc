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

// ── Spintax resolver: {option1|option2|option3} → random pick ──
function resolveSpintax(text) {
    return text.replace(/{([^{}]+)}/g, (match, choices) => {
        const parts = choices.split('|');
        return parts[Math.floor(Math.random() * parts.length)];
    });
}

// ── Random delay helper (ms) ──
function randomDelay(minMs, maxMs) {
    return new Promise(r => setTimeout(r, minMs + Math.floor(Math.random() * (maxMs - minMs))));
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
            // Optimized query: strict filter + limit to prevent memory OOM and high read bills
            const snaps = await db.ledger
                .where('type', '==', 'BROADCAST_BATCH')
                .where('status', '==', 'PENDING')
                .limit(5)
                .get();

            const batches = snaps.docs.map(d => ({ id: d.id, ...d.data() }));

            for (const batch of batches) {
                const now = Date.now();
                // Anti-ban: Randomized jitter between 30-75 seconds to mimic human send patterns
                const minJitterMs = 30000 + Math.floor(Math.random() * 45000);

                if (now - batch.lastSentAt < minJitterMs) {
                    continue; // Enforce humanized slow dispatching
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
                const isOptedOut = await this.isOptedOut(batch.userId, targetJid);

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

                            const footerVariants = resolveSpintax(
                                '\n\n_{Powered by|Brought to you by|Delivered via} Clarion A.I.{.|!| 🚀}_'
                            );
                            const finalMessage = resolveSpintax(batch.messageTemplate) + customMenu + footerVariants;

                            // Send the network-specific plan image(s) FIRST, then the text
                            const imagePaths = getNetworkImages(detectedNetwork);
                            for (const imgPath of imagePaths) {
                                if (fs.existsSync(imgPath)) {
                                    try {
                                        // Anti-ban: simulate "attaching image" presence
                                        await sock.sendPresenceUpdate('composing', targetJid);
                                        await randomDelay(1500, 3000);
                                        await sock.sendMessage(targetJid, {
                                            image: fs.readFileSync(imgPath),
                                            caption: resolveSpintax(
                                                `📶 {Beautiful discounts|Great deals|Amazing offers} for your ${detectedNetwork?.toUpperCase() || ''} network!`
                                            )
                                        });
                                        // Anti-ban: inter-media delay (3-6s) between image and next send
                                        await randomDelay(3000, 6000);
                                    } catch (imgErr) {
                                        logger.warn(`Could not send plan image to ${targetJid}: ${imgErr.message}`);
                                    }
                                }
                            }

                            // Anti-ban: simulate typing before the text message
                            await sock.sendPresenceUpdate('composing', targetJid);
                            await randomDelay(2000, 4000);
                            await sock.sendMessage(targetJid, { text: finalMessage });
                            await sock.sendPresenceUpdate('paused', targetJid);
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

    async isOptedOut(proxyUserId, phoneJid) {
        if (!db.optouts) return false;
        try {
            const snap = await db.optouts.doc(`${proxyUserId}_${phoneJid}`).get();
            return snap.exists;
        } catch (e) {
            return false;
        }
    }

    async setOptOut(proxyUserId, customerPhoneJid) {
        if (!db.optouts) return;
        try {
            await db.optouts.doc(`${proxyUserId}_${customerPhoneJid}`).set({
                storeId: proxyUserId,
                customer: customerPhoneJid,
                optedOutAt: new Date().toISOString()
            });
        } catch (err) {
            logger.error('Failed to opt out', err.message);
        }
    }
}

export default new BroadcastQueue();
