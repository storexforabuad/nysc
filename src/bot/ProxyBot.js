import { config, logger } from '../config/env.js';
import admin, { db } from '../services/firebase.js';
import payflex, { calculatePaystackFee } from '../services/payflex.js';
import paystack from '../services/PaystackService.js';
import wallet, { SUBSCRIPTION_PLANS, BOT_MODES } from '../services/WalletService.js';
import sessionManager, { handleOnboardingWizardInput } from './SessionManager.js';
import broadcastQueue from '../services/BroadcastQueue.js';
import { handleMilestoneCheck, CENTRAL_HUB_ACCOUNT } from './MotherBot.js';
import { detectNetwork } from '../utils/networkUtils.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import QRCode from 'qrcode';

// ── In-memory tracking for introduced contacts (resilient offline/mock fallback) ──
const introducedContacts = new Set();

// ── In-memory tracking for awaiting FUND amount (conversational wallet top-up) ──
const awaitingFundMap = new Map();

// ── In-memory tracking for awaiting REDEEM selection (Data Fuel redemption) ──
const awaitingRedeemMap = new Map();

// ── Inbound message rate limiter: 5 messages per 10 seconds per contact ──
const messageLimiter = new RateLimiterMemory({ points: 5, duration: 10 });

// ── BUY command debounce: prevent double-tap within 5 seconds ──
const buyDebounce = new Map();
const BUY_DEBOUNCE_MS = 5000;

