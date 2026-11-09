import cron from 'node-cron';
import admin, { db } from '../services/firebase.js';
import { config, logger } from '../config/env.js';
import wallet from '../services/WalletService.js';
import sessionManager from '../bot/SessionManager.js';

/**
 * Calculates today's start and end timestamps (Lagos time).
 */
function getTodayRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return {
        startIso: start.toISOString(),
        endIso: end.toISOString()
    };
}

/**
 * Calculates current week's start timestamp (Thursday to Wednesday cycle).
 */
function getWeekRange() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
        startIso: sevenDaysAgo.toISOString(),
        endIso: now.toISOString()
    };
}

/**
 * Aggregates daily wallet performance metrics for a proxy.
 */
export async function getDailyWalletYield(userId) {
    if (!db.ledger) return null;

    const { startIso } = getTodayRange();
    const balance = await wallet.getBalance(userId);

    let ordersCoFunded = 0;
    let dailyProfit = 0;

    try {
        const snap = await db.ledger
            .where('userId', '==', userId)
            .where('status', '==', 'COMPLETED')
            .where('createdAt', '>=', startIso)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            ordersCoFunded++;
            dailyProfit += data.settlement?.coMemberShare || 0;
        });
    } catch (err) {
        logger.warn(`Could not query daily ledger for ${userId}: ${err.message}`);
    }

    const startingBalance = +(Math.max(0, balance - dailyProfit)).toFixed(2);
    const roiPercent = startingBalance > 0
        ? +((dailyProfit / startingBalance) * 100).toFixed(1)
        : (dailyProfit > 0 ? 100 : 0);

    const tier = wallet.getMultiplierTier(balance);
    const proxyStatus = `Tier ${tier.level} (${tier.multiplier} Multiplier Active)`;

    return {
        startingBalance,
        ordersCoFunded,
        dailyProfit: +dailyProfit.toFixed(2),
        roiPercent,
        proxyStatus,
        withdrawableBalance: balance,
        tier
    };
}

/**
 * Aggregates weekly performance and pre-cashout metrics for Wednesday evening summary.
 */
export async function getWeeklyCashoutPreview(userId, userDoc = {}) {
    if (!db.ledger) return null;

    const { startIso } = getWeekRange();
    const balance = await wallet.getBalance(userId);

    let totalOrders = 0;
    let directSales = 0;
    let directProfit = 0;
    let squadOverrides = 0;
    let squadProfit = 0;

    try {
        const snap = await db.ledger
            .where('userId', '==', userId)
            .where('status', '==', 'COMPLETED')
            .where('createdAt', '>=', startIso)
            .get();

        snap.forEach(doc => {
            const data = doc.data();
            totalOrders++;
            const share = data.settlement?.coMemberShare || 0;
            if (data.type === 'SQUAD_LEADER_OVERRIDE' || data.type === 'REFERRAL_PARENT_EARNING') {
                squadOverrides++;
                squadProfit += share;
            } else {
                directSales++;
                directProfit += share;
            }
        });
    } catch (err) {
        logger.warn(`Could not query weekly ledger for ${userId}: ${err.message}`);
    }

    const totalWeeklyEarnings = +(directProfit + squadProfit).toFixed(2);
    const bank = userDoc.bankDetails;
    let maskedBank = 'No Bank Connected (Reply BANK to link)';
    if (bank && bank.verified) {
        const acct = String(bank.accountNumber || '');
        const masked = acct.length >= 4 ? `••••${acct.slice(-4)}` : acct;
        maskedBank = `${bank.bankName} (${masked})`;
    }

    return {
        totalOrders,
        directSales,
        directProfit: +directProfit.toFixed(2),
        squadOverrides,
        squadProfit: +squadProfit.toFixed(2),
        totalWeeklyEarnings,
        availableCashout: balance,
        maskedBank,
        hasVerifiedBank: Boolean(bank?.verified)
    };
}

/**
 * Starts the Daily 8:00 PM Wallet Yield Report and Wednesday Pre-Cashout Summary CRON jobs.
 */
