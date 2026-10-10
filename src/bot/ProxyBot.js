import { logger } from '../config/env.js';
import admin, { db } from '../services/firebase.js';
import payflex from '../services/payflex.js';
import wallet, { SUBSCRIPTION_PLANS, BOT_MODES } from '../services/WalletService.js';
import sessionManager, { handleOnboardingWizardInput } from './SessionManager.js';
import broadcastQueue from '../services/BroadcastQueue.js';
import { handleMilestoneCheck, CENTRAL_HUB_ACCOUNT } from './MotherBot.js';
import { detectNetwork } from '../utils/networkUtils.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

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
    const dataCommandRegex = /^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
    const isDataMatch = dataCommandRegex.test(command);
    const cardCommandRegex = /^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
    const pinCommandRegex = /^\.?pin(?:\s+(waec|neco))?$/i;

    // ── Onboarding Wizard Check (if partner is completing setup) ──
    const partnerPhoneDigits = String(user.phoneNumber || user.phone || user.uid || '').replace(/[^0-9]/g, '').slice(-10);
    const senderDigits = String(actionableJid || from).replace(/[^0-9]/g, '').slice(-10);
    const isOwner = msg.key.fromMe || (partnerPhoneDigits && senderDigits && partnerPhoneDigits === senderDigits);

    if (isOwner && user.onboardingStep !== null && user.onboardingStep !== undefined) {
      const handled = await handleOnboardingWizardInput(sock, from, user, text);
      if (handled) return;
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
    if (!from.endsWith('@g.us') && !isOwner && user.botMode === BOT_MODES.AUTONOMOUS && user.announceNewContacts !== false) {
      let isIntroduced = false;
      if (db.users && actionableJid) {
        try {
          const contactDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          isIntroduced = contactDoc.exists && contactDoc.data().introduced === true;
        } catch (e) {}
      }

      if (!isIntroduced) {
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
            `Get instant, affordable MTN, Airtel, Glo & 9mobile data delivered automatically.\n\n` +
            `👉 Reply *DATA* or *DATA 500* to view plans for your budget!\n\n` +
            `💚 _A portion of every purchase funds NYSC Community Development projects._ 🇳🇬\n\n` +
            `_You can keep chatting with me normally — the bot only responds when you use keywords._\n` +
            `_Have a great day! 😊_`
        });

        await sock.sendPresenceUpdate('paused', from).catch(() => {});

        // If the original message was not a recognized command, return here so we don't double-reply
        if (!isDataMatch && !command.startsWith('buy ') && command !== 'menu'
            && command !== 'start' && command !== 'balance'
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
          `👉 Reply *DATA* to buy subsidized data (automatic CDS contribution included)\n\n` +
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
      return sock.sendMessage(from, { text: `🛡️ *Clarion Wallet*\n\nYour current balance is: *₦${balance}*\n\nThis balance is automatically funded if your previous data orders could not be delivered due to network issues.\n\nReply *DATA* to use your balance.` });
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

    if (command === 'menu' || command === 'start' || isDataMatch) {
      const match = isDataMatch ? command.match(dataCommandRegex) : null;
      const targetPrice = match && match[1] ? parseInt(match[1]) : null;
      const targetPhone = match && match[2] ? match[2] : null;

      const plans = await payflex.getAvailablePlans();
      const detectedNet = detectNetwork(targetPhone || actionableJid);

      let filteredPlans = plans;
      if (detectedNet) {
        filteredPlans = plans.filter(p => {
          if (detectedNet === 'mtn') return p.network.includes('mtn');
          return p.network.includes(detectedNet);
        });
      }

      if (targetPrice) {
        filteredPlans.sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice));
        filteredPlans = filteredPlans.slice(0, 4);
        filteredPlans.sort((a, b) => a.sellPrice - b.sellPrice);
      }

      const storeName = user.brandName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Telecom'));
      const networkStr = detectedNet ? detectedNet.toUpperCase() : 'All Network';
      let menuText = `⚡ *CLARION TELECOM CATALOG*\n_Affordable data · Instant delivery 24/7_\n──────────────\n\n`;

      if (detectedNet && targetPhone) {
        menuText += `📶 *${networkStr}* detected for ${targetPhone}\n\n`;
      } else if (detectedNet) {
        menuText += `📶 *${networkStr}* detected\n\n`;
      }

      if (targetPrice) {
        menuText += `💰 *Best plans near ₦${targetPrice} budget:*\n`;
      } else {
        menuText += `📶 *${networkStr} Data Plans:*\n`;
      }


      if (filteredPlans.length === 0) {
        menuText += `\n❌ No plans found matching your criteria.`;
      } else {
        // Render dynamically grouped duration categories natively for all networks
        const durationGroups = {};
        for (const plan of filteredPlans) {
          const cat = plan.durationCategory || '🗓️ Other Plans';
          if (!durationGroups[cat]) durationGroups[cat] = [];
          durationGroups[cat].push(plan);
        }

        // Output each grouped category in sorted order
        for (const cat of Object.keys(durationGroups)) {
          menuText += `\n${cat}\n`;
          durationGroups[cat].forEach(plan => {
            menuText += `· *${plan.name}* — *₦${plan.sellPrice}*\n`;
            menuText += `  👉 Reply *BUY ${plan.serial}*\n`;
          });
        }
      }

      menuText += '\n──────────────\n_Transfer exact amount upon prompt. Data dispenses instantly._\n· Reply *CANCEL* to exit';
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
      if (db.users && actionableJid) {
        try {
          const customerDoc = await db.users.doc(user.uid).collection('contacts').doc(actionableJid).get();
          if (customerDoc.exists) walletBalance = customerDoc.data().walletBalance || 0;
        } catch (e) { }
      }

      const orderRef = `CLARION_${Date.now()}`;

      // 2. Exact match or sufficient wallet balance? Buy instantly using Wallet
      if (walletBalance >= plan.sellPrice) {
        await sock.sendMessage(from, { text: `💳 *Wallet Vending Proceeding*\n\nDeducting ₦${plan.sellPrice} from your Clarion Wallet. Dispensing data...` });

        // Deduct from wallet immediately
        if (db.users) {
          await db.users.doc(user.uid).collection('contacts').doc(actionableJid).set({
            walletBalance: admin.firestore.FieldValue.increment(-plan.sellPrice)
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

          return sock.sendMessage(from, { text: `✅ *DATA DELIVERED!*\n──────────────\n\n📦 *Plan:* ${plan.name}\n💳 *Wallet Deducted:* ₦${plan.sellPrice.toLocaleString()}\n\nThank you for choosing Clarion AI! 🎉\n· Reply *DATA* for your next order` });
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
      if (db.ledger) {
        await db.ledger.doc(orderRef).set({
          type: 'PENDING_DATA',
          userId: user.uid,
          buyerPhone: actionableJid,
          planId: plan.id,
          serial: plan.serial,
          amount: plan.sellPrice,
          status: 'AWAITING_PAYMENT',
          createdAt: new Date().toISOString()
        }).catch(e => logger.warn('Ledger write failed, order processed in memory.'));
      }

      const bankInfo = user.virtualAccount || CENTRAL_HUB_ACCOUNT;
      const accountName = bankInfo.accountName || user.brandName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));
      const paymentInstruction = `💳 *ORDER CONFIRMATION*\n_${plan.name}_\n──────────────\n\nTransfer exactly *₦${plan.sellPrice}* to complete your order:\n\n🏦 *Bank:* ${bankInfo.bankName}\n🔢 *Account:* \`${bankInfo.accountNumber}\`\n👤 *Name:* ${accountName}\n\n──────────────\n⚡ _Data vends automatically once transfer is detected._\n· Reply *CANCEL* to abort order`;
      return sock.sendMessage(from, { text: paymentInstruction });
    }



  } catch (error) {
    logger.error({ err: error }, 'Clarion Digital Store Error');
  }
};