export const handleProxyMessage = async (sock, msg, user) => {
  const from = msg.key.remoteJid;

  // Rate limit check
  try {
    await messageLimiter.consume(from);
  } catch (rejRes) {
    logger.warn(`[RATE-LIMIT] Proxy message throttled for ${from}`);
    return;
  }

  // 1. Owner self-chat check & outbound message filter
  const partnerPhoneDigits = String(user.phoneNumber || user.phone || user.uid || '').replace(/[^0-9]/g, '').slice(-10);
  const targetDigits = String(from || '').replace(/[^0-9]/g, '').slice(-10);
  const isSelfChat = !!(partnerPhoneDigits && targetDigits && partnerPhoneDigits === targetDigits);

  // If the message is outgoing from this device (fromMe):
  // Never intercept or process messages sent to external contacts, customers, or Mother Bot!
  // ONLY allow processing if the owner is messaging themselves in a self-chat note ("Message Yourself").
  if (msg.key.fromMe && !isSelfChat) {
    return;
  }

  // 2. Mother Bot isolation: ProxyBot must NEVER process or respond to Mother Bot!
  const cleanFrom = String(from || '').replace(/[^0-9]/g, '');
  const isMotherBot = (user.motherBotJid && from.includes(user.motherBotJid.split('@')[0])) ||
    (user.motherBotLid && from.includes(user.motherBotLid.split('@')[0])) ||
    cleanFrom.endsWith('8119772223') ||
    cleanFrom.includes('161856060690464');

  if (isMotherBot) {
    return;
  }
  const messageContent = msg.message?.ephemeralMessage?.message ||
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.editedMessage?.message ||
    msg.message;

  const text = messageContent?.conversation ||
    messageContent?.extendedTextMessage?.text ||
    messageContent?.text ||
    messageContent?.listResponseMessage?.title ||
    messageContent?.buttonsResponseMessage?.selectedDisplayText ||
    '';
  const pushName = msg.pushName || 'Partner';

  if (!text && !msg.message?.contactMessage && !msg.message?.contactsArrayMessage) return;

  const command = text.toLowerCase().trim();
  const cleanCommand = command.replace(/^\./, '');

  // Handle global opt-out
  if (command === 'stop') {
    await broadcastQueue.setOptOut(user.uid, from);
    return sock.sendMessage(from, { text: '🔕 You have been successfully unsubscribed from Clarion A.I. automated enterprise broadcasts.' });
  }

  try {
    let actionableJid = from;
    if (from.endsWith('@lid')) {
      try {
        const lid = from.split('@')[0];
        const mapping = await sock.authState.keys.get('lid-mapping', [`${lid}_reverse`]);
        if (mapping && mapping[`${lid}_reverse`]) {
          actionableJid = mapping[`${lid}_reverse`];
        }
      } catch (err) {
        logger.warn(`LID Resolution failed for ${from} in Clarion Hub`);
      }
    }

    const cleanActionable = String(actionableJid || '').replace(/[^0-9]/g, '');
    if ((user.motherBotJid && actionableJid.includes(user.motherBotJid.split('@')[0])) ||
        (user.motherBotLid && actionableJid.includes(user.motherBotLid.split('@')[0])) ||
        cleanActionable.endsWith('8119772223') ||
        cleanActionable.includes('161856060690464')) {
      return;
    }

    // Handle universal CANCEL
    if (command === 'cancel' || command === 'exit') {
      if (db.ledger && actionableJid) {
        try {
          const pendingOrders = await db.ledger
            .where('buyerPhone', '==', actionableJid)
            .where('userId', '==', user.uid)
            .where('status', '==', 'AWAITING_PAYMENT')
            .limit(5)
            .get();
          const batch = db.ledger.firestore.batch();
          pendingOrders.forEach(doc => batch.update(doc.ref, { status: 'CANCELLED' }));
          if (!pendingOrders.empty) await batch.commit();
        } catch (e) {
          logger.warn(`Failed to cancel pending orders for ${actionableJid}: ${e.message}`);
        }
      }

      return sock.sendMessage(from, {
        text: '❌ Order cancelled. No charge made.\n\nType *DATA* anytime you need data! 📶'
      });
    }

    // Command regexes (used by first-touch gate and command routers)
    const isDataAndPriceLiteral = /^\.?data\s*(?:and|\+|&)?\s*(?:price|prices|pricing|plans)$/i.test(command);
    const dataCommandRegex = /^\.?data(?:\s*\+?\s*(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
    const dataPriceMatch = command.match(dataCommandRegex);
    // MTN and GLO keywords act as network-filtered DATA aliases
    const isMtnAlias = /^\.?mtn$/i.test(command);
    const isGloAlias = /^\.?glo$/i.test(command);
    const isDataMatch = isDataAndPriceLiteral || !!dataPriceMatch || isMtnAlias || isGloAlias;
    const cardCommandRegex = /^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
    const pinCommandRegex = /^\.?pin(?:\s+(waec|neco))?$/i;
    const fundCommandRegex = /^\.?fund(?:\s+(\d+))?$/i;
    const isFundMatch = fundCommandRegex.test(command) || (awaitingFundMap.has(`${user.uid}_${actionableJid}`) && /^\d+$/.test(command));

    // Ensure in-memory user has latest approval/mode state
    if (user.terminalApproved === undefined || user.terminalApproved === null) user.terminalApproved = true;
    if (!user.botMode) user.botMode = BOT_MODES.AUTONOMOUS;

    // If store is completed or paired, guarantee approved autonomous mode
    if (user.state === 'COMPLETED' || user.pairedAt || user.virtualAccount) {
      user.terminalApproved = true;
      if (!user.botMode || user.botMode === 'manual') {
        user.botMode = BOT_MODES.AUTONOMOUS;
      }
    }

    if (user.terminalApproved !== true || user.botMode !== BOT_MODES.AUTONOMOUS) {
      if (db.users && user?.uid) {
        try {
          const freshDoc = await db.users.doc(user.uid).get();
          if (freshDoc.exists) {
            const freshData = freshDoc.data();
            if (freshData.terminalApproved === true) user.terminalApproved = true;
            if (freshData.botMode) user.botMode = freshData.botMode;
            if (freshData.subscription) user.subscription = freshData.subscription;
            if (freshData.onboardingStep !== undefined) user.onboardingStep = freshData.onboardingStep;
          }
        } catch (e) {}
      }
    }

    // ── Onboarding Wizard Check (ONLY if partner is completing setup in self-chat) ──
    const senderDigits = String(actionableJid || from).replace(/[^0-9]/g, '').slice(-10);
    const isOwner = isSelfChat || (partnerPhoneDigits && senderDigits && partnerPhoneDigits === senderDigits);

    const isWizardKeyword = ['ready', 'next', 'start', 'skip', 'approve'].includes(cleanCommand);
    if (isSelfChat && ((user.onboardingStep !== null && user.onboardingStep !== undefined) || isWizardKeyword)) {
      // If the owner is testing or vending (e.g. DATA, DATA 500, BUY, MENU, FUND), allow command through
      if (!isDataMatch && !command.startsWith('buy ') && command !== 'menu' && !isFundMatch && command !== 'status' && !cardCommandRegex.test(command) && !pinCommandRegex.test(command)) {
        const handled = await handleOnboardingWizardInput(sock, from, user, text);
        if (handled) return;
      }
    }

    // -- Capture/Update Customer Profile --
    if (db.users && actionableJid) {
      try {
        const cleanPhone = actionableJid.split('@')[0];
        await db.users.doc(user.uid).collection('contacts').doc(actionableJid).set({
          phone: cleanPhone,
          pushName: pushName,
          lastInteraction: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {
        logger.warn(`Failed to update customer contacts profile for ${actionableJid}`);
      }
    }

    // ── First-Touch Reassurance Announcement (once per contact in Autonomous mode) ──
    if (!from.endsWith('@g.us') && !isOwner && !isMotherBot && user.botMode === BOT_MODES.AUTONOMOUS && user.announceNewContacts !== false) {
      const contactTrackingKey = `${user.uid}_${actionableJid}`;
      let isIntroduced = introducedContacts.has(contactTrackingKey);
      if (!isIntroduced && db.users && actionableJid) {
        try {
          const contactDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (contactDoc.exists && contactDoc.data().introduced === true) {
            isIntroduced = true;
            introducedContacts.add(contactTrackingKey);
          }
        } catch (e) {}
      }

      if (!isIntroduced) {
        introducedContacts.add(contactTrackingKey);
        // Mark as introduced (idempotent, runs once per contact)
        if (db.users && actionableJid) {
          await db.users.doc(user.uid).collection('contacts').doc(actionableJid).set({
            introduced: true,
            introducedAt: new Date().toISOString()
          }, { merge: true }).catch(() => {});
        }

        const storeName = user.brandName || user.franchiseName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));

        // Natural typing delay (1.2–2.0s)
        await sock.sendPresenceUpdate('composing', from).catch(() => {});
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

        await sock.sendMessage(from, {
          text: `👋 *Quick note!* My line is powered by *${storeName}*. ⚡\n\n` +
            `Get instant, affordable MTN & Glo data delivered automatically 24/7 — starting at just *₦400 per GIG*!\n\n` +
            `👉 Reply *DATA* or *DATA 500* to view plans for your budget!\n\n` +
            `💚 _A portion of every purchase funds Community Development projects._ 🇳🇬\n\n` +
            `_You can keep chatting with me normally — the AI bot only responds when you use keywords._\n` +
            `_Have a great day! 😊_`
        });

        await sock.sendPresenceUpdate('paused', from).catch(() => {});

        // If the original message was not a recognized command, return here so we don't double-reply
        if (!isDataMatch && !command.startsWith('buy ') && command !== 'menu'
            && command !== 'start' && command !== 'balance' && !isFundMatch
            && !cardCommandRegex.test(command) && !pinCommandRegex.test(command)
            && command !== 'cds' && command !== 'community' && command !== 'info' && command !== 'donate') {
          return;
        }
      }
    }

    // ── Mode Gate & Subscription Verification ──
    if (user.botMode === BOT_MODES.AUTONOMOUS && user.subscription?.expiresAt) {
      const now = new Date();
      const expiry = new Date(user.subscription.expiresAt);

      if (now > expiry) {
        let renewed = false;
        if (user.subscription.autoRenew !== false) {
          const planKey = user.subscription.plan || 'MONTHLY';
          const planConfig = SUBSCRIPTION_PLANS[planKey] || SUBSCRIPTION_PLANS.MONTHLY;
          const currentBalance = await wallet.getBalance(user.uid);

          if (currentBalance >= planConfig.price) {
            await wallet.recordSubscriptionDebit(user.uid, planConfig.price, planKey, { reason: 'auto_renew' });
            const startedAt = now.toISOString();
            const expiresAt = new Date(now.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000).toISOString();
            const updatedSub = {
              plan: planKey,
              price: planConfig.price,
              durationDays: planConfig.durationDays,
              startedAt,
              expiresAt,
              autoRenew: true
            };
            if (db.users) {
              await db.users.doc(user.uid).set({ botMode: BOT_MODES.AUTONOMOUS, subscription: updatedSub }, { merge: true });
            }
            user.subscription = updatedSub;
            renewed = true;

            if (sessionManager.motherSock) {
              const partnerJid = user.uid.includes('@') ? user.uid : `${user.uid}@s.whatsapp.net`;
              await sessionManager.motherSock.sendMessage(partnerJid, {
                text: `🔄 *Autonomous Mode Auto-Renewed!*\n\nYour ${planConfig.label} has renewed for ₦${planConfig.price.toLocaleString()} from your wallet.\nNext renewal: ${new Date(expiresAt).toLocaleDateString('en-GB')}.`
              }).catch(() => {});
            }
          }
        }

        if (!renewed) {
          if (db.users) {
            await db.users.doc(user.uid).set({ botMode: BOT_MODES.MANUAL }, { merge: true });
          }
          user.botMode = BOT_MODES.MANUAL;

          if (sessionManager.motherSock) {
            const partnerJid = user.uid.includes('@') ? user.uid : `${user.uid}@s.whatsapp.net`;
            await sessionManager.motherSock.sendMessage(partnerJid, {
              text: `⚠️ *Autonomous Mode Expired*\n\nYour ${user.subscription?.plan || 'subscription'} has ended and could not auto-renew.\nYour store is now in Manual Mode.\n\nText *UPGRADE* to reactivate 24/7 automation for *₦950/month*.`
            }).catch(() => {});
          }
          return; // Silent for this message
        }
      }
    }

    // ── Mode Gate: Manual mode = silent ProxyBot (partner handles chats manually) ──
    if (user.botMode !== BOT_MODES.AUTONOMOUS) {
      return;
    }

    // ── Approval Gate: Unapproved terminals remain silent until administrative activation ──
    if (user.terminalApproved !== true) {
      return;
    }

    // ── CDS / COMMUNITY INFO keyword ──
    if (command === 'cds' || command === 'community' || command === 'info') {
      const storeName = user.brandName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));

      return sock.sendMessage(from, {
        text: `🇳🇬 *Clarion AI Community Development Initiative*\n\n` +
          `Every time you buy data from *${storeName}*, a percentage of the profit is ` +
          `automatically allocated to NYSC Community Development Service (CDS) projects.\n\n` +
          `*What Clarion CDS Funds Support:*\n` +
          `🏫 School renovation & educational supplies\n` +
          `🏥 Community health outreach programs\n` +
          `🌳 Environmental sustainability projects\n` +
          `💻 Digital literacy & youth empowerment\n` +
          `🤝 Skills acquisition workshops\n\n` +
          `*How It Works:*\n` +
          `20% to 80% of vendor profits flow directly into CDS projects ` +
          `(depending on your vendor's chosen tier).\n\n` +
          `──────────────\n` +
          `Want to make an even bigger impact? You can donate directly:\n\n` +
          `👉 Reply *DONATE* to contribute to the Clarion CDS Fund\n` +
          `👉 Reply *DATA* to buy affordable data (automatic CDS contribution included)\n\n` +
          `_Every naira counts. Thank you for building Nigeria! 🇳🇬_`
      });
    }

    // ── DONATE keyword (Clarion CDS Fund Donation) ──
    if (command === 'donate') {
      return sock.sendMessage(from, {
        text: `💚 *Donate to the Clarion CDS Fund*\n\n` +
          `Thank you for your generosity! 🇳🇬\n\n` +
          `Transfer any amount to the Clarion Community Fund account below:\n\n` +
          `🏦 *Bank:* ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
          `🔢 *Account:* ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
          `👤 *Name:* ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
          `Once your transfer is detected, we'll send you a personalised *Clarion Community Champion* ` +
          `receipt you can proudly share on social media! 🎨\n\n` +
          `👉 Reply *DATA* to buy data instead\n` +
          `👉 Reply *CANCEL* to go back\n\n` +
          `_Every contribution, no matter how small, helps fund real NYSC CDS projects across Nigeria._`
      });
    }

    // Handle Data/Menu request

    if (command === 'balance') {
      let balance = 0;
      if (db.users && actionableJid) {
        try {
          const doc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (doc.exists) balance = doc.data().walletBalance || 0;
        } catch (e) {
          logger.error('Error fetching balance:', e.message);
        }
      }
      return sock.sendMessage(from, {
        text: `🛡️ *Clarion Wallet*\n\n` +
          `Your available balance: *₦${balance.toLocaleString()}*\n\n` +
          `✨ *Wallet Superpowers:*\n` +
          `• 🔒 100% Secure Funds (never expires)\n` +
          `• ⚡ Instant 3-second automatic vending\n` +
          `• 🚫 *Zero Paystack Security Fees* on all data purchases!\n\n` +
          `👉 Reply *FUND* anytime to top up your wallet.\n` +
          `👉 Reply *DATA* to view data packages.`
      });
    }

    // ── Handle REDEEM keyword (Exclusively for Data Fuel redemptions) ──
    const awaitingRedeemKey = `${user.uid}_${actionableJid}`;
    const pendingRedeemState = awaitingRedeemMap.get(awaitingRedeemKey);
    const isRedeemCommand = cleanCommand === 'redeem' || cleanCommand.startsWith('redeem ') || (pendingRedeemState && /^[1-4]$/.test(cleanCommand));

    if (isRedeemCommand) {
      const partnerUid = (isOwner ? user.uid : actionableJid);
      const dataFuelBalance = await wallet.getDataFuelBalance(partnerUid);

      if (dataFuelBalance < 200) {
        return sock.sendMessage(from, {
          text: `⛽ *Clarion Data Fuel*\n\n` +
            `Your available Data Fuel: *₦${dataFuelBalance.toLocaleString()}*\n\n` +
            `You need at least ₦250 to redeem a free data bundle.\n\n` +
            `💡 *How to earn free Data Fuel:*\n` +
            `Share your data store flyers on your WhatsApp Status! Every time someone orders from your store, 35% commission is added directly to your Data Fuel balance automatically. 🚀`
        });
      }

      // Check if user selected an option (e.g. "1" or "REDEEM 1")
      let selectedIndex = null;
      if (pendingRedeemState && /^[1-4]$/.test(cleanCommand)) {
        selectedIndex = parseInt(cleanCommand, 10) - 1;
      } else if (cleanCommand.startsWith('redeem ')) {
        const parts = cleanCommand.split(/\s+/);
        if (/^[1-4]$/.test(parts[1])) {
          selectedIndex = parseInt(parts[1], 10) - 1;
        }
      }

      const allPlans = await payflex.getAvailablePlans();
      const targetPhone = pendingRedeemState?.targetPhone || (isOwner ? (user.phoneNumber || user.uid.split('@')[0]) : actionableJid.split('@')[0]);
      const network = detectNetwork(targetPhone) || 'mtn';

      const affordablePlans = allPlans
        .filter(p => p.network?.toLowerCase().includes(network.toLowerCase()) && p.sellPrice <= dataFuelBalance)
        .sort((a, b) => a.sellPrice - b.sellPrice)
        .slice(0, 4);

      if (affordablePlans.length === 0) {
        return sock.sendMessage(from, {
          text: `⛽ *Data Fuel Balance: ₦${dataFuelBalance.toLocaleString()}*\n\nNo available ${network.toUpperCase()} plans found within your current balance. Please accumulate more earnings or check back shortly.`
        });
      }

      if (selectedIndex === null || !affordablePlans[selectedIndex]) {
        awaitingRedeemMap.set(awaitingRedeemKey, {
          plans: affordablePlans,
          targetPhone,
          timestamp: Date.now()
        });

        let menuText = `⚡ *Clarion Data Fuel Dispenser*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `💰 Your Earned Data Fuel: *₦${dataFuelBalance.toLocaleString()}*\n` +
          `📱 Destination: *${targetPhone} (${network.toUpperCase()})*\n\n` +
          `Reply with a number to redeem your earned data:\n`;

        affordablePlans.forEach((p, idx) => {
          menuText += `${idx + 1}️⃣ *${p.name}* — ₦${p.sellPrice.toLocaleString()}\n`;
        });

        menuText += `\n👉 Reply with *1*, *2*, etc. to redeem instantly from your earnings.\n` +
          `👉 Reply *CANCEL* to exit.`;

        return sock.sendMessage(from, { text: menuText });
      }

      // Execute Redemption
      const chosenPlan = affordablePlans[selectedIndex];
      awaitingRedeemMap.delete(awaitingRedeemKey);

      await sock.sendMessage(from, {
        text: `⏳ Dispensing *${chosenPlan.name}* to *+${targetPhone}* from your Data Fuel balance...`
      });

      try {
        await wallet.recordDataFuelDebit(
          partnerUid,
          chosenPlan.sellPrice,
          `Redeemed ${chosenPlan.name}`,
          { serial: chosenPlan.serial, targetPhone }
        );

        await payflex.dispenseData(targetPhone, chosenPlan.serial);
        const remainingFuel = +(dataFuelBalance - chosenPlan.sellPrice).toFixed(2);

        return sock.sendMessage(from, {
          text: `🎉 *Data Fuel Dispensed Successfully!*\n\n` +
            `📱 *Recipient:* +${targetPhone} (${network.toUpperCase()})\n` +
            `📦 *Plan:* ${chosenPlan.name}\n` +
            `💰 *Cost:* ₦${chosenPlan.sellPrice.toLocaleString()} (Free via Data Fuel)\n` +
            `⛽ *Remaining Data Fuel:* *₦${remainingFuel.toLocaleString()}*\n\n` +
            `_Powered by Clarion A.I. Micro-Franchise Network._ 🚀`
        });
      } catch (err) {
        logger.error(`Error dispensing redeemed data for ${partnerUid}:`, err.message);
        return sock.sendMessage(from, {
          text: `❌ Delivery failed at network gateway. Your Data Fuel has been preserved. Please try again in a few minutes.`
        });
      }
    }

    // ── Handle SUGGEST keyword (Referral partner recommends new lead) ──
    const suggestRegex = /^\.?suggest\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})\s+(.+)$/i;
    const suggestMatch = command.match(suggestRegex);

    if (suggestMatch) {
      let rawNum = suggestMatch[1].replace(/\D/g, '');
      if (rawNum.startsWith('0') && rawNum.length === 11) {
        rawNum = '234' + rawNum.substring(1);
      }
      const candidatePhone = rawNum;
      const candidateJid = `${candidatePhone}@s.whatsapp.net`;
      const candidateName = suggestMatch[2].trim();
      const parentJid = user.parentId || user.uid;

      if (db.users) {
        await db.users.doc(candidateJid).set({
          uid: candidateJid,
          phoneNumber: candidatePhone,
          phoneJid: candidateJid,
          name: candidateName,
          role: 'REFERRAL',
          parentId: parentJid,
          recruitedBy: actionableJid,
          state: 'AWAITING_QR_SCAN',
          profitSharePercent: 35,
          dataFuelBalance: 0,
          metrics: {
            totalOrders: 0,
            totalRevenueNaira: 0,
            totalProfitNaira: 0,
            recruitedPartnersCount: 0
          },
          suggestedAt: new Date().toISOString()
        }, { merge: true });
      }

      await sock.sendMessage(from, {
        text: `⏳ *Generating Activation QR Code for ${candidateName} (+${candidatePhone})...*\n\n` +
          `Please stand by — the QR code image will be sent right here for you to display to ${candidateName}!`
      });

      try {
        await sessionManager.startQRPairingForUser(
          {
            uid: candidateJid,
            phoneNumber: candidatePhone,
            phoneJid: candidateJid,
            name: candidateName,
            ownerJid: from,
            motherJid: from,
            parentId: parentJid,
            recruitedBy: actionableJid
          },
          async (rawQR) => {
            try {
              const qrBuffer = await QRCode.toBuffer(rawQR, { width: 600, margin: 2 });
              await sock.sendMessage(from, {
                image: qrBuffer,
                caption: `📸 *Scan this Activation QR Code with ${candidateName}'s Bot Phone (+${candidatePhone})!*\n\n` +
                  `1. Open WhatsApp on *+${candidatePhone}*\n` +
                  `2. Go to *Settings > Linked Devices > Link a Device*\n` +
                  `3. Point camera at this QR image on this screen!\n\n` +
                  `⏱️ *Expires in 60 seconds.*\n` +
                  `🎖️ *You will earn +25 CDS Promotion Points once ${candidateName} is online!*`
              });
            } catch (err) {
              logger.error('Error generating referral QR buffer:', err);
            }
          }
        );
      } catch (pairErr) {
        logger.error('Failed to start suggested pairing:', pairErr.message);
        return sock.sendMessage(from, {
          text: `❌ Could not generate QR code for ${candidateName}. Please verify the phone number and try again.`
        });
      }
      return;
    }

    // ── Handle STATS / RANK keyword (View Leaderboard & Store Standing) ──
    if (cleanCommand === 'stats' || cleanCommand === 'rank' || cleanCommand === 'mystats') {
      let myRank = 1;
      let totalPartners = 1;
      let myScore = 0;
      const targetParent = user.parentId || user.uid;
      const userMetrics = user.metrics || { totalOrders: 0, totalRevenueNaira: 0, recruitedPartnersCount: 0 };

      if (db.users) {
        try {
          const refsSnap = await db.users.where('parentId', '==', targetParent).get();
          const scores = [];
          refsSnap.forEach(doc => {
            const d = doc.data();
            const m = d.metrics || {};
            const score = ((m.totalOrders || 0) * 10) + (Math.floor((m.totalRevenueNaira || 0) / 1000) * 5) + ((m.recruitedPartnersCount || 0) * 25);
            scores.push({ uid: doc.id, score });
            if (doc.id === user.uid) myScore = score;
          });
          scores.sort((a, b) => b.score - a.score);
          totalPartners = Math.max(1, scores.length);
          const idx = scores.findIndex(s => s.uid === user.uid);
          if (idx !== -1) myRank = idx + 1;
        } catch (e) {}
      }

      const currentFuel = await wallet.getDataFuelBalance(user.uid);
      const rankEmoji = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎖️';
      const now = new Date();
      const isThursday = now.getDay() === 4;
      const thursdayRef = isThursday ? 'next Thursday' : 'on Thursday';

      const stateCodeStatus = user.isStateCodeVerified
        ? `✅ Verified (${user.stateCode})`
        : `⚠️ Missing (Reply *STATECODE [YourCode]* to qualify for promotion ${thursdayRef}!)`;

      return sock.sendMessage(from, {
        text: `📊 *Your Partner Performance & Rank*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `${rankEmoji} *Store Rank:* *#${myRank} of ${totalPartners} Partners*\n` +
          `⭐ *Promotion Score:* *${myScore.toLocaleString()} pts*\n\n` +
          `📦 *Completed Orders:* ${userMetrics.totalOrders || 0}\n` +
          `💰 *Total Sales Volume:* ₦${(userMetrics.totalRevenueNaira || 0).toLocaleString()}\n` +
          `👥 *Recruited Partners:* ${userMetrics.recruitedPartnersCount || 0}\n` +
          `⛽ *Available Data Fuel:* ₦${currentFuel.toLocaleString()}\n\n` +
          `🎓 *NYSC State Code:* ${stateCodeStatus}\n\n` +
          (myRank === 1 && user.isStateCodeVerified
            ? `👑 *You are currently Ranked #1! You are eligible for promotion to a Full Parent Store ${thursdayRef}!*`
            : `🚀 *Keep selling and recruiting partners with SUGGEST to climb to #1 before ${thursdayRef}!*`)
      });
    }

    // ── Handle STATECODE keyword (Corps Member Verification) ──
    const stateCodeRegex = /^\.?statecode\s+([A-Za-z]{2}\/\d{2}[A-Za-z]\/\d{4,5})$/i;
    const stateCodeMatch = command.match(stateCodeRegex);

    if (stateCodeMatch) {
      const verifiedCode = stateCodeMatch[1].toUpperCase().trim();
      if (db.users) {
        await db.users.doc(user.uid).set({
          stateCode: verifiedCode,
          isStateCodeVerified: true
        }, { merge: true });
      }
      user.stateCode = verifiedCode;
      user.isStateCodeVerified = true;

      const now = new Date();
      const isThursday = now.getDay() === 4;
      const thursdayRef = isThursday ? 'next Thursday' : 'on Thursday';

      return sock.sendMessage(from, {
        text: `✅ *NYSC State Code Verified!* (${verifiedCode})\n\n` +
          `Your profile is now verified as an active Corps Member. You are officially eligible for promotion to a Full Parent Store ${thursdayRef} when you reach Rank #1! 🇳🇬`
      });
    }

    // ── Handle SQUAD / MYREFS / PARTNERS keyword (For Parent Stores) ──
    if (cleanCommand === 'squad' || cleanCommand === 'myrefs' || cleanCommand === 'partners') {
      if (db.users) {
        const refsSnap = await db.users.where('parentId', '==', user.uid).get();
        if (refsSnap.empty) {
          return sock.sendMessage(from, {
            text: `👥 *Your Squad*\n\nYou currently have no active partners.\n\nReply *SUGGEST [Phone] [Name]* to onboard your first partner!`
          });
        }

        let msgText = `👥 *Your Squad (${refsSnap.size} Active Partners)*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        let pIdx = 1;
        refsSnap.forEach(doc => {
          const d = doc.data();
          const phone = d.phoneNumber || doc.id.split('@')[0];
          const pName = d.name || d.franchiseName || 'Partner';
          const m = d.metrics || {};
          const split = d.profitSharePercent || 35;
          const state = d.isStateCodeVerified ? `✅ ${d.stateCode}` : '⚠️ No Code';

          msgText += `${pIdx}. *${pName}* (+${phone})\n` +
            `   • Orders: ${m.totalOrders || 0} (₦${(m.totalRevenueNaira || 0).toLocaleString()})\n` +
            `   • Recruits: ${m.recruitedPartnersCount || 0} | Split: ${split}% Data Fuel\n` +
            `   • State Code: ${state}\n\n`;
          pIdx++;
        });

        msgText += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 *To change a partner's profit share:*\n` +
          `Reply *SETSPLIT [Phone] [Percent]* (e.g. *SETSPLIT 08012345678 40*)`;

        return sock.sendMessage(from, { text: msgText });
      }
    }

    // ── Handle SETSPLIT keyword (Parent configures child share %) ──
    const setSplitRegex = /^\.?setsplit\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})\s+(\d{1,2}|100)$/i;
    const setSplitMatch = command.match(setSplitRegex);

    if (setSplitMatch) {
      let cleanPhone = setSplitMatch[1].replace(/\D/g, '');
      if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
        cleanPhone = '234' + cleanPhone.substring(1);
      }
      const targetChildJid = `${cleanPhone}@s.whatsapp.net`;
      const newSplit = parseInt(setSplitMatch[2], 10);

      if (db.users) {
        await db.users.doc(targetChildJid).set({
          profitSharePercent: newSplit
        }, { merge: true });
      }

      return sock.sendMessage(from, {
        text: `✅ *Profit Split Updated!*\n\n` +
          `Partner +${cleanPhone} will now receive *${newSplit}%* of distributable profit (in Data Fuel).\n` +
          `Your store receives *${100 - newSplit}%* (in Withdrawable Cash).`
      });
    }

    // ── Handle APPROVE_UPGRADE keyword (Thursday CDS Graduation) ──
    const upgradeRegex = /^\.?approve_upgrade\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})$/i;
    const upgradeMatch = command.match(upgradeRegex);

    if (upgradeMatch) {
      let cleanPhone = upgradeMatch[1].replace(/\D/g, '');
      if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
        cleanPhone = '234' + cleanPhone.substring(1);
      }
      const childJid = `${cleanPhone}@s.whatsapp.net`;

      if (!db.users) {
        return sock.sendMessage(from, { text: '❌ Database unavailable. Please try again later.' });
      }

      const childDoc = await db.users.doc(childJid).get();
      if (!childDoc.exists) {
        return sock.sendMessage(from, { text: `❌ Partner +${cleanPhone} not found.` });
      }

      const childData = childDoc.data();
      if (childData.parentId !== user.uid && !config.isSuperParent(user.uid)) {
        return sock.sendMessage(from, { text: `❌ +${cleanPhone} is not registered under your store.` });
      }

      if (!childData.isStateCodeVerified) {
        return sock.sendMessage(from, {
          text: `⚠️ Cannot promote +${cleanPhone}: Their NYSC State Code has not been verified yet.`
        });
      }

      await sock.sendMessage(from, {
        text: `⏳ *Graduating +${cleanPhone} to Full Store Ownership...*\n\nProvisioning Paystack Dedicated Virtual Account and setting up their sovereign node...`
      });

      let virtualAccount = null;
      try {
        const dva = await paystack.createDedicatedAccount({
          email: `${cleanPhone}@clarionhub.ng`,
          first_name: childData.name || 'Clarion',
          last_name: 'Store',
          phone: cleanPhone
        });

        if (dva && dva.account_number) {
          virtualAccount = {
            bankName: dva.bank?.name || 'Wema Bank',
            accountNumber: dva.account_number,
            accountName: dva.account_name
          };
        }
      } catch (dvaErr) {
        logger.warn('Paystack DVA generation for promoted child:', dvaErr.message);
      }

      const graduationUpdates = {
        role: 'PARENT',
        isGraduatedFromReferral: true,
        graduatedAt: new Date().toISOString(),
        parentId: null,
        previousParentId: user.uid
      };
      if (virtualAccount) graduationUpdates.virtualAccount = virtualAccount;

      await db.users.doc(childJid).set(graduationUpdates, { merge: true });

      // Notify the proud Parent
      await sock.sendMessage(from, {
        text: `🎓 *Graduation Complete!*\n\n` +
          `Partner *${childData.name || cleanPhone}* (+${cleanPhone}) has successfully graduated to a Full Sovereign Clarion Store!\n\n` +
          `Thank you for mentoring a fellow Corps Member through NYSC SAED & Clarion. 🇳🇬`
      });

      // Notify the promoted Partner
      try {
        const promotedSock = sessionManager.sessions.get(childJid) || sessionManager.motherSock;
        if (promotedSock) {
          let dvaMsg = virtualAccount
            ? `🏦 *Bank:* ${virtualAccount.bankName}\n🔢 *Account:* \`${virtualAccount.accountNumber}\`\n👤 *Name:* ${virtualAccount.accountName}\n\n`
            : '';

          await promotedSock.sendMessage(childJid, {
            text: `🎓 *CONGRATULATIONS CORPS MEMBER!* 🇳🇬\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `You have officially graduated to a *Full Clarion Parent Store*!\n\n` +
              `✨ *Your Upgraded Privileges:*\n` +
              `• 💰 *100% Cash Earnings* — No longer limited to Data Fuel!\n` +
              `• 👥 *Franchise Referral Slots* — You can now onboard your own referral partners with *SUGGEST*!\n` +
              `${dvaMsg}` +
              `👉 Reply *BANK* to connect your personal bank account for instant cash withdrawals.\n` +
              `👉 Reply *SQUAD* to see your new partner slots and get started!\n\n` +
              `_Welcome to sovereign digital entrepreneurship!_ 🚀`
          });
        }
      } catch (notifyErr) {
        logger.warn('Failed to deliver graduation notification to child:', notifyErr.message);
      }

      return;
    }

    // ── Handle FUND keyword (Conversational Clarion Wallet Top-Up) ──
    const awaitingFundKey = `${user.uid}_${actionableJid}`;
    const isAwaitingFund = awaitingFundMap.has(awaitingFundKey);
    const fundMatch = command.match(fundCommandRegex);
    const isNumericOnly = /^\d+$/.test(command);

    if (fundMatch || (isAwaitingFund && isNumericOnly)) {
      let fundAmount = null;
      if (fundMatch && fundMatch[1]) {
        fundAmount = parseInt(fundMatch[1], 10);
      } else if (isAwaitingFund && isNumericOnly) {
        fundAmount = parseInt(command, 10);
      }

      if (!fundAmount) {
        // Step 1: Prompt for amount & record waiting state
        awaitingFundMap.set(awaitingFundKey, Date.now());
        return sock.sendMessage(from, {
          text: `💳 *Clarion Secure Wallet Top-Up*\n\n` +
            `How much would you like to add to your Clarion Wallet? *(Minimum: ₦500)*\n\n` +
            `✨ *Why fund your wallet?*\n` +
            `🔒 *100% Protected Funds* — Your balance never expires.\n` +
            `⚡ *3-Second Vending* — Instant delivery without waiting for bank confirmations.\n` +
            `🚫 *Zero Security Fees* — Never pay Paystack security fees on individual data purchases!\n\n` +
            `👉 Reply with the amount (e.g. *1000*, *2000*, or *5000*)\n` +
            `👉 Reply *CANCEL* to exit`
        });
      }

      // Step 2: Amount provided
      awaitingFundMap.delete(awaitingFundKey);

      if (fundAmount < 500 || fundAmount > 200000) {
        return sock.sendMessage(from, {
          text: `❌ Top-up amount must be between ₦500 and ₦200,000.\n\nReply with a valid amount (e.g. *1000*) or reply *CANCEL*.`
        });
      }

      const securityFee = calculatePaystackFee(fundAmount);
      const totalToTransfer = fundAmount + securityFee;
      const orderRef = `CLARION_FUND_${Date.now()}`;

      if (db.ledger) {
        await db.ledger.doc(orderRef).set({
          type: 'PENDING_WALLET_FUND',
          orderType: 'wallet_fund',
          userId: user.uid,
          buyerPhone: actionableJid,
          fundAmount,
          securityFee,
          amount: totalToTransfer,
          status: 'AWAITING_PAYMENT',
          createdAt: new Date().toISOString()
        }).catch(e => logger.warn('Ledger write failed for wallet fund order'));
      }

      const bankInfo = user.virtualAccount || CENTRAL_HUB_ACCOUNT;
      const accountName = bankInfo.accountName || user.brandName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));

      let onlinePaymentText = '';
      try {
        const checkout = await paystack.initializeTransaction({
          email: `${actionableJid.split('@')[0]}@clarionhub.ng`,
          amountNaira: totalToTransfer,
          reference: orderRef,
          metadata: {
            userId: user.uid,
            orderRef,
            type: 'WALLET_FUND',
            fundAmount,
            securityFee
          }
        });
        if (checkout.success && checkout.authorizationUrl) {
          onlinePaymentText = `\n💳 *Or Pay with Card / USSD:*\n${checkout.authorizationUrl}\n`;
        }
      } catch (err) {}

      return sock.sendMessage(from, {
        text: `💳 *WALLET FUNDING INVOICE*\n` +
          `──────────────\n` +
          `💰 Top-Up Amount: ₦${fundAmount.toLocaleString()}\n` +
          `🛡️ Paystack Security Fee: ₦${securityFee.toLocaleString()}\n` +
          `💵 *Total to Transfer:* *₦${totalToTransfer.toLocaleString()}*\n\n` +
          `🏦 *Bank:* ${bankInfo.bankName}\n` +
          `🔢 *Account:* \`${bankInfo.accountNumber}\`\n` +
          `👤 *Name:* ${accountName}\n` +
          `${onlinePaymentText}` +
          `──────────────\n` +
          `⚡ *Your Clarion Wallet will be credited with ₦${fundAmount.toLocaleString()} the instant transfer is detected.*\n` +
          `🛡️ _Your money is secured by Paystack and ready for fee-free purchases._\n` +
          `· Reply *CANCEL* to exit`
      });
    }

    // ── Handle Airtime (CARD) request ──
    if (cardCommandRegex.test(command)) {
      const match = command.match(cardCommandRegex);
      const amount = match && match[1] ? parseInt(match[1]) : null;
      let targetPhone = match && match[2] ? match[2] : actionableJid.split('@')[0];

      if (!amount) {
        return sock.sendMessage(from, {
          text: `📲 *Buy Airtime (Card)*\n\nHow much airtime would you like to buy?\n\nReply:\n👉 *CARD [amount]* (e.g. *CARD 500* for your number)\n👉 *CARD [amount] [phone]* (e.g. *CARD 500 08012345678* to gift someone)`
        });
      }

      if (targetPhone.startsWith('234') && targetPhone.length === 13) {
        targetPhone = '0' + targetPhone.slice(3);
      }
      const network = detectNetwork(targetPhone) || 'mtn';

      if (amount < 50 || amount > 50000) {
        return sock.sendMessage(from, { text: '❌ Airtime amount must be between ₦50 and ₦50,000.' });
      }

      // Check customer's wallet balance
      let customerWallet = 0;
      if (db.users && actionableJid) {
        try {
          const cDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (cDoc.exists) customerWallet = cDoc.data().walletBalance || 0;
        } catch (e) {}
      }

      const orderRef = `CLARION_AIR_${Date.now()}`;

      if (customerWallet >= amount) {
        await sock.sendMessage(from, { text: `💳 *Wallet Vending Proceeding*\n\nDeducting ₦${amount.toLocaleString()} from your Clarion Wallet. Dispensing airtime...` });

        if (db.users) {
          await db.users.doc(user.uid).collection('contacts').doc(actionableJid).set({
            walletBalance: admin.firestore.FieldValue.increment(-amount)
          }, { merge: true });
        }

        try {
          const res = await payflex.purchaseAirtime(network, targetPhone, amount);
          if (db.ledger) {
            await db.ledger.doc(orderRef).set({
              type: 'COMPLETED_AIRTIME',
              userId: user.uid,
              buyerPhone: actionableJid,
              targetPhone,
              network,
              amount,
              status: 'COMPLETED',
              reference: res.reference,
              createdAt: new Date().toISOString()
            }).catch(() => {});
          }
          return sock.sendMessage(from, {
            text: `✅ *Airtime Vended Successfully!*\n\n📱 *Recipient:* ${targetPhone}\n🌐 *Network:* ${network.toUpperCase()}\n💰 *Amount:* ₦${amount.toLocaleString()}\n💳 *Paid via:* Clarion Wallet\n\nThank you for using Clarion A.I! 🎉`
          });
        } catch (err) {
          logger.error('ProxyBot airtime vending failed:', err.message);
          if (db.ledger) {
            await db.ledger.doc(orderRef).set({
              type: 'FAILED_AIRTIME',
              status: 'FAILED_DISPENSE',
              orderType: 'airtime',
              userId: user.uid,
              buyerPhone: actionableJid,
              targetPhone,
              network,
              amount,
              retryCount: 0,
              lastError: err.message,
              createdAt: new Date().toISOString()
            }).catch(() => {});
          }
          return sock.sendMessage(from, { text: `⚠️ We experienced a slight delay dispensing your airtime. Our automated retry system will deliver it shortly.` });
        }
      }

      // Insufficient customer balance: create awaiting payment order
      if (db.ledger) {
        await db.ledger.doc(orderRef).set({
          type: 'PENDING_AIRTIME',
          orderType: 'airtime',
          userId: user.uid,
          buyerPhone: actionableJid,
          targetPhone,
          network,
          amount,
          status: 'AWAITING_PAYMENT',
          createdAt: new Date().toISOString()
        }).catch(() => {});
      }

      const bankInfo = user.virtualAccount || CENTRAL_HUB_ACCOUNT;
      const accountName = bankInfo.accountName || user.brandName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));
      return sock.sendMessage(from, {
        text: `💳 *Airtime Order: ₦${amount.toLocaleString()}*\n\n` +
          `📱 *Recipient:* ${targetPhone} (${network.toUpperCase()})\n` +
          `💰 *Amount:* ₦${amount.toLocaleString()}\n\n` +
          `To complete your purchase, please transfer *₦${amount.toLocaleString()}* to:\n\n` +
          `🏦 *Bank:* ${bankInfo.bankName}\n` +
          `🔢 *Account:* ${bankInfo.accountNumber}\n` +
          `👤 *Name:* ${accountName}\n\n` +
          `✅ Your airtime will be dispensed automatically upon payment detection.\n\nReply *CANCEL* to abort this order.`
      });
    }

    // ── Handle Exam PINs (PIN) request ──
    if (pinCommandRegex.test(command)) {
      const match = command.match(pinCommandRegex);
      const exam = match && match[1] ? match[1].toUpperCase() : null;
      const examProducts = payflex.getExamProducts();

      if (!exam) {
        let msg = `🎓 *Clarion Exam Result Checker PINs*\n\nAvailable PINs:\n`;
        for (const [k, v] of Object.entries(examProducts)) {
          msg += `👉 *PIN ${k}* — ₦${v.sellPrice.toLocaleString()} (${v.name})\n`;
        }
        msg += `\nReply *PIN WAEC* or *PIN NECO* to purchase.`;
        return sock.sendMessage(from, { text: msg });
      }

      const product = examProducts[exam];

      // Check customer's wallet balance
      let customerWallet = 0;
      if (db.users && actionableJid) {
        try {
          const cDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (cDoc.exists) customerWallet = cDoc.data().walletBalance || 0;
        } catch (e) {}
      }

      const orderRef = `CLARION_PIN_${Date.now()}`;

      if (customerWallet >= product.sellPrice) {
        await sock.sendMessage(from, { text: `💳 *Wallet Vending Proceeding*\n\nDeducting ₦${product.sellPrice.toLocaleString()} from your Clarion Wallet. Generating exam PIN...` });

        if (db.users) {
          await db.users.doc(user.uid).collection('contacts').doc(actionableJid).set({
            walletBalance: admin.firestore.FieldValue.increment(-product.sellPrice)
          }, { merge: true });
        }

        try {
          const res = await payflex.purchaseExamPin(exam);
          if (db.ledger) {
            await db.ledger.doc(orderRef).set({
              type: 'COMPLETED_EXAM_PIN',
              userId: user.uid,
              buyerPhone: actionableJid,
              examType: exam,
              amount: product.sellPrice,
              status: 'COMPLETED',
              reference: res.reference,
              createdAt: new Date().toISOString()
            }).catch(() => {});
          }
          return sock.sendMessage(from, {
            text: `🎓 *${product.name} Delivered!*\n\n` +
              `🔑 *PIN:* \`${res.pin}\`\n` +
              `🔢 *Serial:* \`${res.serialNumber}\`\n` +
              `💰 *Amount:* ₦${product.sellPrice.toLocaleString()}\n` +
              `💳 *Paid via:* Clarion Wallet\n\n` +
              `Thank you for using Clarion A.I! 🎉`
          });
        } catch (err) {
          logger.error('ProxyBot exam PIN purchase failed:', err.message);
          return sock.sendMessage(from, { text: `❌ Exam PIN purchase failed: ${err.message}. Please try again shortly.` });
        }
      }

      // Insufficient balance: create awaiting payment order
      if (db.ledger) {
        await db.ledger.doc(orderRef).set({
          type: 'PENDING_EXAM_PIN',
          orderType: 'exam_pin',
          userId: user.uid,
          buyerPhone: actionableJid,
          examType: exam,
          amount: product.sellPrice,
          status: 'AWAITING_PAYMENT',
          createdAt: new Date().toISOString()
        }).catch(() => {});
      }

      const bankInfo = user.virtualAccount || CENTRAL_HUB_ACCOUNT;
      const accountName = bankInfo.accountName || user.brandName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));
      return sock.sendMessage(from, {
        text: `🎓 *Order Confirmation: ${product.name}*\n\n` +
          `💰 *Price:* ₦${product.sellPrice.toLocaleString()}\n\n` +
          `To complete your purchase, please transfer *₦${product.sellPrice.toLocaleString()}* to:\n\n` +
          `🏦 *Bank:* ${bankInfo.bankName}\n` +
          `🔢 *Account:* ${bankInfo.accountNumber}\n` +
          `👤 *Name:* ${accountName}\n\n` +
          `✅ Your PIN and Serial Number will be sent automatically upon payment detection.\n\nReply *CANCEL* to abort this order.`
      });
    }

    // ── PROMO Claim Keyword ──
    if (command === 'promo') {
      const activePromo = user.activePromo;
      if (!activePromo || activePromo.status !== 'ACTIVE' || (activePromo.claimsRemaining || 0) <= 0) {
        return sock.sendMessage(from, {
          text: `❌ *PROMO ENDED OR EXPIRED*\n\n` +
            `Sorry! The free data giveaway has ended or all grants have been claimed.\n\n` +
            `👉 Reply *DATA* to view our affordable daily data packages starting from ₦250!`
        });
      }

      const claimedBy = activePromo.claimedBy || [];
      const cleanCustomerPhone = actionableJid.split('@')[0];
      if (claimedBy.includes(actionableJid) || claimedBy.includes(cleanCustomerPhone)) {
        return sock.sendMessage(from, {
          text: `⚠️ *PROMO ALREADY CLAIMED*\n\n` +
            `You have already claimed your free data grant from this promo!\n\n` +
            `👉 Reply *DATA* to view our full data catalog.`
        });
      }

      // Claim eligible!
      const newRemaining = Math.max(0, (activePromo.claimsRemaining || 1) - 1);
      const isCompleted = newRemaining === 0;
      const updatedPromo = {
        ...activePromo,
        claimsRemaining: newRemaining,
        claimedBy: [...claimedBy, actionableJid],
        status: isCompleted ? 'COMPLETED' : 'ACTIVE'
      };

      // Save updated promo to Firestore
      if (db.users) {
        await db.users.doc(user.uid).set({ activePromo: updatedPromo }, { merge: true }).catch(() => {});
      }
      user.activePromo = updatedPromo;

      // Check if contact was previously introduced
      let isFirstTime = true;
      if (db.users && actionableJid) {
        try {
          const contactDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (contactDoc.exists && contactDoc.data().introduced === true) {
            isFirstTime = false;
          }
          await db.users.doc(user.uid).collection('contacts').doc(actionableJid).set({
            introduced: true,
            introducedAt: new Date().toISOString()
          }, { merge: true }).catch(() => {});
        } catch (e) {}
      }

      // Dispense free data grant
      const grantMb = activePromo.mbPerContact || 500;
      try {
        const plans = await payflex.getAvailablePlans();
        const grantPlan = plans.find(p => p.name.includes('500MB') || p.name.includes('500 MB')) || plans[0];
        if (grantPlan) {
          await payflex.dispenseData(cleanCustomerPhone, grantPlan.serial);
        }
      } catch (err) {
        logger.error(`Promo data dispense error for ${cleanCustomerPhone}:`, err.message);
      }

      const storeName = user.brandName || user.franchiseName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));

      let receiptText = '';
      if (isFirstTime) {
        receiptText = `🎉 *PROMO DATA DELIVERED!* ⚡\n\n` +
          `Welcome! You've received *${grantMb}MB Free Data* courtesy of *${storeName}*! 🇳🇬\n\n` +
          `📱 *Recipient:* ${cleanCustomerPhone}\n` +
          `📦 *Grant:* ${grantMb}MB Free Data\n` +
          `💰 *Price:* ₦0 (FREE GIFT)\n\n` +
          `──────────────────\n` +
          `🔥 *Need more data? Check out our best packages:*\n\n` +
          `👉 Reply *DATA* anytime to view all MTN & Glo packages!\n` +
          `💚 _Every purchase supports NYSC Community Development projects._`;
      } else {
        receiptText = `🎉 *PROMO DATA DELIVERED!* ⚡\n\n` +
          `Your *${grantMb}MB Free Data* has been credited to your line!\n\n` +
          `📱 *Recipient:* ${cleanCustomerPhone}\n` +
          `📦 *Grant:* ${grantMb}MB Free Data\n` +
          `💰 *Price:* ₦0 (FREE GIFT)\n\n` +
          `──────────────────\n` +
          `🔥 *Top Packages Available:*\n\n` +
          `👉 Reply *DATA* to view all packages.`;
      }

      await sock.sendMessage(from, { text: receiptText });

      // Dispatch dynamic status update across session manager
      sessionManager.dispatchDynamicPromoStatus(user.uid, updatedPromo);
      return;
    }

    if (command === 'menu' || command === 'start' || command === 'catalog' || isDataMatch) {
      const match = dataPriceMatch;
      const targetPrice = match && match[1] ? parseInt(match[1]) : null;
      const targetPhone = match && match[2] ? match[2] : null;

      // MTN / GLO keyword aliases — pre-set the detected network
      let forceNetwork = null;
      if (isMtnAlias) forceNetwork = 'mtn';
      if (isGloAlias) forceNetwork = 'glo';

      const detectedNet = forceNetwork || detectNetwork(targetPhone || actionableJid);
      const hasExplicitNetwork = !!forceNetwork || !!targetPhone;

      // ── Step 1: AI Scanning message — fires for ALL networks, always first ──
      await sock.sendMessage(from, {
        text: targetPrice
          ? `🤖 *Clarion AI is scanning telecom servers for the best verified data packages around your ₦${targetPrice.toLocaleString()} budget...* ⏳`
          : `🤖 *Clarion AI is scanning telecom servers for the best verified data packages...* ⏳`
      });

      // ── Search & Demand Intelligence Logging ──
      if (db.users) {
        try {
          const firestore = db.users.firestore;
          await firestore.collection('searchAnalytics').add({
            userId: user.uid,
            buyerPhone: actionableJid,
            customerPhone: targetPhone || actionableJid.split('@')[0],
            detectedNetwork: detectedNet || 'all',
            targetPrice: targetPrice || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          logger.warn(`Search analytics logging error: ${err.message}`);
        }
      }

      // Micro natural delay (1.4 seconds)
      await new Promise(r => setTimeout(r, 1400));

      // ── Step 2: Graceful notice for unsupported networks (Airtel / 9mobile / T2) ──
      const isAirtelNumber = targetPhone && (targetPhone.startsWith('0802') || targetPhone.startsWith('0808') || targetPhone.startsWith('0812') || targetPhone.startsWith('0701') || targetPhone.startsWith('0708'));
      const is9mobileNumber = targetPhone && (targetPhone.startsWith('0809') || targetPhone.startsWith('0817') || targetPhone.startsWith('0818') || targetPhone.startsWith('0909') || targetPhone.startsWith('0908'));

      if (hasExplicitNetwork && (detectedNet === 'airtel' || isAirtelNumber)) {
        return sock.sendMessage(from, {
          text: `⚡ Clarion AI checked all available servers and is currently optimizing the most affordable data packages for *Airtel*. 🔧\n\n` +
            `Our team is actively working to bring you the best deals on this network.\n\n` +
            `In the meantime, here's what's available right now:\n` +
            `👉 Reply *DATA* to view affordable *MTN & Glo* packages starting at just *₦400 per GIG*\n` +
            `👉 Reply *CANCEL* to exit`
        });
      }

      if (hasExplicitNetwork && (detectedNet === '9mobile' || detectedNet === 't2mobile' || is9mobileNumber)) {
        return sock.sendMessage(from, {
          text: `⚡ Clarion AI checked all available servers and is currently optimizing the most affordable data packages for *T2 Mobile* (formerly 9mobile). 🔧\n\n` +
            `Our team is actively working to bring you the best deals on this network.\n\n` +
            `In the meantime, here's what's available right now:\n` +
            `👉 Reply *DATA* to view affordable *MTN & Glo* packages starting at just *₦400 per GIG*\n` +
            `👉 Reply *CANCEL* to exit`
        });
      }

      const plans = await payflex.getAvailablePlans();

      let filteredPlans = plans;
      if (hasExplicitNetwork && detectedNet) {
        filteredPlans = plans.filter(p => {
          if (detectedNet === 'mtn') return p.network.includes('mtn');
          return p.network.includes(detectedNet);
        });
      }

      const hasExactMatch = targetPrice ? filteredPlans.some(p => p.sellPrice === targetPrice) : true;

      // Check customer's previous purchase status to determine footer tip
      let hasPurchased = false;
      if (db.users && actionableJid) {
        try {
          const cDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (cDoc.exists && cDoc.data().hasPurchased) {
            hasPurchased = true;
          }
        } catch (e) {}
      }

      if (targetPrice) {
        filteredPlans.sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice));
        filteredPlans = filteredPlans.slice(0, 4);
        filteredPlans.sort((a, b) => a.sellPrice - b.sellPrice);
      }

      const networkStr = detectedNet ? detectedNet.toUpperCase() : 'All Network';
      let menuText = `⚡ *CLARION TELECOM CATALOG*\n_Affordable data · Instant delivery 24/7_\n──────────────\n\n`;

      if (hasExplicitNetwork && detectedNet && targetPhone) {
        menuText += `📶 *${networkStr}* detected for ${targetPhone}\n\n`;
      } else if (hasExplicitNetwork && detectedNet) {
        menuText += `📶 *${networkStr}* detected\n\n`;
      }

      if (targetPrice) {
        if (!hasExactMatch) {
          menuText += `🔍 *We don't have an exact ₦${targetPrice.toLocaleString()} plan, but here are the closest high-value plans for you:*\n`;
        } else {
          menuText += `💰 *Best verified plans near ₦${targetPrice.toLocaleString()} budget:*\n`;
        }
      } else if (hasExplicitNetwork) {
        menuText += `📶 *${networkStr} Data Plans:*\n`;
      }

      if (filteredPlans.length === 0) {
        menuText += `\n❌ No plans found matching your criteria. Reply *DATA* to view all packages.`;
      } else if (targetPrice) {
        // Budget view: show nearest 4 plans across networks with network prefix
        filteredPlans.forEach(plan => {
          const networkLabel = plan.network.includes('mtn') ? 'MTN' : 'Glo';
          menuText += `· *${networkLabel} ${plan.name}* — *₦${plan.sellPrice.toLocaleString()}*\n`;
          menuText += `  👉 Reply *BUY ${plan.serial}*\n`;
        });
      } else if (hasExplicitNetwork) {
        // Single network requested (e.g. GLO or MTN keyword)
        const durationGroups = {};
        for (const plan of filteredPlans) {
          const cat = plan.durationCategory || '🗓️ Other Plans';
          if (!durationGroups[cat]) durationGroups[cat] = [];
          durationGroups[cat].push(plan);
        }
        for (const cat of Object.keys(durationGroups)) {
          menuText += `\n${cat}\n`;
          durationGroups[cat].forEach(plan => {
            menuText += `· *${plan.name}* — *₦${plan.sellPrice.toLocaleString()}*\n`;
            menuText += `  👉 Reply *BUY ${plan.serial}*\n`;
          });
        }
      } else {
        // Bare DATA: show both MTN and Glo sections cleanly separated
        const mtnPlans = filteredPlans.filter(p => p.network.includes('mtn'));
        const gloPlans = filteredPlans.filter(p => p.network.includes('glo'));

        const renderSection = (title, secPlans) => {
          let secText = `📶 *${title}*\n`;
          const groups = {};
          for (const plan of secPlans) {
            const cat = plan.durationCategory || '🗓️ Other Plans';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(plan);
          }
          for (const cat of Object.keys(groups)) {
            secText += `\n${cat}\n`;
            groups[cat].forEach(plan => {
              secText += `· *${plan.name}* — *₦${plan.sellPrice.toLocaleString()}*\n`;
              secText += `  👉 Reply *BUY ${plan.serial}*\n`;
            });
          }
          return secText;
        };

        menuText += renderSection('MTN Data Plans:', mtnPlans);
        menuText += `\n──────────────\n`;
        menuText += renderSection('GLO Data Plans:', gloPlans);
      }

      if (hasPurchased) {
        menuText += '\n──────────────\n💡 *Save time: Reply *FUND* to top up your Clarion Wallet & buy in 1-click anytime!*\n· Reply *CANCEL* to exit';
      } else {
        menuText += '\n──────────────\n_Transfer exact amount upon prompt. Data dispenses instantly._\n· Reply *CANCEL* to exit';
      }
      return sock.sendMessage(from, { text: menuText });
    }

    // Handle Order initiation
    if (command.startsWith('buy ')) {
      // Debounce: block duplicate BUY commands within 5 seconds
      const debounceKey = `${from}_buy`;
      const lastBuy = buyDebounce.get(debounceKey);
      if (lastBuy && Date.now() - lastBuy < BUY_DEBOUNCE_MS) {
        return sock.sendMessage(from, { text: '⏳ Your previous order is being processed. Please wait a moment.' });
      }
      buyDebounce.set(debounceKey, Date.now());

      const serial = command.split(' ')[1];
      const plans = await payflex.getAvailablePlans();
      const plan = plans.find(p => p.serial.toString() === serial.toString());

      if (!plan) {
        return sock.sendMessage(from, { text: '❌ Invalid plan serial. Type *DATA* to view the Clarion catalog.' });
      }

      // 1. Fetch customer's wallet balance
      let walletBalance = 0;
      let hasPurchasedBefore = false;
      if (db.users && actionableJid) {
        try {
          const customerDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (customerDoc.exists) {
            walletBalance = customerDoc.data().walletBalance || 0;
            hasPurchasedBefore = !!customerDoc.data().hasPurchased;
          }
        } catch (e) { }
      }

      const orderRef = `CLARION_${Date.now()}`;

      // 2. Exact match or sufficient wallet balance? Buy instantly using Wallet
      if (walletBalance >= plan.sellPrice) {
        await sock.sendMessage(from, { text: `💳 *Wallet Vending Proceeding*\n\nDeducting ₦${plan.sellPrice.toLocaleString()} from your Clarion Wallet. Dispensing data...` });

        // Deduct from wallet immediately
        if (db.users) {
          await db.users.doc(user.uid).collection('contacts').doc(actionableJid).set({
            walletBalance: admin.firestore.FieldValue.increment(-plan.sellPrice),
            hasPurchased: true,
            lastPurchaseAt: new Date().toISOString()
          }, { merge: true });
        }

        const netProfit = (plan.sellPrice - plan.basePrice);
        const settlement = wallet.calculateSettlement(netProfit, user.donationTier);

        // Record as DISPENSING
        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'COMPLETED_DATA', // Already paid, ready to map
            userId: user.uid,
            buyerPhone: actionableJid,
            planId: plan.id,
            serial: plan.serial,
            amount: plan.sellPrice,
            baseCost: plan.basePrice,
            markup: netProfit,
            donationTier: user.donationTier || 'MEMBER',
            status: 'DISPENSING',
            createdAt: new Date().toISOString()
          });
        }

        try {
          // Dispense inline
          await payflex.dispenseData(actionableJid.split('@')[0], plan.serial);

          if (db.ledger) {
            await db.ledger.doc(orderRef).update({
              status: 'COMPLETED',
              settlement,
              updatedAt: new Date().toISOString()
            });
          }

          // Accumulate total CDS donation for corps member
          if (db.users && settlement.cdsShare > 0) {
            const prevCds = Number(user.totalCdsDonated) || 0;
            const newCds = +(prevCds + settlement.cdsShare).toFixed(2);
            await db.users.doc(user.uid).set({
              totalCdsDonated: admin.firestore.FieldValue.increment(settlement.cdsShare)
            }, { merge: true }).catch(() => {});
            handleMilestoneCheck(user.uid, prevCds, newCds, user).catch(() => {});
          }

          let receiptMsg = `✅ *DATA DELIVERED!*\n──────────────\n\n📦 *Plan:* ${plan.name}\n💳 *Wallet Deducted:* ₦${plan.sellPrice.toLocaleString()}\n\n`;
          if (!hasPurchasedBefore) {
            receiptMsg += `🎉 *Congratulations on your first order!*\n` +
              `💡 *Smart Tip:* You just completed this purchase instantly with 1-click using your Clarion Wallet!\n` +
              `👉 Reply *FUND* anytime to keep your wallet loaded and buy instantly 24/7.`;
          } else {
            receiptMsg += `Thank you for choosing Clarion AI! 🎉\n· Reply *DATA* for your next order`;
          }
          return sock.sendMessage(from, { text: receiptMsg });
        } catch (dispenseError) {
          // If Peyflex fails again during wallet buy, push it to FAILED_DISPENSE for RetryQueue to handle
          if (db.ledger) {
            await db.ledger.doc(orderRef).update({
              status: 'FAILED_DISPENSE',
              retryCount: 0,
              lastError: dispenseError.message,
              updatedAt: new Date().toISOString()
            });
          }
          return sock.sendMessage(from, { text: `⚠️ *DELIVERY DELAY DETECTED*\n──────────────\n\nYour payment of *₦${plan.sellPrice.toLocaleString()}* is safely confirmed. ✅\n\nTelecom network servers are experiencing a brief delay. Our automated engine is retrying right now.\n\n_You do not need to resend payment. Your funds are 100% safe._` });
        }
      }

      // 3. Insufficient wallet balance? Proceed with Bank Transfer instructions
      const securityFee = calculatePaystackFee(plan.sellPrice);
      const totalToTransfer = plan.sellPrice; // Customer pays exact face price; fee absorbed

      if (db.ledger) {
        await db.ledger.doc(orderRef).set({
          type: 'PENDING_DATA',
          userId: user.uid,
          buyerPhone: actionableJid,
          planId: plan.id,
          serial: plan.serial,
          dataCost: plan.sellPrice,
          securityFee,
          amount: totalToTransfer,
          status: 'AWAITING_PAYMENT',
          createdAt: new Date().toISOString()
        }).catch(e => logger.warn('Ledger write failed, order processed in memory.'));
      }

      const bankInfo = user.virtualAccount || CENTRAL_HUB_ACCOUNT;
      const accountName = bankInfo.accountName || user.brandName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));
      const networkLabel = plan.network.includes('mtn') ? 'MTN' : 'Glo';
      const planDisplayName = plan.name.toLowerCase().includes('mtn') || plan.name.toLowerCase().includes('glo')
        ? plan.name
        : `${networkLabel} ${plan.name}`;

      const paymentInstruction = `💳 *ORDER CONFIRMATION: ${planDisplayName}*\n` +
        `──────────────\n` +
        `💰 *Amount to Transfer:* *₦${totalToTransfer.toLocaleString()}*\n\n` +
        `🏦 *Bank:* ${bankInfo.bankName}\n` +
        `🔢 *Account Number:* \`${bankInfo.accountNumber}\`\n` +
        `👤 *Account Name:* ${accountName}\n` +
        `──────────────\n` +
        `⚡ _Transfer exactly *₦${totalToTransfer.toLocaleString()}*. Your data dispenses automatically in seconds._\n` +
        `· Reply *CANCEL* to abort order`;
      return sock.sendMessage(from, { text: paymentInstruction });
    }



  } catch (error) {
    logger.error({ err: error }, 'Clarion Digital Store Error');
  }
};

