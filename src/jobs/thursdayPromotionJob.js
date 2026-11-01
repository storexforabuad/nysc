import cron from 'node-cron';
import { db } from '../services/firebase.js';
import { config, logger } from '../config/env.js';
import sessionManager from '../bot/SessionManager.js';

export function startThursdayPromotionJob() {
    if (config.mockMode && process.env.TEST_CRON !== 'true') {
        logger.info('Skipping Thursday CDS Promotion CRON in mock mode (set TEST_CRON=true to override).');
        return;
    }

    // Schedule to run every Thursday at 10:00 AM Africa/Lagos (NYSC CDS Meeting Time)
    cron.schedule('0 10 * * 4', async () => {
        logger.info('Starting Thursday CDS Promotion Review job...');

        if (!db.users) {
            logger.warn('Firestore users collection not available for Thursday Promotion job.');
            return;
        }

        try {
            const sock = sessionManager.motherSock;
            if (!sock) {
                logger.warn('Mother Bot socket offline. Trying to push via active sessions.');
            }

            // 1. Group active referrals by parentId
            const refsSnap = await db.users.where('role', '==', 'REFERRAL').get();
            if (refsSnap.empty) {
                logger.info('No referral bots registered. Skipping promotion review.');
                return;
            }

            const parentMap = new Map();
            refsSnap.forEach(doc => {
                const data = doc.data();
                const parentId = data.parentId;
                if (!parentId) return;

                if (!parentMap.has(parentId)) {
                    parentMap.set(parentId, []);
                }
                parentMap.get(parentId).push({ id: doc.id, ...data });
            });

            // 2. Process each parent's cohort
            for (const [parentId, children] of parentMap.entries()) {
                if (children.length === 0) continue;

                // Compute Promotion Scores
                const scoredChildren = children.map(c => {
                    const m = c.metrics || {};
                    const orders = m.totalOrders || 0;
                    const revenue = m.totalRevenueNaira || 0;
                    const recruits = m.recruitedPartnersCount || 0;
                    const score = (orders * 10) + (Math.floor(revenue / 1000) * 5) + (recruits * 25);

                    return {
                        ...c,
                        orders,
                        revenue,
                        recruits,
                        score
                    };
                });

                // Sort descending by score
                scoredChildren.sort((a, b) => b.score - a.score);
                const rank1 = scoredChildren[0];

                // Build Leaderboard Message for Parent
                let report = `🎖️ *NYSC CDS THURSDAY PROMOTION REVIEW* 🇳🇬\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `Here is your Partners' Weekly Performance:\n\n`;

                scoredChildren.forEach((child, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️';
                    const phone = child.phoneNumber || child.id.split('@')[0];
                    const name = child.name || child.franchiseName || 'Partner';
                    const stateCodeDisplay = child.isStateCodeVerified
                        ? `[${child.stateCode} ✅]`
                        : `[No State Code ⚠️]`;

                    report += `${medal} *#${idx + 1} ${name}* (+${phone})\n` +
                        `   • Score: *${child.score.toLocaleString()} pts* | Orders: ${child.orders}\n` +
                        `   • Sales: ₦${child.revenue.toLocaleString()} | Recruits: ${child.recruits}\n` +
                        `   • NYSC Status: ${stateCodeDisplay}\n\n`;
                });

                report += `━━━━━━━━━━━━━━━━━━\n`;

                if (rank1.isStateCodeVerified && rank1.score > 0) {
                    const cleanPhone = rank1.phoneNumber || rank1.id.split('@')[0];
                    report += `👑 *Rank #1 Partner (${rank1.name || cleanPhone}) is eligible for Graduation!*\n\n` +
                        `Upon graduation, they will receive:\n` +
                        `• Dedicated Paystack Virtual Account & direct cash earnings.\n` +
                        `• Sovereign store status & their own referral slots.\n\n` +
                        `👉 Reply *APPROVE_UPGRADE ${cleanPhone}* to graduate them now!\n` +
                        `👉 Or reply *SKIP* to maintain current structure.`;
                } else if (!rank1.isStateCodeVerified) {
                    report += `ℹ️ *Rank #1 Partner (${rank1.name}) has no verified NYSC State Code.*\n` +
                        `They have been notified to reply *STATECODE [TheirCode]* to qualify for next Thursday's graduation.`;

                    // Send alert to Rank 1 partner
                    try {
                        const rank1Jid = rank1.id.includes('@') ? rank1.id : `${rank1.id}@s.whatsapp.net`;
                        const alertSock = sessionManager.sessions.get(rank1Jid) || sock;
                        if (alertSock) {
                            await alertSock.sendMessage(rank1Jid, {
                                text: `🎖️ *NYSC CDS Promotion Alert!*\n\n` +
                                    `You are currently *Ranked #1* under your Store, but your NYSC State Code is unverified!\n\n` +
                                    `Reply *STATECODE [YourStateCode]* (e.g. *STATECODE LA/23B/4921*) now so your Store Host can promote you to full ownership next Thursday! 🇳🇬`
                            });
                        }
                    } catch (e) {
                        logger.warn(`Could not send state code alert to ${rank1.id}:`, e.message);
                    }
                } else {
                    report += `_No partner reached the minimum activity threshold this week. Keep motivating your network!_ 🚀`;
                }

                // Send to parent
                const parentJid = parentId.includes('@') ? parentId : `${parentId}@s.whatsapp.net`;
                try {
                    const parentSock = sessionManager.sessions.get(parentJid) || sock;
                    if (parentSock) {
                        await parentSock.sendMessage(parentJid, { text: report });
                        logger.info(`Thursday CDS Promotion report delivered to Parent ${parentId}`);
                    }
                } catch (sendErr) {
                    logger.error(`Failed to send Thursday CDS report to ${parentId}:`, sendErr.message);
                }

                await new Promise(r => setTimeout(r, 1200));
            }

            logger.info('Thursday CDS Promotion Review job completed.');
        } catch (err) {
            logger.error('Error during Thursday CDS Promotion job:', err.message);
        }
    }, {
        timezone: "Africa/Lagos"
    });

    logger.info('Thursday CDS Promotion CRON job scheduled (Every Thursday 10:00 AM Africa/Lagos).');
}
