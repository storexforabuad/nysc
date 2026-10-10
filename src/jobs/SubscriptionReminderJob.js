import cron from 'node-cron';
import { db } from '../services/firebase.js';
import { config, logger } from '../config/env.js';
import sessionManager from '../bot/SessionManager.js';
import wallet from '../services/WalletService.js';

export async function checkSubscriptionReminders() {
  if (!db.users) {
    logger.warn('[SUB-REMINDER] Firestore users collection not available.');
    return;
  }

  const sock = sessionManager.motherSock;
  if (!sock) {
    logger.warn('[SUB-REMINDER] MotherBot session not active. Skipping check.');
    return;
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const usersSnap = await db.users.where('state', 'in', ['COMPLETED', 'PAIRED']).get();

    for (const doc of usersSnap.docs) {
      const user = doc.data();
      const userId = doc.id;
      const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
      const sub = user.subscription;

      if (!sub || !sub.expiresAt) continue;

      const expDate = new Date(sub.expiresAt);
      const diffMs = expDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const tier = String(user.partnershipTier || user.donationTier || 'MEMBER').toUpperCase();
      const isLord = tier === 'LORD';

      // Avoid double sending on the same day for the same milestone
      const reminderHistory = user.reminderHistory || {};
      const milestoneKey = `${todayStr}_d${daysLeft}`;
      if (reminderHistory[milestoneKey]) continue;

      // Calculate partner performance stats
      let ordersCount = 0;
      let totalRevenue = 0;
      if (db.ledger) {
        try {
          const ordersSnap = await db.ledger
            .where('userId', '==', userId)
            .where('status', '==', 'COMPLETED')
            .get();
          ordersCount = ordersSnap.size;
          ordersSnap.forEach(oDoc => {
            totalRevenue += Number(oDoc.data().amount || 0);
          });
        } catch (e) {
          logger.warn(`[SUB-REMINDER] Could not load ledger stats for ${userId}: ${e.message}`);
        }
      }

      const hoursSaved = +( (ordersCount * 6) / 60 ).toFixed(1);
      const debtSaved = Math.round(totalRevenue * 0.25);
      const partnerName = user.verifiedName || user.name || 'Partner';
      const brandName = user.brandName || ('Clarion AI - ' + partnerName);
      const walletBalance = await wallet.getBalance(userId);

      let msgText = null;

      // ── Cohort 1: Standard 14-Day Free Trial (MEMBER / MASTER / PIONEER) ──
      if (!isLord) {
        if (daysLeft === 7) {
          // Touchpoint 1: Day 7 Midpoint Insights
          msgText = `⚡ *WEEK 1 AI PERFORMANCE REPORT*\n` +
            `──────────────\n\n` +
            `👋 *${partnerName}*, your AI Autopilot has been running for 7 days!\n\n` +
            `Here is your 7-day automated retail summary for *${brandName}*:\n\n` +
            `· 📦 *${ordersCount} orders* vended automatically\n` +
            `· 💰 *₦${totalRevenue.toLocaleString()}* total sales processed\n` +
            `· ⏰ *${hoursSaved} hours* of manual chatting saved\n` +
            `· 🛡️ *₦${debtSaved.toLocaleString()}* in zero-credit sales enforced\n\n` +
            `_You still have 7 full days remaining on your free trial._ No action needed today—just watching your business run on autopilot!\n\n` +
            `──────────────\n` +
            `👉 Reply *MODE* anytime to review your bot controls.`;
        } else if (daysLeft === 2) {
          // Touchpoint 2: Day 12 (48 Hours Notice & The Contrast Pitch)
          msgText = `⏳ *48 HOURS REMAINING*\n` +
            `──────────────\n\n` +
            `👋 *${partnerName}*, your 2-week free trial for *${brandName}* ends in 2 days.\n\n` +
            `*What happens when trial ends?*\n` +
            `Without renewal, your bot switches to manual mode. That means:\n` +
            `· You must reply to every customer manually\n` +
            `· Customers will ask for data on credit ("I'll pay later")\n` +
            `· Late-night sales will be missed while you sleep\n\n` +
            `*The AI Difference (Your 12-Day Stats):*\n` +
            `· ⚡ *${ordersCount} orders* completed instantly\n` +
            `· 💰 *₦${totalRevenue.toLocaleString()}* earned with 0 manual effort\n` +
            `· ⏱️ *${hoursSaved} hours* saved\n\n` +
            `*Keep Autopilot Running:*\n` +
            `Subscription is just *₦950/month* (less than ₦32/day).\n\n` +
            `──────────────\n` +
            `👉 Reply *RENEW* to enable renewal from wallet balance (Current Balance: *₦${walletBalance.toFixed(2)}*).`;
        } else if (daysLeft === 1) {
          // Touchpoint 3: Day 14 (12h Final Countdown)
          const hasFunds = walletBalance >= 950;
          msgText = `🚨 *FREE TRIAL ENDS TODAY*\n` +
            `──────────────\n\n` +
            `👋 *${partnerName}*, your AI Autopilot subscription expires in *12 hours*.\n\n` +
            `· Current Wallet Balance: *₦${walletBalance.toFixed(2)}*\n` +
            `· Monthly Renewal Fee: *₦950*\n\n` +
            (hasFunds
              ? `✅ *You have sufficient funds!* Your bot will seamlessly auto-renew without interruption.`
              : `💡 *Notice:* Active bots with customer sales automatically renew on credit so your storefront never goes down!`) +
            `\n\n──────────────\n` +
            `👉 Reply *MODE* to view bot controls.\n` +
            `👉 Reply *BALANCE* to check earnings.`;
        } else if (daysLeft <= 0) {
          // Expired: Process Smart Credit Renewal or Grace Pause
          if (ordersCount >= 2) {
            // Active Bot: Renew on Credit!
            const newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            await wallet.recordPurchaseDebit(userId, 950, 'Monthly AI Autopilot Renewal (Credit)', { isCreditRenewed: true });
            
            await db.users.doc(userId).set({
              botMode: 'autonomous',
              subscription: {
                plan: 'MONTHLY',
                price: 950,
                durationDays: 30,
                startedAt: now.toISOString(),
                expiresAt: newExpiry.toISOString(),
                autoRenew: true,
                isCreditRenewed: true
              }
            }, { merge: true });

            msgText = `⚡ *AI AUTOPILOT RENEWED ON CREDIT!*\n` +
              `──────────────\n\n` +
              `👋 *${partnerName}*, your 2-week free trial has completed.\n\n` +
              `Because *${brandName}* is an active digital storefront, we’ve auto-renewed your subscription on credit so you don't miss a single customer sale!\n\n` +
              `· Subscription Fee: *₦950/month*\n` +
              `· Previous Balance: *₦${walletBalance.toFixed(2)}*\n` +
              `· Current Balance: *₦${(walletBalance - 950).toFixed(2)}*\n\n` +
              `🚀 *Your bot remains 100% AUTONOMOUS 24/7.* As customers buy data, profits will automatically clear the balance.\n\n` +
              `──────────────\n` +
              `👉 Reply *MODE* to view bot controls.\n` +
              `👉 Reply *BALANCE* to view wallet.`;
          } else {
            // Inactive Bot: Grace pause to manual mode
            await db.users.doc(userId).set({
              botMode: 'manual',
              subscription: { ...sub, status: 'EXPIRED' }
            }, { merge: true });

            msgText = `⏸️ *AI AUTOPILOT PAUSED*\n` +
              `──────────────\n\n` +
              `👋 *${partnerName}*, your 2-week free trial for *${brandName}* has ended.\n\n` +
              `Your ProxyBot is currently in *Manual Mode*. Customers can message you, but automated responses are paused.\n\n` +
              `*Reactivate 24/7 Autopilot:*\n` +
              `Renew for just *₦950/month* to resume instant AI responses.\n\n` +
              `──────────────\n` +
              `👉 Reply *UPGRADE* to reactivate Autonomous AI Mode.`;
          }
        }
      }

      // ── Cohort 2: VIP 60-Day Trial (LORD Tier) ──
      else {
        if (daysLeft === 30) {
          msgText = `👑 *LORD TIER: MONTH 1 MILESTONE*\n` +
            `──────────────\n\n` +
            `👋 *${partnerName}*, congratulations on completing Month 1 of your 60-day VIP trial!\n\n` +
            `Here is your 30-day executive performance overview for *${brandName}*:\n\n` +
            `· 📦 *${ordersCount} orders* vended autonomously\n` +
            `· 💰 *₦${totalRevenue.toLocaleString()}* in total transactions\n` +
            `· ⏱️ *${hoursSaved} hours* saved for leadership tasks\n\n` +
            `_You have 30 days remaining on your complimentary LORD trial._\n\n` +
            `──────────────\n` +
            `👉 Reply *MODE* to review your franchise parameters.`;
        } else if (daysLeft === 10) {
          msgText = `👑 *LORD TIER: 10 DAYS REMAINING*\n` +
            `──────────────\n\n` +
            `👋 *${partnerName}*, your 60-day VIP complimentary access for *${brandName}* expires in 10 days.\n\n` +
            `*Your 50-Day Impact:*\n` +
            `· ⚡ *${ordersCount} orders* managed by AI\n` +
            `· 💰 *₦${totalRevenue.toLocaleString()}* total sales generated\n` +
            `· 🛡️ 100% zero-debt automated collection rate\n\n` +
            `To ensure zero downtime for your customers, setup your monthly subscription (*₦950/mo*).\n\n` +
            `──────────────\n` +
            `👉 Reply *RENEW* to secure continuous AI compute.`;
        } else if (daysLeft === 3) {
          msgText = `⏳ *LORD TIER: 3 DAYS REMAINING*\n` +
            `──────────────\n\n` +
            `👋 *${partnerName}*, 72 hours remaining on your LORD VIP trial.\n\n` +
            `· Required for Renewal: *₦950/month*\n` +
            `· Wallet Balance: *₦${walletBalance.toFixed(2)}*\n\n` +
            `──────────────\n` +
            `👉 Reply *RENEW* to authorize monthly continuation.`;
        } else if (daysLeft <= 0) {
          // LORD Expired
          if (ordersCount >= 2) {
            const newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            await wallet.recordPurchaseDebit(userId, 950, 'Monthly AI Autopilot Renewal (Credit)', { isCreditRenewed: true });
            await db.users.doc(userId).set({
              botMode: 'autonomous',
              subscription: {
                plan: 'MONTHLY',
                price: 950,
                durationDays: 30,
                startedAt: now.toISOString(),
                expiresAt: newExpiry.toISOString(),
                autoRenew: true,
                isCreditRenewed: true
              }
            }, { merge: true });

            msgText = `👑 *LORD TIER: AUTOPILOT EXTENDED ON CREDIT*\n` +
              `──────────────\n\n` +
              `👋 *${partnerName}*, your 60-day VIP trial has ended.\n\n` +
              `To preserve your 100% store uptime, we've renewed *${brandName}* on credit for ₦950. Your bot remains fully active!\n\n` +
              `──────────────\n` +
              `👉 Reply *MODE* to review status.`;
          } else {
            await db.users.doc(userId).set({
              botMode: 'manual',
              subscription: { ...sub, status: 'EXPIRED' }
            }, { merge: true });

            msgText = `⏸️ *AI AUTOPILOT PAUSED*\n` +
              `──────────────\n\n` +
              `👋 *${partnerName}*, your 60-day LORD VIP trial has ended. Reply *UPGRADE* anytime to resume 24/7 AI automation for ₦950/month.`;
          }
        }
      }

      if (msgText) {
        await sock.sendMessage(userJid, { text: msgText });
        // Mark milestone sent
        await db.users.doc(userId).set({
          reminderHistory: { ...reminderHistory, [milestoneKey]: true }
        }, { merge: true }).catch(() => {});
        logger.info(`[SUB-REMINDER] Sent ${milestoneKey} reminder to ${userId}`);
      }
    }
  } catch (error) {
    logger.error(`[SUB-REMINDER] Error checking subscription reminders: ${error.message}`);
  }
}

export function startSubscriptionReminderJob() {
  if (config.mockMode && process.env.TEST_CRON !== 'true') {
    logger.info('Skipping Subscription Reminder CRON in mock mode.');
    return;
  }

  // Schedule daily at 9:00 AM WAT
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running daily Subscription Reminder Job...');
    await checkSubscriptionReminders();
  });
}