export function startWalletYieldReportJob() {
    if (config.mockMode && process.env.TEST_CRON !== 'true') {
        logger.info('Skipping Wallet Yield CRON jobs in mock mode (set TEST_CRON=true to override).');
        return;
    }

    // ── 1. Daily 8:00 PM Report (0 20 * * *) ──
    cron.schedule('0 20 * * *', async () => {
        logger.info('Starting Daily Wallet Yield Report job at 8:00 PM Lagos Time...');

        if (!db.users) return;

        try {
            const sock = sessionManager.motherSock;
            const usersSnap = await db.users.where('state', 'in', ['COMPLETED', 'PAIRED']).get();

            for (const doc of usersSnap.docs) {
                const userId = doc.id;
                const userData = doc.data();
                const userName = userData.name || userData.verifiedName || 'Partner';

                const yieldData = await getDailyWalletYield(userId);
                if (!yieldData) continue;

                // Send report if user has active balance or transactions today
                if (yieldData.withdrawableBalance > 0 || yieldData.ordersCoFunded > 0) {
                    const filledBars = Math.min(10, Math.floor((yieldData.withdrawableBalance / 6000) * 10));
                    const emptyBars = Math.max(0, 10 - filledBars);
                    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
                    const totalSales = userData.metrics?.totalOrders || yieldData.ordersCoFunded || 0;

                    const tierProgressText = yieldData.tier.level < 4
                        ? `Add ₦${yieldData.tier.neededForNext.toLocaleString()} float to reach the next tier and boost your earning power!`
                        : `Maximum 4X Multiplier power active on all customer sales.`;

                    const cleanPhone = String(userData.phoneNumber || userId.split('@')[0] || '').replace(/\D/g, '');
                    const dashboardLink = cleanPhone ? `\n\n📱 *Live Mobile Dashboard (Zero Password):*\n👉 https://hub.clarion.ng/p/${cleanPhone}` : '';

                    const msg = `✦ Daily Portfolio Digest\n` +
                        `━━━━━━━━━━━━━━━━━━━━━\n` +
                        `${userName} · Performance Summary\n\n` +
                        `✦ Today's Output: ${yieldData.ordersCoFunded} Order${yieldData.ordersCoFunded === 1 ? '' : 's'} Completed\n` +
                        `✦ Net Yield Earned: +₦${yieldData.dailyProfit.toLocaleString()}\n\n` +
                        `Wallet Liquidity:\n` +
                        `[${progressBar}] ₦${yieldData.withdrawableBalance.toLocaleString()}\n` +
                        `Active Status: ${yieldData.tier.name} (${yieldData.tier.multiplier} Power)\n\n` +
                        `${tierProgressText}\n\n` +
                        `✦ Wholesale Privilege:\n` +
                        `Your wallet balance gives you wholesale discounts matching your Multiplier when you buy data for yourself.\n\n` +
                        `👉 Reply *FUND* to level up your Earning Power.\n` +
                        `👉 Reply *SQUAD* to inspect your 5-partner network roadmap.` +
                        `${dashboardLink}`;

                    try {
                        const targetSock = sessionManager.sessions.get(userId) || sock;
                        if (targetSock) {
                            await targetSock.sendMessage(userId, { text: msg });
                            logger.info(`Daily yield report sent to ${userId}`);
                        }
                    } catch (sendErr) {
                        logger.warn(`Failed to send daily yield report to ${userId}: ${sendErr.message}`);
                    }
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        } catch (err) {
            logger.error('Error during daily wallet yield report job:', err.message);
        }
    }, {
        timezone: "Africa/Lagos"
    });

    // ── 2. Wednesday 8:00 PM Pre-Cashout Summary (0 20 * * 3) ──
    cron.schedule('0 20 * * 3', async () => {
        logger.info('Starting Wednesday Pre-Cashout Summary job at 8:00 PM Lagos Time...');

        if (!db.users) return;

        try {
            const sock = sessionManager.motherSock;
            const usersSnap = await db.users.where('state', 'in', ['COMPLETED', 'PAIRED']).get();

            for (const doc of usersSnap.docs) {
                const userId = doc.id;
                const userData = doc.data();

                const preview = await getWeeklyCashoutPreview(userId, userData);
                if (!preview) continue;

                if (preview.availableCashout >= 2000 || preview.totalWeeklyEarnings > 0) {
                    const bankWarning = !preview.hasVerifiedBank
                        ? `\n⚠️ *Action Required:* You have not connected your bank details yet! Reply *BANK 0123456789 GTBank* right now so you can cash out tomorrow morning.\n`
                        : '';

                    const cleanPhone = String(userData.phoneNumber || userId.split('@')[0] || '').replace(/\D/g, '');
                    const dashboardLink = cleanPhone ? `\n\n📱 *Manage Cashout on Dashboard:*\n👉 https://hub.clarion.ng/p/${cleanPhone}` : '';

                    const msg = `✦ Clarion Treasury Notice\n` +
                        `━━━━━━━━━━━━━━━━━━━━━\n` +
                        `The weekly cashout window opens tomorrow, Thursday at 12:00 AM!\n\n` +
                        `✦ Withdrawable Balance: ₦${preview.availableCashout.toLocaleString()}\n` +
                        `✦ Linked Bank: ${preview.maskedBank}\n\n` +
                        `This Week's Output:\n` +
                        `• Total Orders: ${preview.totalOrders} Sales\n` +
                        `• Total Yield Generated: ₦${preview.totalWeeklyEarnings.toLocaleString()}\n\n` +
                        `💡 Capital Strategy Choice:\n` +
                        `• Keep your funds active in your wallet to continue earning at your Multiplier Power on every sale and enjoy wholesale data discounts.\n` +
                        `• Or withdraw your earnings to your bank starting tomorrow at 12:00 AM by replying *WITHDRAW*.\n` +
                        `${bankWarning}\n` +
                        `_Clarion automated cashout fee: ₦100 Flat (₦50 Paystack + ₦50 Platform)._` +
                        `${dashboardLink}`;

                    try {
                        const targetSock = sessionManager.sessions.get(userId) || sock;
                        if (targetSock) {
                            await targetSock.sendMessage(userId, { text: msg });
                            logger.info(`Wednesday pre-cashout summary sent to ${userId}`);
                        }
                    } catch (sendErr) {
                        logger.warn(`Failed to send Wednesday cashout preview to ${userId}: ${sendErr.message}`);
                    }
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        } catch (err) {
            logger.error('Error during Wednesday cashout preview job:', err.message);
        }
    }, {
        timezone: "Africa/Lagos"
    });

    logger.info('Wallet Yield and Pre-Cashout CRON jobs successfully scheduled (Africa/Lagos).');
}

