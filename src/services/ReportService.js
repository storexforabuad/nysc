import { db } from './firebase.js';
import { logger } from '../config/env.js';
import wallet from './WalletService.js';

class ReportService {
    /**
     * Aggregates completed order metrics for a designated user over the last 7 days.
     * Includes multi-product breakdowns (data, airtime, exam pins), CDS impact score, and top VIP customers.
     */
    async generateWeeklyStats(userId) {
        if (!db.ledger) return null;

        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const isoSevenDaysAgo = sevenDaysAgo.toISOString();

            // Fetch all ledger records for this user
            const snap = await db.ledger
                .where('userId', '==', userId)
                .get();

            let totalOrders = 0;
            let dataOrders = 0;
            let airtimeOrders = 0;
            let examPinOrders = 0;
            let grossRevenue = 0;
            let netProfit = 0;
            const uniqueCustomers = new Set();

            snap.forEach(doc => {
                const data = doc.data();
                const type = data.type || '';
                const isCompleted = data.status === 'COMPLETED' || type.startsWith('COMPLETED_');

                if (isCompleted && data.createdAt >= isoSevenDaysAgo) {
                    if (type === 'COMPLETED_DATA' || (type === 'PENDING_DATA' && data.status === 'COMPLETED')) {
                        dataOrders++;
                        totalOrders++;
                    } else if (type === 'COMPLETED_AIRTIME' || (type === 'PENDING_AIRTIME' && data.status === 'COMPLETED')) {
                        airtimeOrders++;
                        totalOrders++;
                    } else if (type === 'COMPLETED_EXAM_PIN' || (type === 'PENDING_EXAM_PIN' && data.status === 'COMPLETED')) {
                        examPinOrders++;
                        totalOrders++;
                    } else if (data.amount && data.settlement?.coMemberShare) {
                        totalOrders++;
                    }

                    grossRevenue += data.amount || 0;
                    netProfit += data.settlement?.coMemberShare || 0;
                    if (data.buyerPhone) {
                        uniqueCustomers.add(data.buyerPhone);
                    }
                }
            });

            // If no activity, return null to avoid sending empty reports
            if (totalOrders === 0) return null;

            // Fetch cumulative CDS and impact milestone
            const totalCdsDonated = await wallet.getTotalCdsDonated(userId);
            const impactMilestone = wallet.getImpactLevel(totalCdsDonated);

            // Fetch VIP customers
            const vipData = await this.getVIPCustomers(userId);

            return {
                totalOrders,
                dataOrders,
                airtimeOrders,
                examPinOrders,
                grossRevenue: +grossRevenue.toFixed(2),
                netProfit: +netProfit.toFixed(2),
                activeCustomers: uniqueCustomers.size,
                totalCdsDonated,
                impactMilestone,
                topCustomers: vipData?.list || []
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
