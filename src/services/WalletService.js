import admin, { db } from './firebase.js';
import { logger } from '../config/env.js';
import { calculatePaystackFee } from './payflex.js';

// Super Parent Identity constants
export const SUPER_PARENT_PHONE = '07032905036';
export const SUPER_PARENT_JID = '2347032905036@s.whatsapp.net';
export const SUPER_PARENT_ALT_PHONE = '08119772223';
export const SUPER_PARENT_ALT_JID = '2348119772223@s.whatsapp.net';

export function isSuperParent(idOrPhone) {
    if (!idOrPhone) return false;
    const clean = String(idOrPhone).replace(/\D/g, '');
    return clean.endsWith('7032905036') || clean.endsWith('8119772223');
}

// Fee constants — single source of truth (Paystack ₦50 + Platform ₦50 = ₦100 Flat)
export const WITHDRAWAL_FEES = {
    PAYSTACK_FEE: 50.00,    // Paystack's NIP bank transfer charge
    SERVICE_FEE: 50.00,     // Platform processing fee
    get TOTAL() { return this.PAYSTACK_FEE + this.SERVICE_FEE; }, // ₦100.00
    MIN_WITHDRAWAL: 2000,   // Minimum withdrawal amount (unlocks at Tier 2, net payout ₦1,900)
    BANK_UPDATE_FEE: 100.00 // Fee debited from wallet to update locked bank details
};

// Progressive Multiplier Tiers (1X = 10% base unit)
export const MULTIPLIER_TIERS = {
    TIER_1: { level: 1, multiplier: '1X', minBalance: 0, rate: 0.10, superParentRate: 0.80, name: 'Tier 1 (1X Base)' },
    TIER_2: { level: 2, multiplier: '2X', minBalance: 2000, rate: 0.20, superParentRate: 0.70, name: 'Tier 2 (2X Double Power)' },
    TIER_3: { level: 3, multiplier: '3X', minBalance: 4000, rate: 0.30, superParentRate: 0.60, name: 'Tier 3 (3X Triple Power)' },
    TIER_4: { level: 4, multiplier: '4X', minBalance: 6000, rate: 0.40, superParentRate: 0.50, name: 'Tier 4 (4X Max Power)' }
};

/**
 * Returns the current Multiplier Tier details based on available wallet balance.
 */
export function getMultiplierTier(walletBalance) {
    const w = Number(walletBalance) || 0;
    if (w >= MULTIPLIER_TIERS.TIER_4.minBalance) {
        return {
            ...MULTIPLIER_TIERS.TIER_4,
            currentBalance: w,
            nextThreshold: null,
            neededToNext: 0,
            neededForNext: 0,
            progressPercent: 100
        };
    }
    if (w >= MULTIPLIER_TIERS.TIER_3.minBalance) {
        const next = MULTIPLIER_TIERS.TIER_4.minBalance;
        const span = next - MULTIPLIER_TIERS.TIER_3.minBalance;
        const prog = Math.min(100, Math.round(((w - MULTIPLIER_TIERS.TIER_3.minBalance) / span) * 100));
        const needed = +(next - w).toFixed(2);
        return {
            ...MULTIPLIER_TIERS.TIER_3,
            currentBalance: w,
            nextThreshold: next,
            neededToNext: needed,
            neededForNext: needed,
            progressPercent: prog
        };
    }
    if (w >= MULTIPLIER_TIERS.TIER_2.minBalance) {
        const next = MULTIPLIER_TIERS.TIER_3.minBalance;
        const span = next - MULTIPLIER_TIERS.TIER_2.minBalance;
        const prog = Math.min(100, Math.round(((w - MULTIPLIER_TIERS.TIER_2.minBalance) / span) * 100));
        const needed = +(next - w).toFixed(2);
        return {
            ...MULTIPLIER_TIERS.TIER_2,
            currentBalance: w,
            nextThreshold: next,
            neededToNext: needed,
            neededForNext: needed,
            progressPercent: prog
        };
    }
    const next = MULTIPLIER_TIERS.TIER_2.minBalance;
    const prog = Math.min(100, Math.round((w / next) * 100));
    const needed = +(next - w).toFixed(2);
    return {
        ...MULTIPLIER_TIERS.TIER_1,
        currentBalance: w,
        nextThreshold: next,
        neededToNext: needed,
        neededForNext: needed,
        progressPercent: prog
    };
}

// Bot Modes & Subscription Tiers
export const BOT_MODES = {
    MANUAL: 'manual',
    AUTONOMOUS: 'autonomous'
};

export const SUBSCRIPTION_PLANS = {
    MONTHLY: { key: 'MONTHLY', price: 950, durationDays: 30, label: 'Monthly (₦950/month)' }
};

