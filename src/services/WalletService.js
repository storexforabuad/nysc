import { db } from './firebase.js';
import { logger } from '../config/env.js';

// Fee constants — single source of truth
export const WITHDRAWAL_FEES = {
    SQUAD_FEE: 50.00,       // Squad's bank transfer charge
    SERVICE_FEE: 40.00,     // Platform processing fee (our profit)
    get TOTAL() { return this.SQUAD_FEE + this.SERVICE_FEE; }, // ₦90.00
    MIN_WITHDRAWAL: 1000,   // Minimum withdrawal amount
    BANK_UPDATE_FEE: 100.00 // Fee debited from wallet to update locked bank details
};

// Clarion Partnership Tiers (Dynamic Tripartite Settlement)
export const PARTNERSHIP_TIERS = {
    PIONEER: {
        name: 'Clarion Pioneer Class',
        memberRate: 0.64,
        cdsRate: 0.16,
        platformRate: 0.20,
        badge: 'LORD',
        displayDonate: '16%'
    },
    MEMBER: {
        name: 'Clarion Member',
        memberRate: 0.64,
        cdsRate: 0.16,
        platformRate: 0.20,
        badge: 'MEMBER',
        displayDonate: '16%'
    },
    MASTER: {
        name: 'Clarion Master',
        memberRate: 0.40,
        cdsRate: 0.40,
        platformRate: 0.20,
        badge: 'MASTER',
        displayDonate: '40%'
    },
    LORD: {
        name: 'Clarion Lord',
        memberRate: 0.16,
        cdsRate: 0.64,
        platformRate: 0.20,
        badge: 'LORD',
        displayDonate: '64%'
    },
    HUB: {
        name: 'ClarionHub Central',
        memberRate: 0.00,   // No individual owner
        cdsRate: 0.50,      // 50% to central NYSC CDS pool
        platformRate: 0.50, // 50% to platform operations
        badge: 'HUB',
        displayDonate: '50%'
    }
};

// Community Impact Milestones (CDS Contributions)
export const IMPACT_MILESTONES = [
    { threshold: 1000,  title: 'Community Helper',    badge: '🥉', level: 1 },
    { threshold: 5000,  title: 'Community Builder',   badge: '🥈', level: 2 },
    { threshold: 10000, title: 'Community Pillar',    badge: '🥇', level: 3 },
    { threshold: 25000, title: 'NYSC Hero of Service', badge: '💎', level: 4 }
];

/**
 * Check if a donation increment crossed any milestone thresholds.
 * Returns the highest crossed milestone or null.
 */
export function checkMilestone(previousTotal, newTotal) {
    const prev = Number(previousTotal) || 0;
    const current = Number(newTotal) || 0;
    if (current <= prev) return null;

    let crossed = null;
    for (const m of IMPACT_MILESTONES) {
        if (prev < m.threshold && current >= m.threshold) {
            crossed = m;
        }
    }
    return crossed;
}

/**
 * Returns current milestone, next milestone, and progress percentage.
 */
export function getImpactLevel(totalCdsDonated) {
    const total = Number(totalCdsDonated) || 0;
    let currentMilestone = null;
    let nextMilestone = IMPACT_MILESTONES[0];

    for (let i = 0; i < IMPACT_MILESTONES.length; i++) {
        if (total >= IMPACT_MILESTONES[i].threshold) {
            currentMilestone = IMPACT_MILESTONES[i];
            nextMilestone = IMPACT_MILESTONES[i + 1] || null;
        }
    }

    if (!currentMilestone) {
        const percentage = Math.min(100, Math.round((total / nextMilestone.threshold) * 100));
        return {
            current: null,
            next: nextMilestone,
            percentage,
            remaining: Math.max(0, nextMilestone.threshold - total),
            totalCdsDonated: total
        };
    }

    const percentage = nextMilestone
        ? Math.min(100, Math.round(((total - currentMilestone.threshold) / (nextMilestone.threshold - currentMilestone.threshold)) * 100))
        : 100;

    return {
        current: currentMilestone,
        next: nextMilestone,
        percentage,
        remaining: nextMilestone ? Math.max(0, nextMilestone.threshold - total) : 0,
        totalCdsDonated: total
    };
}

class WalletService {
    constructor() {
        this.checkMilestone = checkMilestone;
        this.getImpactLevel = getImpactLevel;
        this.IMPACT_MILESTONES = IMPACT_MILESTONES;
    }

