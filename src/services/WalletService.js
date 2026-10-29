import admin, { db } from './firebase.js';
import { logger } from '../config/env.js';

// Fee constants — single source of truth
export const WITHDRAWAL_FEES = {
    SQUAD_FEE: 50.00,       // Squad's bank transfer charge
    SERVICE_FEE: 40.00,     // Platform processing fee (our profit)
    get TOTAL() { return this.SQUAD_FEE + this.SERVICE_FEE; }, // ₦90.00
    MIN_WITHDRAWAL: 1000,   // Minimum withdrawal amount
    BANK_UPDATE_FEE: 100.00 // Fee debited from wallet to update locked bank details
};

// Bot Modes & Subscription Tiers
export const BOT_MODES = {
    MANUAL: 'manual',
    AUTONOMOUS: 'autonomous'
};

export const SUBSCRIPTION_PLANS = {
    MONTHLY: { key: 'MONTHLY', price: 950, durationDays: 30, label: 'Monthly (₦950/month)' }
};

/**
 * Returns free complimentary AI autonomous mode grant duration (in days)
 * based on the partner's donation tier.
 */
export function getFreeGrantDays(tier) {
    if (!tier) return 0;
    const t = String(tier).toUpperCase();
    if (t === 'LORD' || t === 'PIONEER') return 60; // 2 months (60 days) free for Pioneer Class & Lord Rank
    if (['MASTER', 'MEMBER'].includes(t)) return 14; // 2 weeks (14 days) free for Master & Member
    return 0;
}

