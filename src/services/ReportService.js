import { db } from './firebase.js';
import { logger } from '../config/env.js';

class ReportService {
    /**
     * Aggregates completed order metrics for a designated user over the last 7 days.
     */
    async generateWeeklyStats(userId) {
        if (!db.ledger) return null;

        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const isoSevenDaysAgo = sevenDaysAgo.toISOString();

            // Fetching explicitly for this user. Filtering dates in-memory to prevent
            // missing-index errors on untrained Firestore databases.
            const snap = await db.ledger
                .where('userId', '==', userId)
                .where('type', '==', 'COMPLETED_DATA')
                .get();

            let totalOrders = 0;
            let grossRevenue = 0;
            let netProfit = 0;
            const uniqueCustomers = new Set();

            snap.forEach(doc => {
                const data = doc.data();

                if (data.createdAt >= isoSevenDaysAgo) {
                    totalOrders++;
                    grossRevenue += data.amount || 0;
                    netProfit += data.settlement?.coMemberShare || 0;
                    if (data.buyerPhone) {
                        uniqueCustomers.add(data.buyerPhone);
                    }
                }
            });

            // If no activity, return null to avoid sending empty reports
            if (totalOrders === 0) return null;

            return {
                totalOrders,
                grossRevenue: +grossRevenue.toFixed(2),
                netProfit: +netProfit.toFixed(2),
                activeCustomers: uniqueCustomers.size
            };

        } catch (error) {
            logger.error(`Error generating weekly report for ${userId}:`, error.message);
            return null;
        }
    }

    /**
     * Aggregates completed order metrics to find top 3 VIP customers.
     */
    async getVIPCustomers(userId) {
        if (!db.users) return null;

        try {
            const snap = await db.users.doc(userId).collection('contacts').get();

            const customerStats = [];
            let totalRevenue = 0;
            let totalOrders = 0;

            snap.forEach(doc => {
                const data = doc.data();
                const spent = data.totalSpent || 0;
                const orders = data.totalOrders || 0;
                totalRevenue += spent;
                totalOrders += orders;

                customerStats.push({
                    phone: data.phone || doc.id.split('@')[0],
                    amount: spent,
                    orders: orders
                });
            });

            const sortedCustomers = customerStats
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 3); // Top 3

            return {
                list: sortedCustomers,
                totalRevenue,
                totalOrders
            };
        } catch (error) {
            logger.error(`Error generating VIP customers for ${userId}:`, error.message);
            return null;
        }
    }
}

export default new ReportService();