    /**
     * Calculate dynamic tripartite profit split based on user's partnership tier.
     */
    calculateSettlement(netProfit, tier = 'MEMBER') {
        const normalizedTier = (tier || 'MEMBER').toUpperCase();
        const tierConfig = PARTNERSHIP_TIERS[normalizedTier] || PARTNERSHIP_TIERS.MEMBER;

        const coMemberShare = +(netProfit * tierConfig.memberRate).toFixed(2);
        const cdsShare = +(netProfit * tierConfig.cdsRate).toFixed(2);
        // Balance remainder to systemShare to guarantee exact total
        const systemShare = +(netProfit - coMemberShare - cdsShare).toFixed(2);

        return {
            coMemberShare,
            cdsShare,
            systemShare,
            totalProfit: netProfit,
            tier: tierConfig.badge,
            tierKey: normalizedTier,
            tierName: tierConfig.name
        };
    }

    /**
     * Calculate a co-member's available balance by summing all
     * coMemberShare from completed orders and subtracting all withdrawals and fees.
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

            // Sum all withdrawals, bank update fees, and purchase debits for this user
            const debitSnap = await db.ledger
                .where('userId', '==', userId)
                .get();

            let totalDebits = 0;
            debitSnap.forEach(doc => {
                const data = doc.data();
                if (data.type === 'WITHDRAWAL' && (data.status === 'SUCCESS' || data.status === 'PENDING')) {
                    totalDebits += data.amount || 0;
                } else if (data.type === 'BANK_UPDATE_FEE' && data.status === 'SUCCESS') {
                    totalDebits += data.amount || WITHDRAWAL_FEES.BANK_UPDATE_FEE;
                } else if ((data.type === 'PURCHASE_DEBIT' || data.type === 'SELF_PURCHASE_DEBIT') && data.status === 'SUCCESS') {
                    totalDebits += data.amount || 0;
                }
            });

            return +(Math.max(0, totalEarned - totalDebits)).toFixed(2);
        } catch (error) {
            logger.error(`Error calculating balance for ${userId}:`, error.message);
            return 0;
        }
    }

    /**
     * Record a direct wallet purchase debit (for airtime, data, or exam pins).
     */
    async recordPurchaseDebit(userId, amount, description = 'Direct purchase', metadata = {}) {
        if (!db.ledger) return null;
        try {
            const ref = db.ledger.doc();
            await ref.set({
                type: 'PURCHASE_DEBIT',
                userId,
                amount,
                description,
                status: 'SUCCESS',
                metadata,
                createdAt: new Date().toISOString()
            });
            return ref.id;
        } catch (err) {
            logger.error(`Error recording purchase debit for ${userId}:`, err.message);
            return null;
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
                    squadFee: WITHDRAWAL_FEES.SQUAD_FEE,
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
     * Record bank update fee debit in the ledger.
     */
    async recordBankUpdateFee(userId) {
        if (!db.ledger) return null;

        try {
            const record = {
                type: 'BANK_UPDATE_FEE',
                userId,
                amount: WITHDRAWAL_FEES.BANK_UPDATE_FEE,
                status: 'SUCCESS',
                description: 'Security fee for updating verified payout bank account',
                createdAt: new Date().toISOString()
            };

            const ref = await db.ledger.add(record);
            logger.info(`Bank update fee recorded for ${userId}: ₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE}`);
            return { id: ref.id, ...record };
        } catch (error) {
            logger.error(`Error recording bank update fee for ${userId}:`, error.message);
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

    /**
     * Aggregates total CDS donation generated by this user.
     */
    async getTotalCdsDonated(userId) {
        if (!db.ledger) return 0;
        try {
            const snap = await db.ledger
                .where('userId', '==', userId)
                .where('status', '==', 'COMPLETED')
                .get();

            let totalCds = 0;
            snap.forEach(doc => {
                totalCds += doc.data().settlement?.cdsShare || 0;
            });
            return +totalCds.toFixed(2);
        } catch (error) {
            logger.error(`Error fetching total CDS donated for ${userId}:`, error.message);
            return 0;
        }
    }

    /**
     * Aggregates total personal profit earned by this user.
     */
    async getTotalPersonalProfit(userId) {
        if (!db.ledger) return 0;
        try {
            const snap = await db.ledger
                .where('userId', '==', userId)
                .where('status', '==', 'COMPLETED')
                .get();

            let totalProfit = 0;
            snap.forEach(doc => {
                totalProfit += doc.data().settlement?.coMemberShare || 0;
            });
            return +totalProfit.toFixed(2);
        } catch (error) {
            logger.error(`Error fetching personal profit for ${userId}:`, error.message);
            return 0;
        }
    }
}

export default new WalletService();