/**
 * Calculates net profit strictly after Paystack gateway fees are absorbed:
 * P = S - C - F
 */
export function calculateNetProfit(sellPrice, wholesaleCost) {
    const s = Number(sellPrice) || 0;
    const c = Number(wholesaleCost) || 0;
    const f = calculatePaystackFee(s);
    return Math.max(0, +(s - c - f).toFixed(2));
}

/**
 * Calculates wholesale discount price using the dynamic 1X–4X Multiplier model.
 * Discount is taken strictly off Net Profit (P = S - C - F), ensuring Parent Proxy never sells below cost.
 */
export function getWholesalePrice(plan, walletBalance) {
    const s = Number(plan.sellPrice) || 0;
    const c = Number(plan.baseCost || plan.wholesaleCost) || 0;
    const f = calculatePaystackFee(s);
    const p = Math.max(0, +(s - c - f).toFixed(2));
    const tier = getMultiplierTier(walletBalance);

    if (p > 0) {
        const discountAmount = +(p * tier.rate).toFixed(2);
        const discountedPrice = Math.max(c, +(s - discountAmount).toFixed(2));
        return {
            retailPrice: s,
            discountedPrice,
            discountAmount,
            discountRate: tier.rate,
            level: tier.level,
            multiplier: tier.multiplier,
            tierName: tier.name,
            valueOf() { return this.discountedPrice; },
            toString() { return String(this.discountedPrice); }
        };
    }

    return {
        retailPrice: s,
        discountedPrice: s,
        discountAmount: 0,
        discountRate: tier.rate,
        level: tier.level,
        multiplier: tier.multiplier,
        tierName: tier.name,
        valueOf() { return this.discountedPrice; },
        toString() { return String(this.discountedPrice); }
    };
}

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

    getWholesalePrice(plan, walletBalance) {
        return getWholesalePrice(plan, walletBalance);
    }

    getMultiplierTier(walletBalance) {
        return getMultiplierTier(walletBalance);
    }

    calculateNetProfit(sellPrice, wholesaleCost) {
        return calculateNetProfit(sellPrice, wholesaleCost);
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
     * Calculate dynamic co-funding settlement based on wallet liquidity (alpha-ratio).
     * Strictly computes net profit after Paystack collection fee is absorbed:
     * P = S - C - F
     */
    calculateDynamicSettlement({
        sellPrice,
        wholesaleCost,
        walletBalance = 0,
        proxyId = '',
        isSquadSale = false,
        squadLeaderId = '',
        squadLeaderBalance = 0,
        mentorId = '',
        seniorMentorId = '',
        grandparentMentorId = ''
    }) {
        const s = Number(sellPrice) || 0;
        const c = Number(wholesaleCost) || 0;
        const paystackFee = calculatePaystackFee(s);
        const netProfit = Math.max(0, +(s - c - paystackFee).toFixed(2));
        const w = Number(walletBalance) || 0;

        // 1. Super Parent (07032905036 / MGL) direct fulfillment
        if (isSuperParent(proxyId)) {
            const platformShare = +(netProfit * 0.10).toFixed(2);
            const superParentShare = +(netProfit - platformShare).toFixed(2);
            return {
                netProfit,
                paystackFee,
                state: 'SUPER_PARENT',
                proxyShare: superParentShare,
                proxyRate: 0.90,
                superParentShare,
                superParentRate: 0.90,
                platformShare,
                platformRate: 0.10,
                alpha: 1.0,
                isSquadSale: false
            };
        }

        // 2. Generation 3 & 4 Squad Downline Sale (recruited under an active squad leader who has a senior mentor)
        if (isSquadSale && seniorMentorId) {
            const squadChildShare = +(netProfit * 0.10).toFixed(2);
            const squadLeaderShare = +(netProfit * 0.30).toFixed(2);
            const seniorMentorShare = +(netProfit * 0.05).toFixed(2);
            const platformShare = +(netProfit * 0.10).toFixed(2);
            const superParentShare = +(netProfit - squadChildShare - squadLeaderShare - seniorMentorShare - platformShare).toFixed(2);

            return {
                netProfit,
                paystackFee,
                state: 'GEN3_SQUAD_SALE',
                proxyShare: squadChildShare,
                proxyRate: 0.10,
                squadLeaderShare,
                squadLeaderRate: 0.30,
                seniorMentorShare,
                seniorMentorRate: 0.05,
                seniorMentorId,
                superParentShare,
                superParentRate: 0.45,
                platformShare,
                platformRate: 0.10,
                alpha: 0,
                isSquadSale: true
            };
        }

        // 3. Standard Squad Downline Sale (Case 1: Generation 2, under a direct Semi-Parent)
        if (isSquadSale) {
            const squadChildShare = +(netProfit * 0.10).toFixed(2);
            const semiParentShare = +(netProfit * 0.30).toFixed(2);
            const platformShare = +(netProfit * 0.10).toFixed(2);
            const superParentShare = +(netProfit - squadChildShare - semiParentShare - platformShare).toFixed(2);

            return {
                netProfit,
                paystackFee,
                state: 'SQUAD_SALE',
                proxyShare: squadChildShare,
                proxyRate: 0.10,
                squadLeaderShare: semiParentShare,
                squadLeaderRate: 0.30,
                superParentShare,
                superParentRate: 0.50,
                platformShare,
                platformRate: 0.10,
                alpha: 0,
                isSquadSale: true
            };
        }

        // 4. Multiplier Tier Evaluation
        const tier = getMultiplierTier(w);

        // Case 4: Gen-3 Graduated Leader Personal Direct Sale with Mentor & Grandparent (Zainab Tier 4 direct sale)
        if (mentorId && grandparentMentorId && tier.level === 4) {
            const proxyShare = +(netProfit * 0.40).toFixed(2);
            const mentorRoyaltyShare = +(netProfit * 0.10).toFixed(2);
            const grandparentRoyaltyShare = +(netProfit * 0.025).toFixed(2);
            const platformShare = +(netProfit * 0.10).toFixed(2);
            const superParentShare = +(netProfit - proxyShare - mentorRoyaltyShare - grandparentRoyaltyShare - platformShare).toFixed(2);

            return {
                netProfit,
                paystackFee,
                state: 'GEN3_GRADUATED_LEADER_SALE',
                level: 4,
                multiplier: '4X',
                tierName: 'Tier 4 (4X Max Power)',
                proxyShare,
                proxyRate: 0.40,
                mentorRoyaltyShare,
                mentorRoyaltyRate: 0.10,
                mentorId,
                grandparentRoyaltyShare,
                grandparentRoyaltyRate: 0.025,
                grandparentMentorId,
                superParentShare,
                superParentRate: 0.375,
                platformShare,
                platformRate: 0.10,
                alpha: 1.0,
                isSquadSale: false
            };
        }

        // Case 2: Tier 4 Graduated Leader Personal Direct Sale with Mentor (Amina Tier 4 direct sale)
        if (mentorId && tier.level === 4) {
            const proxyShare = +(netProfit * 0.40).toFixed(2);
            const mentorRoyaltyShare = +(netProfit * 0.10).toFixed(2);
            const platformShare = +(netProfit * 0.10).toFixed(2);
            const superParentShare = +(netProfit - proxyShare - mentorRoyaltyShare - platformShare).toFixed(2);

            return {
                netProfit,
                paystackFee,
                state: 'GRADUATED_LEADER_SALE',
                level: 4,
                multiplier: '4X',
                tierName: 'Tier 4 (4X Max Power)',
                proxyShare,
                proxyRate: 0.40,
                mentorRoyaltyShare,
                mentorRoyaltyRate: 0.10,
                mentorId,
                superParentShare,
                superParentRate: 0.40,
                platformShare,
                platformRate: 0.10,
                alpha: 1.0,
                isSquadSale: false
            };
        }

        // Standard Dynamic Tier Direct Sale (Tier 1 to 4 without mentor royalty)
        const proxyRate = tier.rate;
        const platformRate = 0.10;
        const superParentRate = tier.superParentRate;

        const proxyShare = +(netProfit * proxyRate).toFixed(2);
        const platformShare = +(netProfit * platformRate).toFixed(2);
        const superParentShare = +(netProfit - proxyShare - platformShare).toFixed(2);

        return {
            netProfit,
            paystackFee,
            state: tier.level === 1 ? 'CHILD_PROXY' : 'DYNAMIC_SEMI_PARENT',
            level: tier.level,
            multiplier: tier.multiplier,
            tierName: tier.name,
            proxyShare,
            proxyRate,
            superParentShare,
            superParentRate,
            platformShare,
            platformRate,
            alpha: +(proxyRate / 0.40).toFixed(2),
            isSquadSale: false
        };
    }

    /**
     * Unified Order Settlement Engine:
     * Dispatches settlement according to Dynamic Liquidity, Squad downline, or Standard Member.
     */
    async settleCompletedOrder({
        orderId,
        userId,
        amount,
        netProfit: passedNetProfit,
        wholesaleCost,
        baseCost,
        userDoc = null,
        buyerPhone = '',
        planName = 'Data Plan',
        transactionRef = '',
        source = 'AUTOMATED'
    }) {
        let userData = userDoc;
        if (!userData && db.users && userId && userId !== 'HUB') {
            try {
                const uSnap = await db.users.doc(userId).get();
                if (uSnap.exists) userData = uSnap.data();
            } catch (e) {}
        }

        const effectiveWholesale = wholesaleCost || baseCost || 0;
        const currentWalletBal = await this.getBalance(userId);

        const isSquadSale = Boolean(userData?.parentId && (userData.role === 'REFERRAL' || userData.isSquadChild || userData.role === 'CHILD_PROXY'));
        let mentorId = userData?.mentorId || '';
        let seniorMentorId = '';
        let grandparentMentorId = userData?.grandparentMentorId || '';

        if (isSquadSale && userData?.parentId) {
            try {
                if (db.users) {
                    const parentDoc = await db.users.doc(userData.parentId).get();
                    if (parentDoc.exists) {
                        const parentData = parentDoc.data();
                        if (parentData.mentorId) {
                            seniorMentorId = parentData.mentorId;
                        }
                    }
                }
            } catch (e) {}
        } else if (mentorId && !grandparentMentorId) {
            try {
                if (db.users) {
                    const mentorDoc = await db.users.doc(mentorId).get();
                    if (mentorDoc.exists) {
                        const mentorData = mentorDoc.data();
                        if (mentorData.mentorId && !isSuperParent(mentorData.mentorId)) {
                            grandparentMentorId = mentorData.mentorId;
                        }
                    }
                }
            } catch (e) {}
        }

        // Use dynamic settlement when wholesale cost is known or for proxy networks
        let dynamicSettlement = null;
        if (effectiveWholesale > 0 || isSquadSale || isSuperParent(userId) || currentWalletBal > 0) {
            dynamicSettlement = this.calculateDynamicSettlement({
                sellPrice: amount,
                wholesaleCost: effectiveWholesale,
                walletBalance: currentWalletBal,
                proxyId: userId,
                isSquadSale,
                squadLeaderId: userData?.parentId || '',
                mentorId,
                seniorMentorId,
                grandparentMentorId
            });
        }

        const netProfit = dynamicSettlement ? dynamicSettlement.netProfit : (passedNetProfit || 0);

        if (!db.ledger) {
            return dynamicSettlement || this.calculateSettlement(netProfit, 'MEMBER');
        }

        if (dynamicSettlement) {
            if (dynamicSettlement.isSquadSale) {
                // 1. Squad Child earns 10% into In-Chat Wallet (data purchases only)
                await this.recordDataFuelCredit(
                    userId,
                    dynamicSettlement.proxyShare,
                    `Squad commission for order #${orderId}`,
                    { orderId, buyerPhone, planName }
                );

                // 2. Direct Squad Leader earns 30% passive override in ledger
                if (userData?.parentId) {
                    await db.ledger.add({
                        type: 'SQUAD_LEADER_OVERRIDE',
                        userId: userData.parentId,
                        squadChildId: userId,
                        orderId,
                        amount,
                        settlement: {
                            coMemberShare: dynamicSettlement.squadLeaderShare,
                            superParentShare: dynamicSettlement.superParentShare,
                            systemShare: dynamicSettlement.platformShare,
                            totalProfit: dynamicSettlement.netProfit
                        },
                        status: 'COMPLETED',
                        source,
                        transactionRef,
                        createdAt: new Date().toISOString()
                    }).catch(() => {});
                }

                // 2b. Senior Mentor earns 5% Royalty in Gen-3 sales
                if (dynamicSettlement.state === 'GEN3_SQUAD_SALE' && dynamicSettlement.seniorMentorId) {
                    await db.ledger.add({
                        type: 'SENIOR_MENTOR_ROYALTY',
                        userId: dynamicSettlement.seniorMentorId,
                        squadChildId: userId,
                        squadLeaderId: userData.parentId,
                        orderId,
                        amount,
                        settlement: {
                            coMemberShare: dynamicSettlement.seniorMentorShare,
                            rate: dynamicSettlement.seniorMentorRate,
                            totalProfit: dynamicSettlement.netProfit
                        },
                        status: 'COMPLETED',
                        source,
                        transactionRef,
                        createdAt: new Date().toISOString()
                    }).catch(() => {});
                }

                // 3. Super Parent earns remainder (45% or 50%)
                await db.ledger.add({
                    type: 'SUPER_PARENT_PROFIT',
                    userId: SUPER_PARENT_JID,
                    childId: userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});
            } else if (dynamicSettlement.state === 'GEN3_GRADUATED_LEADER_SALE') {
                // 1. Proxy earns 40% withdrawable profit in ledger
                await db.ledger.add({
                    type: 'SEMI_PARENT_PROFIT',
                    userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.proxyShare,
                        superParentShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit,
                        proxyRate: dynamicSettlement.proxyRate
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});

                // 2. Direct Mentor earns 10% Leadership Royalty
                if (dynamicSettlement.mentorId) {
                    await db.ledger.add({
                        type: 'MENTOR_LEADERSHIP_ROYALTY',
                        userId: dynamicSettlement.mentorId,
                        protégéId: userId,
                        orderId,
                        amount,
                        settlement: {
                            coMemberShare: dynamicSettlement.mentorRoyaltyShare,
                            rate: dynamicSettlement.mentorRoyaltyRate,
                            totalProfit: dynamicSettlement.netProfit
                        },
                        status: 'COMPLETED',
                        source,
                        transactionRef,
                        createdAt: new Date().toISOString()
                    }).catch(() => {});
                }

                // 3. Grandparent Mentor earns 2.5% Generational Legacy Royalty
                if (dynamicSettlement.grandparentMentorId) {
                    await db.ledger.add({
                        type: 'GRANDPARENT_LEGACY_ROYALTY',
                        userId: dynamicSettlement.grandparentMentorId,
                        protégéId: userId,
                        directMentorId: dynamicSettlement.mentorId,
                        orderId,
                        amount,
                        settlement: {
                            coMemberShare: dynamicSettlement.grandparentRoyaltyShare,
                            rate: dynamicSettlement.grandparentRoyaltyRate,
                            totalProfit: dynamicSettlement.netProfit
                        },
                        status: 'COMPLETED',
                        source,
                        transactionRef,
                        createdAt: new Date().toISOString()
                    }).catch(() => {});
                }

                // 4. Super Parent earns 37.5%
                await db.ledger.add({
                    type: 'SUPER_PARENT_PROFIT',
                    userId: SUPER_PARENT_JID,
                    childId: userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});
            } else if (dynamicSettlement.state === 'GRADUATED_LEADER_SALE') {
                // Proxy earns 40% withdrawable profit in ledger
                await db.ledger.add({
                    type: 'SEMI_PARENT_PROFIT',
                    userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.proxyShare,
                        superParentShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit,
                        proxyRate: dynamicSettlement.proxyRate
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});

                // Mentor earns 10% Leadership Royalty
                if (dynamicSettlement.mentorId) {
                    await db.ledger.add({
                        type: 'MENTOR_LEADERSHIP_ROYALTY',
                        userId: dynamicSettlement.mentorId,
                        protégéId: userId,
                        orderId,
                        amount,
                        settlement: {
                            coMemberShare: dynamicSettlement.mentorRoyaltyShare,
                            rate: dynamicSettlement.mentorRoyaltyRate,
                            totalProfit: dynamicSettlement.netProfit
                        },
                        status: 'COMPLETED',
                        source,
                        transactionRef,
                        createdAt: new Date().toISOString()
                    }).catch(() => {});
                }

                // Super Parent earns 40%
                await db.ledger.add({
                    type: 'SUPER_PARENT_PROFIT',
                    userId: SUPER_PARENT_JID,
                    childId: userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});
            } else if (dynamicSettlement.state === 'CHILD_PROXY') {
                // Child Proxy (W < 1,000): 10% credited to in-chat wallet (data purchase only)
                await this.recordDataFuelCredit(
                    userId,
                    dynamicSettlement.proxyShare,
                    `Child proxy profit (10%) for order #${orderId}`,
                    { orderId, buyerPhone, planName, usage: 'DATA_PURCHASE_ONLY' }
                );

                // Super Parent earns 80%
                await db.ledger.add({
                    type: 'SUPER_PARENT_PROFIT',
                    userId: SUPER_PARENT_JID,
                    childId: userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});
            } else if (dynamicSettlement.state === 'DYNAMIC_SEMI_PARENT') {
                // Semi-Parent (W >= 1,000): Proxy earns up to 40% withdrawable profit in ledger
                await db.ledger.add({
                    type: 'SEMI_PARENT_PROFIT',
                    userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.proxyShare,
                        superParentShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit,
                        alpha: dynamicSettlement.alpha,
                        proxyRate: dynamicSettlement.proxyRate
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});

                // Super Parent earns 50% to 80%
                await db.ledger.add({
                    type: 'SUPER_PARENT_PROFIT',
                    userId: SUPER_PARENT_JID,
                    childId: userId,
                    orderId,
                    amount,
                    settlement: {
                        coMemberShare: dynamicSettlement.superParentShare,
                        systemShare: dynamicSettlement.platformShare,
                        totalProfit: dynamicSettlement.netProfit
                    },
                    status: 'COMPLETED',
                    source,
                    transactionRef,
                    createdAt: new Date().toISOString()
                }).catch(() => {});
            }

            // Increment orders and revenue on user profile
            if (db.users) {
                const incOrders = admin.firestore?.FieldValue?.increment ? admin.firestore.FieldValue.increment(1) : 1;
                const incRev = admin.firestore?.FieldValue?.increment ? admin.firestore.FieldValue.increment(amount || 0) : amount;
                const incProfit = admin.firestore?.FieldValue?.increment ? admin.firestore.FieldValue.increment(dynamicSettlement.proxyShare || 0) : dynamicSettlement.proxyShare;

                await db.users.doc(userId).set({
                    metrics: {
                        totalOrders: incOrders,
                        totalRevenueNaira: incRev,
                        totalProfitNaira: incProfit,
                        lastOrderAt: new Date().toISOString()
                    }
                }, { merge: true }).catch(() => {});

                // Check for Squad Leader Graduation (Tier 4 + 10 completed orders)
                await this.checkAndTriggerSquadGraduation(userId, currentWalletBal, (userData?.metrics?.totalOrders || 0) + 1);

                // If squad mentee made a sale, evaluate upline leader's slot unlock milestones
                if (isSquadSale && userData?.parentId) {
                    await this.checkAndTriggerSquadSlotMilestone(userData.parentId);
                }
            }

            return dynamicSettlement;
        }
        if (!db.ledger) return this.calculateSettlement(netProfit, 'MEMBER');

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
                    paystackFee: WITHDRAWAL_FEES.PAYSTACK_FEE,
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
    /**
     * Checks if a partner qualifies for Tier 4 Semi-Parent Squad Leader Graduation:
     * - Float >= ₦6,000 (Tier 4)
     * - Completed orders >= 10
     * If qualified and not yet graduated:
     * - Unlocks Slot #1 (progressive; Slots 2-5 earned via downline velocity)
     * - Liberates 1 slot on mentor's roster
     * - Dispatches celebration alerts via WhatsApp
     */
    async checkAndTriggerSquadGraduation(userId, currentWalletBal = null, totalOrders = null) {
        if (!db.users || !userId || isSuperParent(userId)) return null;

        try {
            const uDoc = await db.users.doc(userId).get();
            if (!uDoc.exists) return null;
            const userData = uDoc.data();

            if (userData.isGraduatedSquadLeader) return null;

            const balance = currentWalletBal !== null ? currentWalletBal : await this.getBalance(userId);
            const orders = totalOrders !== null ? totalOrders : (userData.metrics?.totalOrders || 0);

            if (balance >= 6000 && orders >= 10) {
                const mentorId = userData.mentorId || userData.parentId || userData.recruitedBy || '';
                // Resolve grandparentMentorId if mentor exists and is not Super Parent
                let grandparentMentorId = userData.grandparentMentorId || '';
                if (mentorId && !grandparentMentorId && !isSuperParent(mentorId) && db.users) {
                    try {
                        const mDoc = await db.users.doc(mentorId).get();
                        if (mDoc.exists) {
                            const mData = mDoc.data();
                            if (mData.mentorId && !isSuperParent(mData.mentorId)) {
                                grandparentMentorId = mData.mentorId;
                            }
                        }
                    } catch (e) {}
                }

                const updates = {
                    isGraduatedSquadLeader: true,
                    role: 'SEMI_PARENT',
                    graduatedAt: new Date().toISOString(),
                    // Slot #1 only — Slots 2-5 are earned via calculateDynamicSquadCapacity
                    unlockedSlotsCount: 1,
                    activeDirectSquadCount: 0,
                    graduatedProtégésCount: 0
                };
                if (mentorId && !userData.mentorId) updates.mentorId = mentorId;
                if (grandparentMentorId && !userData.grandparentMentorId) updates.grandparentMentorId = grandparentMentorId;

                await db.users.doc(userId).set(updates, { merge: true });
                Object.assign(userData, updates);
                logger.info(`[GRADUATION] User ${userId} graduated to Tier 4 Autonomous Squad Leader! Mentor: ${mentorId}, Grandparent: ${grandparentMentorId}`);

                const cleanPhone = (userData.phoneNumber || userId.split('@')[0]).replace(/\D/g, '');
                const gradNotice = `✦ Clarion OS\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `👑 SQUAD LEADERSHIP UNLOCKED!\n\n` +
                    `Congratulations, ${userData.name || 'Partner'}!\n` +
                    `You have reached Tier 4 (₦${balance.toLocaleString()} float & ${orders} orders).\n\n` +
                    `Your store is now an Autonomous Squad Leader:\n` +
                    `• 4X Maximum Multiplier Active\n` +
                    `• Squad Slot #1 Unlocked 🎯\n\n` +
                    `📈 Unlock more slots by coaching your mentee to 5+ sales!\n` +
                    `📱 Live Dashboard: https://hub.clarion.ng/p/${cleanPhone}\n\n` +
                    `👉 Reply *SUGGEST [Phone] [Name]* to onboard your first squad member!\n` +
                    `👉 Reply *SQUAD* to view your squad command center.`;

                try {
                    const smModule = await import('../bot/SessionManager.js');
                    const sm = smModule.default || smModule.sessionManager;
                    if (sm && typeof sm.sendProxyCustomerMessage === 'function') {
                        await sm.sendProxyCustomerMessage(userId, userId, gradNotice);
                    }
                } catch (e) {
                    logger.warn(`Failed to dispatch graduation alert to ${userId}: ${e.message}`);
                }

                // Notify mentor about slot liberation & lifetime royalties
                if (mentorId && !isSuperParent(mentorId)) {
                    const mentorNotice = `✦ Clarion OS\n` +
                        `━━━━━━━━━━━━━━\n` +
                        `🎉 SQUAD LEADER GRADUATION!\n\n` +
                        `Your protégé ${userData.name || 'Partner'} (+${cleanPhone}) has scaled to Tier 4!\n\n` +
                        `✨ What this means for you:\n` +
                        `• Slot Liberated: Your active slot has been FREED (+1 open)!\n` +
                        `• 10% Lifetime Royalty on all their personal sales.\n` +
                        `• 5% Senior Royalty on all sales made by their squad.\n\n` +
                        `👉 Reply *SQUAD* to inspect your live network.`;

                    try {
                        const smModule = await import('../bot/SessionManager.js');
                        const sm = smModule.default || smModule.sessionManager;
                        if (sm && typeof sm.sendProxyCustomerMessage === 'function') {
                            await sm.sendProxyCustomerMessage(mentorId, mentorId, mentorNotice);
                        }
                    } catch (e) {
                        logger.warn(`Failed to dispatch slot liberation alert to mentor ${mentorId}: ${e.message}`);
                    }
                }

                return { graduated: true, userId, mentorId, grandparentMentorId };
            }
        } catch (err) {
            logger.error(`Error in checkAndTriggerSquadGraduation for ${userId}: ${err.message}`);
        }
        return null;
    }

    /**
     * Checks squad downline sales velocity and fires push alerts when a leader
     * unlocks a new squad slot (Slots 2-5 via Mentorship Mastery Ladder).
     * Called after every squad mentee sale.
     */
    async checkAndTriggerSquadSlotMilestone(leaderId) {
        if (!db.users || !leaderId || isSuperParent(leaderId)) return null;

        try {
            const leaderDoc = await db.users.doc(leaderId).get();
            if (!leaderDoc.exists) return null;
            const leaderData = leaderDoc.data();
            if (!leaderData.isGraduatedSquadLeader) return null;

            // Fetch all active mentees (ungraduated)
            const squadSnap = await db.users
                .where('mentorId', '==', leaderId)
                .where('isGraduatedSquadLeader', '==', false)
                .get();
            const squadMentees = squadSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

            const newCapacity = calculateDynamicSquadCapacity(leaderData, squadMentees);
            const previousUnlocked = leaderData.unlockedSlotsCount || 1;

            if (newCapacity.capacity > previousUnlocked) {
                // New slot unlocked! Persist the new count
                await db.users.doc(leaderId).set({
                    unlockedSlotsCount: newCapacity.capacity
                }, { merge: true });

                logger.info(`[SLOT_UNLOCK] Leader ${leaderId} unlocked Squad Slot #${newCapacity.capacity}!`);

                const slotNames = ['', 'Tier 4 Pioneer', 'Active Mentor', 'Squad Builder', 'Senior Captain', 'Master Director'];
                const slotTitles = ['', '1st', '2nd', '3rd', '4th', '5th'];
                const nextSlot = newCapacity.capacity;

                const alert = `✦ Clarion OS\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `🎉 SQUAD SLOT #${nextSlot} UNLOCKED!\n\n` +
                    `Congratulations, ${leaderData.name || 'Leader'}!\n` +
                    `Your ${slotTitles[nextSlot]} squad slot is now active.\n\n` +
                    `🏅 Title Earned: *${slotNames[nextSlot] || 'Squad Director'}*\n` +
                    `👥 Active Capacity: ${leaderData.activeDirectSquadCount || 0} / ${nextSlot} Slots\n\n` +
                    (newCapacity.capacity < 5
                        ? `📈 Next Unlock: ${newCapacity.nextMilestone}\n\n`
                        : `👑 MAXIMUM SQUAD CAPACITY REACHED!\n\n`) +
                    `👉 Reply *SUGGEST [Phone] [Name]* to fill your new slot!\n` +
                    `👉 Reply *SQUAD* for your full squad view.`;

                try {
                    const smModule = await import('../bot/SessionManager.js');
                    const sm = smModule.default || smModule.sessionManager;
                    if (sm && typeof sm.sendProxyCustomerMessage === 'function') {
                        await sm.sendProxyCustomerMessage(leaderId, leaderId, alert);
                    }
                } catch (e) {
                    logger.warn(`Failed to dispatch slot unlock alert to ${leaderId}: ${e.message}`);
                }

                return { slotUnlocked: nextSlot, leaderId };
            }
        } catch (err) {
            logger.error(`Error in checkAndTriggerSquadSlotMilestone for ${leaderId}: ${err.message}`);
        }
        return null;
    }
}

const walletService = new WalletService();

/**
 * Evaluates the dynamic unlocked squad capacity for a Tier 4 leader.
 * Based on downline sales velocity and wallet depth.
 * Exported standalone for use in ProxyBot.js, server.js, ProxyDashboard.tsx.
 *
 * @param {object} user - User document data (must include walletBalance, metrics, uid/phoneNumber)
 * @param {Array}  squadMentees - Array of ungraduated squad mentee docs
 * @returns {{ capacity, totalSquadOrders, maxSingleMenteeOrders, hasTier2Mentee, nextMilestone, progressPercent }}
 */
export function calculateDynamicSquadCapacity(user, squadMentees = []) {
    if (!user) return { capacity: 0, nextMilestone: 'No user data', progressPercent: 0 };
    if (isSuperParent(user.uid || user.phoneNumber || '')) {
        return { capacity: 80, nextMilestone: null, progressPercent: 100, totalSquadOrders: 0, maxSingleMenteeOrders: 0, hasTier2Mentee: false };
    }

    const walletBal = Number(user.walletBalance) || 0;
    const personalOrders = user.metrics?.totalOrders || 0;

    // Tier 4 Gate: must have ₦6,000 float + 10 sales
    if (walletBal < 6000 || personalOrders < 10) {
        const floatProgress = Math.min(100, Math.round((walletBal / 6000) * 50));
        const orderProgress = Math.min(100, Math.round((personalOrders / 10) * 50));
        return {
            capacity: 0,
            totalSquadOrders: 0,
            maxSingleMenteeOrders: 0,
            hasTier2Mentee: false,
            nextMilestone: `Reach Tier 4: ₦${(6000 - walletBal).toLocaleString()} more float + ${Math.max(0, 10 - personalOrders)} more sales`,
            progressPercent: floatProgress + orderProgress
        };
    }

    // Aggregate downline metrics from active (ungraduated) mentees
    let totalSquadOrders = 0;
    let maxSingleMenteeOrders = 0;
    let hasTier2Mentee = false;

    for (const m of squadMentees) {
        const o = m.metrics?.totalOrders || 0;
        totalSquadOrders += o;
        if (o > maxSingleMenteeOrders) maxSingleMenteeOrders = o;
        if ((m.walletBalance || 0) >= 2000) hasTier2Mentee = true;
    }

    // Mentorship Mastery Ladder (progressive slot unlock)
    let capacity = 1; // Slot 1 granted on Tier 4 graduation
    let nextMilestone = `1st mentee completes 5 sales (currently ${maxSingleMenteeOrders}/5)`;
    let progressPercent = 20; // 1/5 slots = 20%

    if (maxSingleMenteeOrders >= 5) {
        capacity = 2;
        nextMilestone = `Combined squad orders hit 15 (currently ${totalSquadOrders}/15)`;
        progressPercent = 40;
    }
    if (totalSquadOrders >= 15) {
        capacity = 3;
        nextMilestone = `Combined squad orders hit 30 + ₦8,000 float (currently ${totalSquadOrders}/30, ₦${walletBal.toLocaleString()}/₦8,000)`;
        progressPercent = 60;
    }
    if (totalSquadOrders >= 30 && walletBal >= 8000) {
        capacity = 4;
        nextMilestone = `Combined squad orders hit 50 OR 1 mentee reaches Tier 2 (₦2,000 float) (${totalSquadOrders}/50)`;
        progressPercent = 80;
    }
    if (totalSquadOrders >= 50 || hasTier2Mentee) {
        capacity = 5;
        nextMilestone = '👑 MAXIMUM SQUAD CAPACITY (5 Slots)';
        progressPercent = 100;
    }

    return {
        capacity,
        totalSquadOrders,
        maxSingleMenteeOrders,
        hasTier2Mentee,
        nextMilestone,
        progressPercent
    };
}

export async function checkAndTriggerSquadGraduation(userId, currentWalletBal = null, totalOrders = null) {
    return await walletService.checkAndTriggerSquadGraduation(userId, currentWalletBal, totalOrders);
}
export default walletService;
