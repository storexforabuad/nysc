import { db } from './firebase.js';
import { logger } from '../config/env.js';
import wallet from './WalletService.js';

class AdminService {
    /**
     * Aggregates global system metrics from the ledger
     */
    async getSystemMetrics() {
        if (!db.ledger) {
            logger.warn('Firestore ledger unavailable for admin metrics.');
            return { totalSystemProfit: 0, totalCDSProfit: 0, dailyVolume: 0 };
        }

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isoToday = today.toISOString();

            const snap = await db.ledger
                .where('type', '==', 'COMPLETED_DATA')
                .where('status', '==', 'COMPLETED')
                .get();

            let totalSystemProfit = 0;
            let totalCDSProfit = 0;
            let dailyVolume = 0;

            snap.forEach(doc => {
                const data = doc.data();
                totalSystemProfit += data.settlement?.systemShare || 0;
                totalCDSProfit += data.settlement?.cdsShare || 0;

                if (data.createdAt >= isoToday) {
                    dailyVolume++;
                }
            });

            return {
                totalSystemProfit: +totalSystemProfit.toFixed(2),
                totalCDSProfit: +totalCDSProfit.toFixed(2),
                dailyVolume
            };
        } catch (error) {
            logger.error('Error generating admin system metrics:', error.message);
            return { totalSystemProfit: 0, totalCDSProfit: 0, dailyVolume: 0 };
        }
    }

    /**
     * Counts active ProxyBots based on recent interactions
     */
    async getActiveBotCount() {
        if (!db.users) return 0;
        try {
            const snap = await db.users.get();
            const activePartners = snap.docs.filter(doc => doc.data().virtualAccount);
            return activePartners.length;
        } catch (error) {
            logger.error('Error getting active bot count:', error.message);
            return 0;
        }
    }

    /**
     * Fetches all partners and their current wallet balance
     */
    async listPartners() {
        if (!db.users) return [];
        try {
            const snap = await db.users.get();
            const partners = [];
            for (const doc of snap.docs) {
                const data = doc.data();
                if (!data.virtualAccount) continue; // Filter out standard users/contacts

                const balance = await wallet.getBalance(doc.id);
                partners.push({
                    id: doc.id,
                    name: data.name || 'Unknown Partner',
                    virtualAccount: data.virtualAccount || null,
                    balance
                });
            }
            return partners;
        } catch (error) {
            logger.error('Error listing partners:', error.message);
            return [];
        }
    }

    /**
     * Fetches all pending withdrawals
     */
    async listPendingWithdrawals() {
        if (!db.ledger) return [];
        try {
            const snap = await db.ledger
                .where('type', '==', 'WITHDRAWAL')
                .where('status', '==', 'PENDING')
                .get();

            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            logger.error('Error listing pending withdrawals:', error.message);
            return [];
        }
    }
}

export default new AdminService();
