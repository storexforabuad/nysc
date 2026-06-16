import { db } from './firebase.js';
import { logger } from '../config/env.js';

// Fee constants — single source of truth
export const WITHDRAWAL_FEES = {
    MONNIFY_FEE: 52.50,    // Monnify's bank transfer charge
    SERVICE_FEE: 50.00,    // Platform processing fee (our profit)
    get TOTAL() { return this.MONNIFY_FEE + this.SERVICE_FEE; },
    MIN_WITHDRAWAL: 1000   // Minimum withdrawal amount
};

class WalletService {

    /**
     * Calculate a co-member's available balance by summing all
     * coMemberShare from completed orders and subtracting all withdrawals.
     */
    async getBalance(userId) {
        if (!db.ledger) {
            logger.warn('Firestore ledger unavailable, returning 0 balance.');
            return 0;
        }

        try {
            // Sum all completed order profits for this user
            const completedSnap = await db.ledger
                .where('userId', '==', userId)
                .where('status', '==', 'COMPLETED')
                .get();

            let totalEarned = 0;
            completedSnap.forEach(doc => {
                const data = doc.data();
                totalEarned += data.settlement?.coMemberShare || 0;
            });

            // Sum all successful and pending withdrawals for this user
            const withdrawalSnap = await db.ledger
                .where('userId', '==', userId)
                .where('type', '==', 'WITHDRAWAL')
                .where('status', 'in', ['SUCCESS', 'PENDING'])
                .get();

            let totalWithdrawn = 0;
            withdrawalSnap.forEach(doc => {
                totalWithdrawn += doc.data().amount || 0;
            });

            return +(totalEarned - totalWithdrawn).toFixed(2);
        } catch (error) {
            logger.error(`Error calculating balance for ${userId}:`, error.message);
            return 0;
        }
    }

    /**
     * Record a successful withdrawal in the ledger.
     */
    async recordWithdrawal(userId, amount, bankDetails, transferRef) {
        if (!db.ledger) return null;

        try {
            const record = {
                type: 'WITHDRAWAL',
                userId,
                amount,                              // Gross amount debited from balance
                netPayout: +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2),
                fees: {
                    monnifyFee: WITHDRAWAL_FEES.MONNIFY_FEE,
                    serviceFee: WITHDRAWAL_FEES.SERVICE_FEE,
                    total: WITHDRAWAL_FEES.TOTAL
                },
                bankDetails,
                transferRef,
                status: 'PENDING',
                createdAt: new Date().toISOString()
            };

            const ref = await db.ledger.add(record);
            logger.info(`Withdrawal recorded: ${ref.id} for ₦${amount} (net ₦${record.netPayout}) [PENDING]`);
            return { id: ref.id, ...record };
        } catch (error) {
            logger.error(`Error recording withdrawal for ${userId}:`, error.message);
            throw error;
        }
    }

    /**
     * Update an existing withdrawal's status.
     */
    async updateWithdrawalStatus(transferRef, newStatus) {
        if (!db.ledger) return null;
        try {
            const snap = await db.ledger.where('transferRef', '==', transferRef).limit(1).get();
            if (snap.empty) {
                logger.warn(`No withdrawal found with reference ${transferRef}`);
                return false;
            }

            const doc = snap.docs[0];
            await doc.ref.update({
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
            logger.info(`Withdrawal ${transferRef} status updated to ${newStatus}`);
            return true;
        } catch (error) {
            logger.error(`Error updating withdrawal status for ${transferRef}:`, error.message);
            throw error;
        }
    }

    /**
     * Get transaction history (last 10 items).
     */
    async getTransactionHistory(userId) {
        if (!db.ledger) return [];
        try {
            const snap = await db.ledger
                .where('userId', '==', userId)
                .get();

            const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
        } catch (error) {
            logger.error(`Error fetching history for ${userId}:`, error.message);
            return [];
        }
    }
}

export default new WalletService();
