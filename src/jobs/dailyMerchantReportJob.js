import cron from 'node-cron';
import { db } from '../services/firebase.js';
import { logger } from '../config/env.js';
import sessionManager from '../bot/SessionManager.js';

/**
 * Daily 9:00 PM Merchant Rundown Job
 * Iterates through all active MANUAL_MERCHANT users, calculates daily performance,
 * generates an ASCII weekly visual graph, dynamic coach tip, and live dashboard link.
 */
export async function runDailyMerchantReport() {
  logger.info('[DAILY-MERCHANT-JOB] Starting 9:00 PM Daily Merchant Rundown...');

  if (!db || !db.users) {
    logger.warn('[DAILY-MERCHANT-JOB] Firestore db.users not available. Skipping job.');
    return;
  }

  try {
    const merchantsSnap = await db.users.where('role', '==', 'MANUAL_MERCHANT').get();
    if (merchantsSnap.empty) {
      logger.info('[DAILY-MERCHANT-JOB] No MANUAL_MERCHANT users found.');
      return;
    }

    const today = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = dayNames[today.getDay()];
    const dateFormatted = today.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    // Compute start of current week (Monday at 00:00:00)
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
    const distToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - distToMon);
    const startOfWeekISO = startOfWeek.toISOString();

    const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (const doc of merchantsSnap.docs) {
      const merchant = doc.data();
      const userJid = merchant.phoneJid || merchant.uid || `${merchant.phoneNumber}@s.whatsapp.net`;
      if (!userJid || merchant.dailyReportEnabled === false) continue;

      const brand = merchant.franchiseName || merchant.name || 'Your Store';
      const cleanPhone = (merchant.phoneNumber || userJid.split('@')[0]).replace(/\D/g, '');
      const walletBalance = Number(merchant.walletBalance || 0);
      const isDev = process.env.NODE_ENV !== 'production';
      const dashboardUrl = isDev ? `http://localhost:3000/p/${cleanPhone}` : `https://hub.clarion.ng/p/${cleanPhone}`;

      // Query sales for this week from user's orders subcollection
      let todaySalesCount = 0;
      let todayEarnings = 0;
      let topPlanName = 'MTN 1GB 30-Day';

      // Daily earnings breakdown for the week: index 0 (Mon) -> 6 (Sun)
      const weeklyDailyEarnings = [0, 0, 0, 0, 0, 0, 0];

      try {
        const weekOrdersSnap = await db.users.doc(userJid).collection('orders')
          .where('createdAt', '>=', startOfWeekISO)
          .get();

        if (!weekOrdersSnap.empty) {
          weekOrdersSnap.forEach(oDoc => {
            const oData = oDoc.data();
            const profit = Number(oData.profit || oData.earnings || 0);
            const orderDateStr = oData.createdAt;

            if (orderDateStr) {
              const oDate = new Date(orderDateStr);
              const oDay = oDate.getDay();
              const oIdx = oDay === 0 ? 6 : oDay - 1;
              if (oIdx >= 0 && oIdx < 7) {
                weeklyDailyEarnings[oIdx] += profit;
              }
            }

            if (orderDateStr && orderDateStr >= startOfToday) {
              todaySalesCount++;
              todayEarnings += profit;
              if (oData.planName) topPlanName = oData.planName;
            }
          });
        }
      } catch (qErr) {
        // Fallback: check today's totalSales / lastSaleAt on root doc
        if (merchant.lastSaleAt && merchant.lastSaleAt >= startOfToday) {
          todaySalesCount = Number(merchant.todaySales || 0);
          todayEarnings = Number(merchant.todayEarnings || 0);
        }
      }

      // Build real dynamic weekly visualization
      let maxDayEarn = Math.max(...weeklyDailyEarnings, 1);
      const todayIdx = distToMon;
      let weekDisplayLines = [];

      for (let i = 0; i <= todayIdx; i++) {
        const dayLabel = weekDayLabels[i];
        const dayEarn = weeklyDailyEarnings[i];
        const isCurrentDay = i === todayIdx;

        let bar = '░░░░░░░';
        if (dayEarn > 0) {
          const filledCount = Math.min(7, Math.max(1, Math.round((dayEarn / maxDayEarn) * 7)));
          bar = '▓'.repeat(filledCount) + '░'.repeat(7 - filledCount);
        }

        const todayTag = isCurrentDay ? ' ← today' : '';
        weekDisplayLines.push(`   ${dayLabel} ${bar} ₦${dayEarn.toLocaleString()}${todayTag}`);
      }

      const weeklyVisualizationText = `📅 *This Week so far:*\n` + weekDisplayLines.join('\n');

      const cdsContribution = +(todayEarnings * 0.10).toFixed(2);
      const tierLabel = walletBalance >= 6000 ? '4X MAX 🔥' : walletBalance >= 4000 ? '3X' : walletBalance >= 2000 ? '2X' : '1X';

      let reportMsg = '';

      if (todaySalesCount > 0) {
        // Active Sales State
        reportMsg = `📊 *${brand} — Daily Summary*\n` +
          `📅 ${dateFormatted}\n` +
          `──────────────\n` +
          `💰 *Today's Earnings:*    ₦${todayEarnings.toLocaleString()}\n` +
          `📦 *Orders Fulfilled:*    ${todaySalesCount}\n` +
          `🌍 *CDS Contribution:*    ₦${cdsContribution.toLocaleString()} (platform 10% → community)\n` +
          `──────────────\n` +
          `🏆 *Top Plan:* ${topPlanName} (${todaySalesCount} sales)\n` +
          `📈 *Your Tier:* ${tierLabel} · *Wallet:* ₦${walletBalance.toLocaleString()}\n` +
          `──────────────\n` +
          `💡 *Tonight's Coach Tip:*\n` +
          `You sold ${todaySalesCount} order(s) today — great momentum! Evening hours (7–10 PM) are prime time for data buyers. Post your evening status drop before 7 PM tomorrow to catch customers early. ⏰\n\n` +
          `${weeklyVisualizationText}\n` +
          `──────────────\n` +
          `📱 *Live Mobile Dashboard (Zero Password):*\n` +
          `👉 ${dashboardUrl}\n\n` +
          `Reply *HISTORY* to see all orders\n` +
          `Reply *WITHDRAW* to cash out\n` +
          `Reply *MTN PLANS* to get tomorrow's price card ready\n` +
          `_Keep minting! Clarion AI 💚_`;
      } else {
        // Empty State (0 Sales Today)
        reportMsg = `📊 *${brand} — Daily Summary*\n` +
          `📅 ${dateFormatted}\n` +
          `──────────────\n` +
          `📦 *Orders Fulfilled:*    0\n` +
          `💰 *Today's Earnings:*    ₦0.00\n` +
          `💼 *Clarion Wallet:*      ₦${walletBalance.toLocaleString()} (${tierLabel} Active)\n` +
          `──────────────\n` +
          `💡 *Coach Tip:*\n` +
          `No sales recorded today, but tomorrow is a fresh opportunity!\n` +
          `Mornings and evenings are high-traffic data windows.\n` +
          `Post your price card tomorrow morning at 8:30 AM to catch early recharges. ⏰\n\n` +
          `${weeklyVisualizationText}\n` +
          `──────────────\n` +
          `📱 *Live Mobile Dashboard (Zero Password):*\n` +
          `👉 ${dashboardUrl}\n\n` +
          `Reply *MTN PLANS* to get your forwardable card ready!\n` +
          `_Tomorrow we go again! Clarion AI 💚_`;
      }

      try {
        if (sessionManager.motherSock) {
          await sessionManager.motherSock.sendMessage(userJid, { text: reportMsg });
        }
      } catch (sErr) {
        logger.warn(`[DAILY-MERCHANT-JOB] Failed to send report to ${userJid}: ${sErr.message}`);
      }
    }
  } catch (err) {
    logger.error(`[DAILY-MERCHANT-JOB] Error in runDailyMerchantReport: ${err.message}`);
  }
}

/**
 * Initializes cron schedule for 9:00 PM everyday (21:00 Africa/Lagos)
 */
export function initDailyMerchantReportJob() {
  // Runs at 21:00 (9:00 PM) everyday Lagos time
  cron.schedule('0 21 * * *', async () => {
    logger.info('[DAILY-MERCHANT-JOB] Triggered 9:00 PM Daily Merchant Report Schedule.');
    await runDailyMerchantReport();
  }, { timezone: 'Africa/Lagos' });
  logger.info('[DAILY-MERCHANT-JOB] Scheduled Daily Merchant Report Job at 21:00 everyday.');
}

export default {
  runDailyMerchantReport,
  initDailyMerchantReportJob
};

