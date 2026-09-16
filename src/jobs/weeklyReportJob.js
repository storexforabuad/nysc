import cron from 'node-cron';
import { db } from '../services/firebase.js';
import { config, logger } from '../config/env.js';
import reportService from '../services/ReportService.js';
import sessionManager from '../bot/SessionManager.js';

export function startWeeklyReportJob() {
    if (config.mockMode && process.env.TEST_CRON !== 'true') {
        logger.info('Skipping CRON job initialization in mock mode (set TEST_CRON=true to override).');
        return;
    }

    // Schedule to run every Friday at 9:00 AM Lagos Time
    cron.schedule('0 9 * * 5', async () => {
        logger.info('Starting weekly performance report job...');

        if (!db.users) {
            logger.warn('Firestore users collection not available for reporting.');
            return;
        }

        try {
            const sock = sessionManager.motherSock;
            if (!sock) {
                logger.error('Mother Bot session not active. Cannot send reports.');
                return;
            }

            const usersSnap = await db.users.where('state', 'in', ['COMPLETED', 'PAIRED']).get();

            for (const doc of usersSnap.docs) {
                const userId = doc.id; // Usually ends with @s.whatsapp.net

                const stats = await reportService.generateWeeklyStats(userId);

                if (stats) {
                    const badgeTitle = stats.impactMilestone?.current
                        ? `${stats.impactMilestone.current.badge} ${stats.impactMilestone.current.title}`
                        : '🌱 Community Contributor';

                    let msg = `📈 *Your Weekly Clarion Enterprise Report*\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `📊 *This Week's Sales*\n` +
                        `• Total Orders: ${stats.totalOrders}\n` +
                        `• Data Orders: ${stats.dataOrders || 0}\n` +
                        `• Airtime Orders: ${stats.airtimeOrders || 0}\n` +
                        `• Exam PINs Sold: ${stats.examPinOrders || 0}\n` +
                        `• Gross Revenue: ₦${stats.grossRevenue.toLocaleString()}\n` +
                        `• Your Net Profit: ₦${stats.netProfit.toLocaleString()}\n` +
                        `• Active Customers: ${stats.activeCustomers}\n\n` +
                        `🏆 *Your NYSC CDS Impact*\n` +
                        `• Standing: ${badgeTitle}\n` +
                        `• Total Donated to Date: ₦${(stats.totalCdsDonated || 0).toLocaleString()}\n`;

                    if (stats.impactMilestone?.next) {
                        msg += `• Next Milestone: ${stats.impactMilestone.next.badge} ${stats.impactMilestone.next.title} (₦${stats.impactMilestone.next.threshold.toLocaleString()})\n\n`;
                    } else {
                        msg += `• 💎 Maximum NYSC Hero of Service Impact Achieved!\n\n`;
                    }

                    if (stats.topCustomers && stats.topCustomers.length > 0) {
                        msg += `👑 *Top VIP Customers This Week*\n`;
                        stats.topCustomers.slice(0, 3).forEach((c, idx) => {
                            const maskedPhone = c.phone.length > 7
                                ? `${c.phone.substring(0, 4)}****${c.phone.substring(c.phone.length - 4)}`
                                : c.phone;
                            msg += `${idx + 1}. ${maskedPhone} — ₦${c.amount.toLocaleString()} (${c.orders} orders)\n`;
                        });
                        msg += `\n`;
                    }

                    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `_Keep building your digital enterprise! Have a highly profitable weekend._ 🚀`;

                    try {
                        await sock.sendMessage(userId, { text: msg });
                        logger.info(`Report sent to ${userId}`);
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (sendErr) {
                        logger.error(`Failed to send report to ${userId}:`, sendErr.message);
                    }
                }
            }
            logger.info('Weekly performance report job completed successfully.');
        } catch (error) {
            logger.error('Error during weekly report job:', error.message);
        }
    }, {
        timezone: "Africa/Lagos"
    });

    logger.info('Weekly report CRON job scheduled (Every Friday 9:00 AM Africa/Lagos).');
}