// Clarion Partnership Tiers (Dynamic Tripartite Settlement)
export const PARTNERSHIP_TIERS = {
    PIONEER: {
        name: 'Clarion Pioneer Class',
        memberRate: 0.64,
        cdsRate: 0.16,
        platformRate: 0.20,
        badge: 'LORD',
        displayDonate: '20%'
    },
    MEMBER: {
        name: 'Clarion Member',
        memberRate: 0.64,
        cdsRate: 0.16,
        platformRate: 0.20,
        badge: 'MEMBER',
        displayDonate: '20%'
    },
    MASTER: {
        name: 'Clarion Master',
        memberRate: 0.40,
        cdsRate: 0.40,
        platformRate: 0.20,
        badge: 'MASTER',
        displayDonate: '50%'
    },
    LORD: {
        name: 'Clarion Lord',
        memberRate: 0.16,
        cdsRate: 0.64,
        platformRate: 0.20,
        badge: 'LORD',
        displayDonate: '80%'
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
     * Calculate dynamic profit split for a referral bot transaction:
     * 1. Clarion Platform Cut = 20%
     * 2. NYSC CDS Donation = parentTier.cdsRate (e.g. 16% for Member)
     * 3. Distributable Profit = netProfit - platform - cds
     * 4. Referral Share = Distributable * (referralSharePercent / 100) -> Data Fuel
     * 5. Parent Share = Distributable - Referral Share -> Cash Wallet
     */
    calculateReferralSettlement(netProfit, parentTier = 'MEMBER', referralSharePercent = 35) {
        const normalizedTier = (parentTier || 'MEMBER').toUpperCase();
        const tierConfig = PARTNERSHIP_TIERS[normalizedTier] || PARTNERSHIP_TIERS.MEMBER;

        const systemShare = +(netProfit * tierConfig.platformRate).toFixed(2);
        const cdsShare = +(netProfit * tierConfig.cdsRate).toFixed(2);
        const distributableProfit = +(Math.max(0, netProfit - systemShare - cdsShare)).toFixed(2);

        const safeSharePercent = Math.min(100, Math.max(0, Number(referralSharePercent) || 35));
        const referralShare = +(distributableProfit * (safeSharePercent / 100)).toFixed(2);
        const parentShare = +(distributableProfit - referralShare).toFixed(2);

        return {
            totalProfit: netProfit,
            systemShare,
            cdsShare,
            distributableProfit,
            referralShare,
            parentShare,
            referralSharePercent: safeSharePercent,
            tier: tierConfig.badge,
            tierKey: normalizedTier,
            tierName: tierConfig.name
        };
    }

    /**
     * Unified Order Settlement Engine:
     * Dispatches settlement according to whether the fulfilling store is a Referral Bot or Standard Parent.
     */
    async settleCompletedOrder({
        orderId,
        userId,
        amount,
        netProfit,
        userDoc = null,
        buyerPhone = '',
        planName = 'Data Plan',
        transactionRef = '',
        source = 'AUTOMATED'
    }) {
        if (!db.ledger) return this.calculateSettlement(netProfit, 'MEMBER');

        let userData = userDoc;
        if (!userData && db.users && userId && userId !== 'HUB') {
            try {
                const uSnap = await db.users.doc(userId).get();
                if (uSnap.exists) userData = uSnap.data();
            } catch (e) {}
        }

        const isReferral = userData?.role === 'REFERRAL' || !!userData?.parentId;
        let settlement;

        if (isReferral) {
            // Referral Bot settlement
            let parentTier = 'MEMBER';
            if (userData?.parentId && db.users) {
                try {
                    const pSnap = await db.users.doc(userData.parentId).get();
                    if (pSnap.exists) parentTier = pSnap.data().donationTier || 'MEMBER';
                } catch (e) {}
            }
            const referralSharePercent = userData?.profitSharePercent || 35;
            settlement = this.calculateReferralSettlement(netProfit, parentTier, referralSharePercent);

            // 1. Credit referral Data Fuel
            await this.recordDataFuelCredit(
                userId,
                settlement.referralShare,
                `Commission for order #${orderId}`,
                { orderId, buyerPhone, planName }
            );

            // 2. Credit Parent Cash Wallet in ledger
            if (userData?.parentId) {
                await db.ledger.add({
                    type: 'REFERRAL_PARENT_EARNING',
                    userId: userData.parentId,
                    childReferralId: userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: settlement.parentShare,
                        systemShare: settlement.systemShare,
                        cdsShare: settlement.cdsShare,
                        totalProfit: netProfit
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});

                // Increment Parent CDS pool
                if (db.users && settlement.cdsShare > 0) {
                    const inc = admin.firestore?.FieldValue?.increment
                        ? admin.firestore.FieldValue.increment(settlement.cdsShare)
                        : settlement.cdsShare;
                    await db.users.doc(userData.parentId).set({
                        totalCdsDonated: inc
                    }, { merge: true }).catch(() => {});
                }
            }

            // 3. Increment referral performance metrics in db.users
            if (db.users) {
                const incOrders = admin.firestore?.FieldValue?.increment ? admin.firestore.FieldValue.increment(1) : 1;
                const incRev = admin.firestore?.FieldValue?.increment ? admin.firestore.FieldValue.increment(amount || 0) : amount;
                const incProfit = admin.firestore?.FieldValue?.increment ? admin.firestore.FieldValue.increment(settlement.referralShare || 0) : settlement.referralShare;

                await db.users.doc(userId).set({
                    metrics: {
                        totalOrders: incOrders,
                        totalRevenueNaira: incRev,
                        totalProfitNaira: incProfit,
                        lastOrderAt: new Date().toISOString()
                    }
                }, { merge: true }).catch(() => {});
            }
        } else {
            // Standard Parent / Individual settlement
            const userTier = userId === 'HUB' ? 'HUB' : (userData?.donationTier || 'MEMBER');
            settlement = this.calculateSettlement(netProfit, userTier);

            // Atomically increment CDS pool on user doc
            if (db.users && userId && userId !== 'HUB' && settlement.cdsShare > 0) {
                const inc = admin.firestore?.FieldValue?.increment
                    ? admin.firestore.FieldValue.increment(settlement.cdsShare)
                    : settlement.cdsShare;
                await db.users.doc(userId).set({
                    totalCdsDonated: inc
                }, { merge: true }).catch(() => {});
            }
        }

        return settlement;
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
                } else if ((data.type === 'PURCHASE_DEBIT' || data.type === 'SELF_PURCHASE_DEBIT' || data.type === 'SUBSCRIPTION_DEBIT') && data.status === 'SUCCESS') {
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
     * Calculate a referral bot's available Data Fuel balance (in Naira).
     */
    async getDataFuelBalance(userId) {
        if (!db.ledger) return 0;
        try {
            if (db.users) {
                const uDoc = await db.users.doc(userId).get();
                if (uDoc.exists && uDoc.data().dataFuelBalance !== undefined) {
                    return Math.max(0, Number(uDoc.data().dataFuelBalance) || 0);
                }
            }

            const ledgerSnap = await db.ledger.where('userId', '==', userId).get();
            let totalCredits = 0;
            let totalDebits = 0;

            ledgerSnap.forEach(doc => {
                const data = doc.data();
                if (data.type === 'DATA_FUEL_CREDIT' && data.status === 'SUCCESS') {
                    totalCredits += data.amount || 0;
                } else if (data.type === 'DATA_FUEL_DEBIT' && data.status === 'SUCCESS') {
                    totalDebits += data.amount || 0;
                }
            });

            return +(Math.max(0, totalCredits - totalDebits)).toFixed(2);
        } catch (error) {
            logger.error(`Error calculating Data Fuel balance for ${userId}:`, error.message);
            return 0;
        }
    }

    /**
     * Credit Data Fuel to a referral bot upon order completion.
     */
    async recordDataFuelCredit(userId, amountNaira, description = 'Referral profit share', metadata = {}) {
        if (!db.ledger || amountNaira <= 0) return null;
        try {
            const ref = db.ledger.doc();
            await ref.set({
                type: 'DATA_FUEL_CREDIT',
                userId,
                amount: amountNaira,
                description,
                status: 'SUCCESS',
                metadata,
                createdAt: new Date().toISOString()
            });

            if (db.users) {
                const inc = admin.firestore?.FieldValue?.increment
                    ? admin.firestore.FieldValue.increment(amountNaira)
                    : amountNaira;
                await db.users.doc(userId).set({
                    dataFuelBalance: inc
                }, { merge: true }).catch(() => {});
            }

            return ref.id;
        } catch (err) {
            logger.error(`Error recording Data Fuel credit for ${userId}:`, err.message);
            return null;
        }
    }

    /**
     * Debit Data Fuel when a referral bot redeems data.
     */
    async recordDataFuelDebit(userId, amountNaira, description = 'Data Fuel redemption', metadata = {}) {
        if (!db.ledger || amountNaira <= 0) return null;
        try {
            const ref = db.ledger.doc();
            await ref.set({
                type: 'DATA_FUEL_DEBIT',
                userId,
                amount: amountNaira,
                description,
                status: 'SUCCESS',
                metadata,
                createdAt: new Date().toISOString()
            });

            if (db.users) {
                const dec = admin.firestore?.FieldValue?.increment
                    ? admin.firestore.FieldValue.increment(-amountNaira)
                    : -amountNaira;
                await db.users.doc(userId).set({
                    dataFuelBalance: dec
                }, { merge: true }).catch(() => {});
            }

            return ref.id;
        } catch (err) {
            logger.error(`Error recording Data Fuel debit for ${userId}:`, err.message);
            return null;
        }
    }

    /**
     * Record a subscription debit for autonomous mode upgrade.
     */
    async recordSubscriptionDebit(userId, amount, plan, metadata = {}) {
        if (!db.ledger) return null;
        try {
            const ref = db.ledger.doc();
            await ref.set({
                type: 'SUBSCRIPTION_DEBIT',
                userId,
                amount,
                plan,
                description: `Autonomous Mode Subscription (${plan})`,
                status: 'SUCCESS',
                metadata,
                createdAt: new Date().toISOString()
            });
            return ref.id;
        } catch (err) {
            logger.error(`Error recording subscription debit for ${userId}:`, err.message);
            return null;
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
