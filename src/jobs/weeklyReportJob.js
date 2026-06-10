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
                    const msg = `📊 *Your Weekly Store Report*\n\n` +
                        `Orders Processed: ${stats.totalOrders}\n` +
                        `Gross Revenue: ₦${stats.grossRevenue}\n` +
                        `Net Profit Earned: ₦${stats.netProfit}\n` +
                        `Active Customers: ${stats.activeCustomers}\n\n` +
                        `_Keep pushing! Have a highly profitable weekend._ 🚀`;

                    try {
                        await sock.sendMessage(userId, { text: msg });
                        logger.info(`Report sent to ${userId}`);
                        // Small delay to prevent WhatsApp rate limits
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
