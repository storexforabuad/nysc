import { config, logger } from '../config/env.js';
import admin, { db } from '../services/firebase.js';
import payflex, { calculatePaystackFee } from '../services/payflex.js';
import telecomDispatcher from '../services/TelecomDispatcher.js';
import paystack from '../services/PaystackService.js';
import wallet, { SUBSCRIPTION_PLANS, BOT_MODES, WITHDRAWAL_FEES, isSuperParent, SUPER_PARENT_PHONE, getMultiplierTier, MULTIPLIER_TIERS, calculateDynamicSquadCapacity } from '../services/WalletService.js';
import sessionManager, { handleOnboardingWizardInput } from './SessionManager.js';
import broadcastQueue from '../services/BroadcastQueue.js';
import { handleMilestoneCheck, CENTRAL_HUB_ACCOUNT, pendingSuperParentDecisions } from './MotherBot.js';
import { detectNetwork } from '../utils/networkUtils.js';
import { getThursdayReference } from '../utils/dateHelpers.js';
import { matchBank } from '../utils/bankUtils.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import QRCode from 'qrcode';
import contactBackupService from '../services/ContactBackupService.js';

// ── In-memory tracking for delegated candidate pairing (Super Parent Handoff) ──
export const pendingMentorPairingMap = new Map();

// ── In-memory tracking for introduced contacts (resilient offline/mock fallback) ──
const introducedContacts = new Set();

// ── In-memory tracking for awaiting FUND amount (conversational wallet top-up) ──
const awaitingFundMap = new Map();

// ── In-memory tracking for awaiting REDEEM selection (Data Fuel redemption) ──
const awaitingRedeemMap = new Map();

// ── In-memory tracking for awaiting gift recipient (vCard sharing or recipient parsing) ──
const awaitingGiftMap = new Map();

// ── In-memory tracking for Two-Step recipient phone flow ──
const awaitingRecipientMap = new Map();
const awaitingConfirmMap = new Map();
const awaitingMismatchMap = new Map();
const awaitingDownTierConfirmMap = new Map();

// ── In-memory tracking for Two-Step NIBSS BANK Account Confirmation ──
const awaitingBankConfirmMap = new Map();

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

  const contactMsg = messageContent?.contactMessage || messageContent?.contactsArrayMessage?.contacts?.[0] || msg.message?.contactMessage || msg.message?.contactsArrayMessage?.contacts?.[0];

  if (!text && !contactMsg) return;

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

    const userSessionKey = `${user.uid}_${actionableJid}`;
    const contactsUid = user.contactsUid || user.phoneJid || user.uid;

    // ── Universal CANCEL / EXIT ──
    if (command === 'cancel' || command === 'exit') {
      awaitingRecipientMap.delete(userSessionKey);
      awaitingMismatchMap.delete(userSessionKey);
      awaitingConfirmMap.delete(userSessionKey);
      awaitingGiftMap.delete(userSessionKey);
      awaitingFundMap.delete(userSessionKey);

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

    // ── Interactive State Gate: Delegated Candidate Pairing (1=Paircode, 2=QR, WAIT) ──
    const mentorPairing = pendingMentorPairingMap.get(actionableJid) || pendingMentorPairingMap.get(from);
    if (mentorPairing && (cleanCommand === '1' || cleanCommand === '2' || cleanCommand === 'wait')) {
      if (cleanCommand === 'wait') {
        return sock.sendMessage(from, {
          text: `👌 Saved. When you're ready with ${mentorPairing.candidateName}, reply *1* for remote code or *2* for QR.`
        });
      }

      if (cleanCommand === '1') {
        try {
          pendingMentorPairingMap.delete(actionableJid);
          pendingMentorPairingMap.delete(from);

          const code = await sessionManager.requestPairingCodeForUser({
            uid: mentorPairing.candidateJid,
            phoneNumber: mentorPairing.candidatePhone,
            phoneJid: mentorPairing.candidateJid,
            name: mentorPairing.candidateName,
            ownerJid: from,
            motherJid: from,
            parentId: '2347032905036@s.whatsapp.net',
            mentorId: actionableJid,
            recruitedBy: actionableJid,
            role: 'CHILD_PROXY',
            multiplierTier: 'Tier 1 (1X)'
          });

          return sock.sendMessage(from, {
            text: `✦ Clarion OS\n` +
              `━━━━━━━━━━━━━━\n` +
              `🔑 Activation Code Ready!\n\n` +
              `Forward this 8-digit code to ${mentorPairing.candidateName} (+${mentorPairing.candidatePhone}):\n\n` +
              `👉 *${code}*\n\n` +
              `Instructions for ${mentorPairing.candidateName}:\n` +
              `1. Open WhatsApp > Linked Devices > Link a Device\n` +
              `2. Tap "Link with phone number instead"\n` +
              `3. Enter code: *${code}*\n\n` +
              `⏱️ Code expires in 60 seconds.`
          });
        } catch (codeErr) {
          logger.error('Failed to generate delegated pairing code:', codeErr.message);
          return sock.sendMessage(from, {
            text: `❌ Could not generate pairing code for ${mentorPairing.candidateName}: ${codeErr.message}`
          });
        }
      }

      if (cleanCommand === '2') {
        try {
          pendingMentorPairingMap.delete(actionableJid);
          pendingMentorPairingMap.delete(from);

          await sock.sendMessage(from, {
            text: `⏳ *Generating Activation QR Code for ${mentorPairing.candidateName} (+${mentorPairing.candidatePhone})...*\n\nPlease stand by...`
          });

          await sessionManager.startQRPairingForUser(
            {
              uid: mentorPairing.candidateJid,
              phoneNumber: mentorPairing.candidatePhone,
              phoneJid: mentorPairing.candidateJid,
              name: mentorPairing.candidateName,
              ownerJid: from,
              motherJid: from,
              parentId: '2347032905036@s.whatsapp.net',
              mentorId: actionableJid,
              recruitedBy: actionableJid,
              role: 'CHILD_PROXY',
              multiplierTier: 'Tier 1 (1X)'
            },
            async (rawQR) => {
              try {
                const qrBuffer = await QRCode.toBuffer(rawQR, { width: 600, margin: 2 });
                await sock.sendMessage(from, {
                  image: qrBuffer,
                  caption: `✦ Clarion OS\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `📸 *ACTIVATION QR READY FOR ${mentorPairing.candidateName.toUpperCase()}* ⚡\n\n` +
                    `1. Open WhatsApp on *+${mentorPairing.candidatePhone}*\n` +
                    `2. Go to *Settings > Linked Devices > Link a Device*\n` +
                    `3. Scan this QR code right now!\n\n` +
                    `⏱️ *Expires in 60 seconds.*`
                });
              } catch (qrErr) {
                logger.error('Error generating QR buffer for delegated pairing:', qrErr);
              }
            }
          );
          return;
        } catch (pairErr) {
          logger.error('Failed to start delegated QR pairing:', pairErr.message);
          return sock.sendMessage(from, {
            text: `❌ Could not generate QR code for ${mentorPairing.candidateName}. Please try again.`
          });
        }
      }
    }

    // ── Interactive State Gate 1: Network Mismatch Handling (Option 1 = Ported, Option 2 = Re-enter) ──
    const mismatchState = awaitingMismatchMap.get(userSessionKey);
    if (mismatchState && (cleanCommand === '1' || cleanCommand === '2')) {
      if (cleanCommand === '1') {
        // Customer confirms number is ported to plan network! Proceed to confirmation gate
        awaitingMismatchMap.delete(userSessionKey);
        awaitingConfirmMap.set(userSessionKey, {
          plan: mismatchState.plan,
          recipientPhone: mismatchState.recipientPhone,
          recipientNetwork: mismatchState.plan.network,
          isPorted: true,
          timestamp: Date.now()
        });

        const p = mismatchState.plan;
        return sock.sendMessage(from, {
          text: `🔍 *Please confirm your order details:*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📦 *Package:* ${p.network.toUpperCase()} ${p.name} (${p.validity})\n` +
            `📱 *Recipient:* ${mismatchState.recipientPhone} (Ported to ${p.network.toUpperCase()})\n` +
            `💰 *Amount:* ₦${p.sellPrice.toLocaleString()}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Reply *1* to CONFIRM & GET PAYMENT INVOICE\n` +
            `Reply *2* to CHANGE RECIPIENT NUMBER\n` +
            `· Reply *CANCEL* to abort`
        });
      } else {
        // Option 2: Enter different phone number
        awaitingMismatchMap.delete(userSessionKey);
        awaitingRecipientMap.set(userSessionKey, {
          plan: mismatchState.plan,
          timestamp: Date.now()
        });

        return sock.sendMessage(from, {
          text: `📱 *Please enter the correct 11-digit phone number:*\n(e.g. 08021234567 or tap 📎 to share contact card)`
        });
      }
    }

    // ── Interactive State Gate 0: NIBSS Bank Account Confirmation ──
    const bankConfirmState = awaitingBankConfirmMap.get(userSessionKey);
    if (bankConfirmState && (cleanCommand === '1' || cleanCommand === '2')) {
      awaitingBankConfirmMap.delete(userSessionKey);
      if (cleanCommand === '1') {
        const targetUid = isOwner ? user.uid : actionableJid;
        const bankData = {
          bankCode: bankConfirmState.bankCode,
          bankName: bankConfirmState.bankName,
          accountNumber: bankConfirmState.accountNumber,
          accountName: bankConfirmState.accountName,
          verified: true,
          linkedAt: new Date().toISOString()
        };
        if (db.users) {
          await db.users.doc(targetUid).set({
            bankDetails: bankData,
            verifiedName: bankConfirmState.accountName
          }, { merge: true });
        }
        user.bankDetails = bankData;

        return sock.sendMessage(from, {
          text: `✅ *BANK ACCOUNT LINKED SUCCESSFULLY!* 🏦\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Your personal NUBAN account has been permanently verified with NIBSS:\n\n` +
            `👤 *Account Name:* ${bankConfirmState.accountName}\n` +
            `🏦 *Bank:* ${bankConfirmState.bankName}\n` +
            `🔢 *Account Number:* ${bankConfirmState.accountNumber}\n\n` +
            `💰 *Cashouts are processed exclusively every THURSDAY!*\n` +
            `👉 On Thursdays, reply *WITHDRAW* to cash out your earnings.\n` +
            `💡 You can also keep your balance active in your wallet to earn up to 40% on every data sale!`
        });
      } else {
        return sock.sendMessage(from, {
          text: `🔄 *Bank Account Entry Cancelled*\n\n` +
            `Please reply with your correct 10-digit account number and bank name:\n` +
            `👉 Example: *BANK 0123456789 GTBank*`
        });
      }
    }

    // ── Interactive State Gate: Multiplier Down-Tier Warning Confirmation ──
    const downTierState = awaitingDownTierConfirmMap.get(userSessionKey);
    if (downTierState && (cleanCommand === '1' || cleanCommand === '2')) {
      awaitingDownTierConfirmMap.delete(userSessionKey);
      if (cleanCommand === '1') {
        // User explicitly chose to proceed despite down-tier!
        // Transfer into standard awaitingConfirmMap and proceed to confirmation
        awaitingConfirmMap.set(userSessionKey, {
          plan: downTierState.plan,
          recipientPhone: downTierState.recipientPhone,
          recipientNetwork: downTierState.recipientNetwork,
          wholesaleInfo: downTierState.wholesaleInfo,
          debitAmount: downTierState.debitAmount,
          timestamp: Date.now()
        });
        cleanCommand = '1'; // Cascade to execute immediate wallet vending below
      } else {
        // User cancelled to preserve their multiplier
        awaitingConfirmMap.delete(userSessionKey);
        return sock.sendMessage(from, {
          text: `✦ Clarion OS\n` +
            `━━━━━━━━━━━━━━\n` +
            `🛡️ *PURCHASE CANCELLED — MULTIPLIER PROTECTED*\n\n` +
            `Your *${downTierState.currentTier.name} (${downTierState.currentTier.multiplier} Multiplier)* remains fully active! 👑\n` +
            `Your wallet float was not debited (Balance: ₦${downTierState.buyerWallet.toLocaleString()}).\n\n` +
            `💡 *Pro-Tip:* Reply *FUND 1000* to add a safety buffer before buying data.`
        });
      }
    }

    // ── Interactive State Gate 2: Order Confirmation & Invoice Generation ──
    const confirmState = awaitingConfirmMap.get(userSessionKey);
    if (confirmState && (cleanCommand === '1' || cleanCommand === '2')) {
      if (cleanCommand === '1') {
        // Customer confirmed!
        awaitingConfirmMap.delete(userSessionKey);
        const plan = confirmState.plan;
        const targetPhone = confirmState.recipientPhone;

        let walletBalance = 0;
        if (db.users && actionableJid) {
          try {
            const customerDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
            if (customerDoc.exists) walletBalance = customerDoc.data().walletBalance || 0;
          } catch (e) { }
        }

        const orderRef = `CLARION_${Date.now()}`;

        // 1. Instant Vending via In-Chat Wallet
        const wholesaleInfo = confirmState.wholesaleInfo || wallet.getWholesalePrice(plan, walletBalance);
        const debitAmount = wholesaleInfo.discountedPrice || wholesaleInfo;
        const isWholesaleDiscounted = wholesaleInfo.discountAmount > 0;

        if (walletBalance >= debitAmount) {
          const discountNotice = isWholesaleDiscounted
            ? `\n🎉 *${wholesaleInfo.multiplier} Multiplier Savings Applied!* You pay ₦${debitAmount.toLocaleString()} instead of ₦${plan.sellPrice.toLocaleString()} (Saved ₦${wholesaleInfo.discountAmount.toFixed(2)}).\n`
            : '\n';

          await sock.sendMessage(from, {
            text: `💳 *Wallet Vending Proceeding*${discountNotice}Deducting ₦${debitAmount.toLocaleString()} from your Clarion Wallet. Dispensing data...`
          });

          if (db.users) {
            await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).set({
              walletBalance: admin.firestore.FieldValue.increment(-debitAmount),
              hasPurchased: true,
              lastPurchaseAt: new Date().toISOString()
            }, { merge: true });
          }

          const netProfit = (plan.sellPrice - plan.baseCost);
          const settlement = wallet.calculateSettlement(netProfit, user.donationTier);

          if (db.ledger) {
            await db.ledger.doc(orderRef).set({
              type: 'COMPLETED_DATA',
              userId: user.uid,
              buyerPhone: actionableJid,
              recipientPhone: targetPhone,
              planId: plan.id,
              code: plan.code,
              serial: plan.serial,
              amount: plan.sellPrice,
              baseCost: plan.baseCost,
              markup: netProfit,
              donationTier: user.donationTier || 'MEMBER',
              status: 'DISPENSING',
              createdAt: new Date().toISOString()
            });
          }

          try {
            await telecomDispatcher.dispenseData(targetPhone, plan.code);
            if (db.ledger) {
              await db.ledger.doc(orderRef).update({
                status: 'COMPLETED',
                settlement,
                updatedAt: new Date().toISOString()
              });
            }

            return sock.sendMessage(from, {
              text: `✅ *DATA DELIVERED!*\n━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📦 *Plan:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity})\n` +
                `📱 *Recipient:* ${targetPhone}\n` +
                `💳 *Wallet Deducted:* ₦${plan.sellPrice.toLocaleString()}\n\n` +
                `💚 *Thank you!* A portion of your purchase directly funds Community Development projects. 🇳🇬\n\n` +
                `· Reply *DATA* for your next order`
            });
          } catch (dispenseError) {
            if (db.ledger) {
              await db.ledger.doc(orderRef).update({
                status: 'FAILED_DISPENSE',
                retryCount: 0,
                lastError: dispenseError.message,
                updatedAt: new Date().toISOString()
              });
            }
            return sock.sendMessage(from, {
              text: `⚠️ *DELIVERY DELAY DETECTED*\n━━━━━━━━━━━━━━━━━━━━━\n\nYour payment of *₦${plan.sellPrice.toLocaleString()}* is confirmed. ✅\n\nTelecom network servers are experiencing a brief delay. Our automated engine is retrying right now in the background.\n\n_You do not need to resend payment. Your funds are 100% safe._`
            });
          }
        }

        // 2. Insufficient wallet balance: Generate Paystack Invoice with Concurrency Stamp
        const securityFee = calculatePaystackFee(plan.sellPrice);
        let totalToTransfer = plan.sellPrice;

        if (db.ledger) {
          try {
            const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            const recentOrdersSnap = await db.ledger
              .where('status', '==', 'AWAITING_PAYMENT')
              .where('createdAt', '>=', thirtyMinsAgo)
              .get();
            const activeAmounts = new Set();
            recentOrdersSnap.forEach(d => {
              const amt = d.data().amount;
              if (amt) activeAmounts.add(amt);
            });
            while (activeAmounts.has(totalToTransfer)) {
              totalToTransfer += 1; // Unique Naira stamp (+₦1, +₦2) prevents shared-account collisions
            }
          } catch (e) { }
        }

        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'PENDING_DATA',
            userId: user.uid,
            buyerPhone: actionableJid,
            recipientPhone: targetPhone,
            planId: plan.id,
            code: plan.code,
            serial: plan.serial,
            network: plan.network,
            dataCost: plan.sellPrice,
            securityFee,
            amount: totalToTransfer,
            baseCost: plan.baseCost,
            status: 'AWAITING_PAYMENT',
            createdAt: new Date().toISOString()
          }).catch(e => logger.warn('Ledger write failed for data order'));
        }

        let dvaInfo = user.virtualAccount;
        if (!dvaInfo || !dvaInfo.accountNumber) {
          try {
            const cleanPhone = actionableJid.split('@')[0];
            dvaInfo = await paystack.createDedicatedAccount({
              email: `${cleanPhone}@clarionhub.ng`,
              first_name: user.name || 'Clarion',
              last_name: 'Customer',
              phone: cleanPhone
            }, user.brandName || ('Clarion - ' + (user.verifiedName || user.name || 'Store')));
          } catch (e) {
            dvaInfo = CENTRAL_HUB_ACCOUNT;
          }
        }

        let onlinePaymentUrl = '';
        try {
          const init = await paystack.initializeTransaction({
            email: `${actionableJid.split('@')[0]}@clarionhub.ng`,
            amountNaira: totalToTransfer,
            reference: orderRef,
            metadata: {
              userId: user.uid,
              orderRef,
              type: 'DATA_PURCHASE',
              targetPhone,
              planCode: plan.code
            }
          });
          if (init.success) onlinePaymentUrl = init.authorizationUrl;
        } catch (e) { }

        const bankName = dvaInfo?.bankName || 'Wema Bank / Titan Paystack';
        const accountNumber = dvaInfo?.accountNumber || '0123456789';
        const accountName = dvaInfo?.accountName || user.brandName || ('Clarion - ' + (user.verifiedName || user.name || 'Store'));

        let invoiceText = `💳 *PAYMENT INVOICE #${orderRef.slice(-6)}*\n` +
          `──────────────\n` +
          `📱 *Recipient:* ${targetPhone} (${plan.network.toUpperCase()})\n` +
          `📦 *Package:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity})\n` +
          `💰 *Total Due:* *₦${totalToTransfer.toLocaleString()}* (Exact Amount)\n\n` +
          `🏦 *Transfer to Dedicated Account:*\n` +
          `Bank: *${bankName}*\n` +
          `Account Number: *\`${accountNumber}\`*\n` +
          `Account Name: *${accountName}*\n` +
          `──────────────\n`;

        if (onlinePaymentUrl) {
          invoiceText += `\n👉 *Or Pay with Card:*\n${onlinePaymentUrl}\n\n`;
        }

        invoiceText += `⚡ *Transfer exactly ₦${totalToTransfer.toLocaleString()} to the account above.*\n` +
          `Your data bundle will be credited automatically in 15 seconds once payment is detected!\n\n` +
          `⏳ _Account expires in 30 minutes._\n` +
          `· Reply *CANCEL* to abort order`;

        return sock.sendMessage(from, { text: invoiceText });
      } else {
        // Option 2: Change recipient phone
        awaitingConfirmMap.delete(userSessionKey);
        awaitingRecipientMap.set(userSessionKey, {
          plan: confirmState.plan,
          timestamp: Date.now()
        });

        return sock.sendMessage(from, {
          text: `📱 *Please enter the new recipient phone number:*\n(e.g. 08021234567 or tap 📎 to share contact card)`
        });
      }
    }

    // ── Check if contact card or phone number matches Step 1 awaiting recipient ──
    const recipientState = awaitingRecipientMap.get(userSessionKey);
    let capturedPhone = null;

    if (contactMsg && contactMsg.vcard) {
      const vcard = contactMsg.vcard;
      const telMatch = vcard.match(/TEL.*?:([+\d\s-]+)(?:\r?\n|$)/i);
      if (telMatch) capturedPhone = telMatch[1].replace(/\D/g, '');
    } else {
      const standaloneMatch = command.match(/^\s*(\+?234|0)[789][01]\d{8}\s*$/);
      if (standaloneMatch) capturedPhone = command.replace(/\D/g, '');
    }

    if (capturedPhone) {
      if (capturedPhone.startsWith('234') && capturedPhone.length === 13) capturedPhone = '0' + capturedPhone.slice(3);
      if (capturedPhone.length === 10) capturedPhone = '0' + capturedPhone;

      if (capturedPhone.length === 11) {
        if (recipientState) {
          // Flow: fulfilling Step 1 awaiting recipient
          awaitingRecipientMap.delete(userSessionKey);
          const plan = recipientState.plan;
          const phoneNet = detectNetwork(capturedPhone);

          if (phoneNet && phoneNet !== plan.network) {
            awaitingMismatchMap.set(userSessionKey, {
              plan,
              recipientPhone: capturedPhone,
              phoneNetwork: phoneNet,
              timestamp: Date.now()
            });

            return sock.sendMessage(from, {
              text: `⚠️ *Network Mismatch Detected!*\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `You selected an *${plan.network.toUpperCase()}* plan (${plan.name} — ₦${plan.sellPrice.toLocaleString()}),\n` +
                `but *${capturedPhone}* appears to be an *${phoneNet.toUpperCase()}* line!\n\n` +
                `1️⃣ Reply *1* if this number is PORTED to ${plan.network.toUpperCase()} (proceed)\n` +
                `2️⃣ Reply *2* to enter a different phone number\n` +
                `· Reply *CANCEL* to exit`
            });
          }

          let buyerWallet = 0;
          if (db.users && actionableJid) {
            try {
              const customerDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
              if (customerDoc.exists) buyerWallet = customerDoc.data().walletBalance || 0;
            } catch (e) { }
          }

          const wholesaleInfo = wallet.getWholesalePrice(plan, buyerWallet);
          const isWalletPay = buyerWallet >= wholesaleInfo.discountedPrice;

          awaitingConfirmMap.set(userSessionKey, {
            plan,
            recipientPhone: capturedPhone,
            recipientNetwork: phoneNet || plan.network,
            wholesaleInfo,
            debitAmount: wholesaleInfo.discountedPrice,
            timestamp: Date.now()
          });

          if (isWalletPay) {
            return sock.sendMessage(from, {
              text: `🎁 *CLARION WHOLESALE ORDER QUOTATION* ⚡\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `📦 *Package:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity})\n` +
                `📱 *Recipient:* ${capturedPhone} (${(phoneNet || plan.network).toUpperCase()})\n\n` +
                `💰 *Standard Retail:* ₦${plan.sellPrice.toLocaleString()}\n` +
                `⭐ *Your Status:* ${wholesaleInfo.tierName}\n` +
                `🎉 *${wholesaleInfo.multiplier} Wholesale Savings:* -₦${wholesaleInfo.discountAmount.toFixed(2)}\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `💵 *Final Price:* ₦${wholesaleInfo.discountedPrice.toLocaleString()} (Debited from Wallet)\n` +
                `💼 *Available Wallet Balance:* ₦${buyerWallet.toLocaleString()}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `Reply *1* to CONFIRM & VEND INSTANTLY\n` +
                `Reply *2* to CHANGE RECIPIENT NUMBER\n` +
                `· Reply *CANCEL* to abort`
            });
          }

          return sock.sendMessage(from, {
            text: `🔍 *Please confirm your order details:*\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `📦 *Package:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity})\n` +
              `📱 *Recipient:* ${capturedPhone} (${(phoneNet || plan.network).toUpperCase()})\n` +
              `💰 *Amount:* ₦${plan.sellPrice.toLocaleString()}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `Reply *1* to CONFIRM & GET PAYMENT INVOICE\n` +
              `Reply *2* to CHANGE RECIPIENT NUMBER\n` +
              `· Reply *CANCEL* to abort`
          });
        }

        // Standalone phone number or contact card lookup (when not in BUY flow)
        const net = detectNetwork(capturedPhone);
        const netLabel = net ? net.toUpperCase() : 'Telecom';

        awaitingGiftMap.set(userSessionKey, {
          recipientPhone: capturedPhone,
          name: 'Contact',
          network: net,
          timestamp: Date.now()
        });

        if (net === '9mobile' || net === 't2mobile') {
          return sock.sendMessage(from, {
            text: `🎁 *Want to send data to ${capturedPhone}?* ⚡\n\n` +
              `Clarion AI is currently optimizing affordable data packages for *${netLabel}*. 🔧\n\n` +
              `In the meantime, you can gift affordable packages for *MTN, Glo & Airtel*:\n` +
              `👉 Reply *DATA* to view all packages\n\n` +
              `· Reply *CANCEL* to exit`
          });
        }

        let planRowsText = '';
        try {
          const netPlans = await telecomDispatcher.getAvailablePlans(net);
          if (netPlans.length > 0) {
            const groups = {};
            for (const p of netPlans) {
              const cat = p.durationCategory || '🗓️ Other Plans';
              if (!groups[cat]) groups[cat] = [];
              groups[cat].push(p);
            }
            for (const cat of Object.keys(groups)) {
              planRowsText += `\n${cat}\n`;
              groups[cat].forEach(p => {
                planRowsText += `• *${p.name}* (${p.validity}) — *₦${p.sellPrice.toLocaleString()}*\n`;
                planRowsText += `  👉 Reply *BUY ${p.code}*\n`;
              });
            }
          }
        } catch (e) {
          logger.warn(`Failed to fetch plans for raw phone display: ${e.message}`);
        }

        if (planRowsText) {
          return sock.sendMessage(from, {
            text: `🎁 *Want to send data to ${capturedPhone}?* ⚡\n\n` +
              `📶 *${netLabel}* detected for this number!\n` +
              `Here are the verified packages available right now:\n` +
              planRowsText +
              `\n━━━━━━━━━━━━━━━━━━━━━\n` +
              `👉 Reply *BUY [code]* to send to ${capturedPhone}\n` +
              `_If you were just sharing this number for a regular chat, feel free to ignore this note! 😊_`
          });
        }
      }
    }

    // Command regexes (used by first-touch gate and command routers)
    const isDataAndPriceLiteral = /^\.?data\s*(?:and|\+|&)?\s*(?:price|prices|pricing|plans)$/i.test(command);
    const dataCommandRegex = /^\.?data(?:\s*\+?\s*(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
    const dataPriceMatch = command.match(dataCommandRegex);
    // MTN, GLO, and AIRTEL keywords act as network-filtered DATA aliases
    const isMtnAlias = /^\.?mtn(?:\s+(\d+))?$/i.test(command);
    const isGloAlias = /^\.?glo(?:\s+(\d+))?$/i.test(command);
    const isAirtelAlias = /^\.?airtel(?:\s+(\d+))?$/i.test(command);
    const isDataMatch = isDataAndPriceLiteral || !!dataPriceMatch || isMtnAlias || isGloAlias || isAirtelAlias;
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
        } catch (e) { }
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
        await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).set({
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
      const contactTrackingKey = `${contactsUid}_${actionableJid}`;
      let isIntroduced = introducedContacts.has(contactTrackingKey);
      if (!isIntroduced && db.users && actionableJid) {
        try {
          const contactDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
          if (contactDoc.exists && contactDoc.data().introduced === true) {
            isIntroduced = true;
            introducedContacts.add(contactTrackingKey);
          }
        } catch (e) { }
      }

      if (!isIntroduced) {
        introducedContacts.add(contactTrackingKey);
        // Mark as introduced (idempotent, runs once per contact)
        if (db.users && actionableJid) {
          await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).set({
            introduced: true,
            introducedAt: new Date().toISOString()
          }, { merge: true }).catch(() => { });
        }

        const storeName = user.brandName || user.franchiseName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));
        logger.info(`[FIRST-TOUCH] Sending welcome greeting to new contact ${from} via store: ${storeName}`);

        // Natural typing delay (1.2–2.0s)
        await sock.sendPresenceUpdate('composing', from).catch(() => { });
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

        await sock.sendMessage(from, {
          text: `👋 *Quick note!* My line is powered by *${storeName}*. ⚡\n\n` +
            `Get instant, affordable MTN & Glo data delivered automatically 24/7 — starting at just *₦400 per GIG*!\n\n` +
            `👉 Reply *DATA* or *DATA 500* to view plans for your budget!\n\n` +
            `💚 _A portion of every purchase funds Community Development projects._ 🇳🇬\n\n` +
            `_You can keep chatting with me normally — the AI bot only responds when you use keywords._\n` +
            `_Have a great day! 😊_`
        });

        await sock.sendPresenceUpdate('paused', from).catch(() => { });

        // If the original message was not a recognized command, return here so we don't double-reply
        if (!isDataMatch && !command.startsWith('buy ') && command !== 'menu'
          && command !== 'start' && command !== 'balance' && !isFundMatch
          && !cardCommandRegex.test(command) && !pinCommandRegex.test(command)
          && command !== 'cds' && command !== 'community' && command !== 'info' && command !== 'donate'
          && command !== 'about' && command !== 'info story' && command !== 'story' && command !== 'saed') {
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
              }).catch(() => { });
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
            }).catch(() => { });
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

    // ── Friendly Greeting Handler (HI / HELLO / HEY / SALAM) ──
    const isGreeting = /^(?:hi|hello|hey|hy|hola|yo|salam|good\s*(?:morning|afternoon|evening))\b/i.test(command);
    if (isGreeting && !isDataMatch && !command.startsWith('buy ')) {
      const storeName = user.brandName || user.franchiseName || ('Clarion AI - ' + (user.verifiedName || user.name || 'Store'));
      return sock.sendMessage(from, {
        text: `👋 *Hello! Welcome to ${storeName}.* ⚡\n\n` +
          `Need high-speed data for your phone?\n` +
          `👉 Reply *DATA* to view all packages & special rates\n` +
          `👉 Reply *INFO* to learn about our community mission\n\n` +
          `_You can also chat with the store owner normally anytime! 😊_`
      });
    }

    // ── INFO STORY / STORY keyword (The Full Founding SAED Journey) ──
    if (command === 'info story' || command === 'story' || command === 'saed') {
      return sock.sendMessage(from, {
        text: `📖 *THE CLARION JOURNEY: FROM SAED TO A.I.*\n` +
          `━━━━━━━━━━━━━━━\n\n` +
          `In NYSC orientation camp, the SAED program introduces Corps Members to recharge card printing. But in today's smartphone world, manual paper vouchers require heavy machine investments and paper waste.\n\n` +
          `We asked a bold question:\n` +
          `_Why can't every Nigerian Corps Member and youth operate an automated cloud telecom network right on WhatsApp without capital barrier?_\n\n` +
          `Clarion was engineered from Jigawa State as a national service innovation:\n` +
          `1️⃣ *Zero Capital Barrier:* Any youth can launch an automated AI storefront.\n` +
          `2️⃣ *Wholesale Affordability:* Direct telecom pipelines starting at ₦400/GB.\n` +
          `3️⃣ *Built-in Giving Back:* A portion of every transaction quietly funds grassroots CDS community projects in underserved areas.\n\n` +
          `To our customers and NYSC family: Thank you for building Nigeria with us! 🇳🇬\n\n` +
          `— *MGL*\n` +
          `Founder & Lead Architect, Clarion A.I.\n` +
          `Serving Corps Member, Jigawa State \`[JG/26A/2535]\`\n` +
          `📞 Direct Line: +2347032905036\n\n` +
          `──────────────\n` +
          `👉 Reply *DATA* to support & order data in seconds!`
      });
    }

    // ── INFO / ABOUT / CDS / COMMUNITY keyword ──
    if (command === 'info' || command === 'about' || command === 'cds' || command === 'community') {
      const operatorName = user.brandName || user.franchiseName || user.verifiedName || user.name || 'Clarion Partner';
      const operatorBadge = user.isStateCodeVerified
        ? `(\`${user.stateCode}\` ✅)`
        : (user.role === 'REFERRAL' || user.parentId ? `(Partner Store)` : `(Official Store)`);

      return sock.sendMessage(from, {
        text: `🇳🇬 *ABOUT CLARION A.I. STOREFRONT*\n` +
          `━━━━━━━━━━━━━━\n\n` +
          `🏪 *Store Operator:* ${operatorName} ${operatorBadge}\n` +
          `⚡ *Platform:* Clarion A.I. (NYSC SAED Digital Enterprise)\n\n` +
          `💡 *Our Mission & Heritage:*\n` +
          `Inspired by the NYSC SAED recharge card production initiative, Clarion modernizes physical voucher printing into a 24/7 cloud AI storefront — delivering high-speed MTN & Glo data at wholesale rates from just ₦400/GB.\n\n` +
          `💚 *Grassroots Impact (CDS):*\n` +
          `Every purchase on this line directly co-funds local NYSC Community Development projects (school renovations, health supplies, and youth digital skills).\n\n` +
          `━━━━━━━━━━━━━━\n` +
          `👨‍💻 *Lead Architect:*\n` +
          `*MGL*, Founder & Lead Architect\n` +
          `Serving Corps Member, Jigawa State \`[JG/26A/2535]\` 🇳🇬\n\n` +
          `──────────────\n` +
          `👉 Reply *INFO STORY* to read our full journey from SAED to AI\n` +
          `👉 Reply *DATA* to view all packages\n` +
          `👉 Reply *DONATE* to support community projects`
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
      let contactBalance = 0;
      if (db.users && actionableJid) {
        try {
          const doc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
          if (doc.exists) contactBalance = doc.data().walletBalance || 0;
        } catch (e) {
          logger.error('Error fetching balance:', e.message);
        }
      }
      const partnerUid = isOwner ? user.uid : actionableJid;
      const ledgerBalance = await wallet.getBalance(partnerUid);
      const effectiveBalance = Math.max(contactBalance, ledgerBalance);
      const tier = wallet.getMultiplierTier(effectiveBalance);
      const userPhone = (user.phoneNumber || (isOwner ? (user.phoneNumber || from.split('@')[0]) : actionableJid.split('@')[0])).replace(/\D/g, '');

      let nextTierMsg = '';
      if (tier.nextThreshold) {
        const barFilled = Math.min(10, Math.max(0, Math.round(tier.progressPercent / 10)));
        const barEmpty = 10 - barFilled;
        const progressBar = '█'.repeat(barFilled) + '░'.repeat(barEmpty);
        const nextMultiplier = tier.level === 1 ? '2X' : (tier.level === 2 ? '3X' : '4X');
        nextTierMsg = `\n📈 *MULTIPLIER PROGRESSION:*\n` +
          `[${progressBar}] ₦${effectiveBalance.toLocaleString()} / ₦${tier.nextThreshold.toLocaleString()}\n` +
          `👉 Top up ₦${tier.neededToNext.toLocaleString()} to unlock TIER ${tier.level + 1} (${nextMultiplier} Earning & Savings Power)!\n`;
      } else {
        nextTierMsg = `\n💎 *MAXIMUM MULTIPLIER UNLOCKED! (4X Quad Power + 5 Squad Slots Active)*\n`;
      }

      return sock.sendMessage(from, {
        text: `🛡️ *CLARION WALLET & MULTIPLIER STATUS* 📈\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `💼 *Available Balance:* ₦${effectiveBalance.toLocaleString()}\n` +
          `⭐ *Current Status:* Tier ${tier.level} (${tier.multiplier} Multiplier Active)\n` +
          nextTierMsg +
          `\n📱 *Open Live Mobile Dashboard (Zero Password):*\n` +
          `👉 https://hub.clarion.ng/p/${userPhone}\n` +
          `\n• Reply *FUND* to level up your multiplier immediately.\n` +
          `• Reply *WITHDRAW* on Thursdays to cash out your balance.\n` +
          `• Reply *DASHBOARD* to launch your terminal console.\n` +
          `• Reply *DATA* to view data packages.`
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
          `━━━━━━━━━━━━━━━\n\n` +
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

      // Squad Anti-Spam Gate & Handoff Router
      const isMasterSuper = isSuperParent(from) || isSuperParent(user.uid) || isSuperParent(actionableJid);
      const proxyBalance = await wallet.getBalance(user.uid).catch(() => 0);
      const totalSales = user.metrics?.totalOrders || 0;
      const isTier4Leader = isMasterSuper || (proxyBalance >= 6000 && totalSales >= 10);

      // ── STATE 1: Standard Child Proxy (Tier 1 to 3) -> Forward to Super Parent with Handoff Prompt ──
      if (!isTier4Leader) {
        const cleanSuggesterPhone = String(user.phoneNumber || actionableJid.split('@')[0] || '').replace(/\D/g, '');
        const suggesterName = user.name || user.franchiseName || 'Partner';

        if (db.users) {
          await db.users.doc(candidateJid).set({
            uid: candidateJid,
            phoneNumber: candidatePhone,
            phoneJid: candidateJid,
            name: candidateName,
            role: 'CHILD_PROXY',
            parentId: '2347032905036@s.whatsapp.net',
            mentorId: actionableJid,
            recruitedBy: actionableJid,
            state: 'AWAITING_SUPER_PARENT_DECISION',
            multiplierTier: 'Tier 1 (1X)',
            walletBalance: 0,
            suggestedAt: new Date().toISOString()
          }, { merge: true });
        }

        // Notify Chinedu (Suggester)
        await sock.sendMessage(from, {
          text: `✦ Clarion OS\n` +
            `━━━━━━━━━━━━━━\n` +
            `Candidate Submitted! 👥\n\n` +
            `${candidateName} (+${candidatePhone}) has been forwarded to Super Parent Mustapha Lawal Gambo for review.\n\n` +
            `Once approved, you will be alerted when pairing begins. 🚀`
        });

        // Store pending decision in MotherBot & notify Super Parent
        const decisionData = {
          candidateJid,
          candidatePhone,
          candidateName,
          suggesterJid: actionableJid,
          suggesterName,
          suggesterPhone: cleanSuggesterPhone
        };
        pendingSuperParentDecisions.set('2347032905036@s.whatsapp.net', decisionData);

        const superParentNotice = `✦ Clarion OS\n` +
          `━━━━━━━━━━━━━━\n` +
          `💡 New Partner Recommendation\n\n` +
          `Child Proxy ${suggesterName} (+${cleanSuggesterPhone}) has suggested a new partner:\n` +
          `👤 Candidate: ${candidateName} (+${candidatePhone})\n\n` +
          `How would you like to onboard ${candidateName}?\n\n` +
          `Reply:\n` +
          `*1* — HANDOFF to ${suggesterName} (He pairs directly via QR or Code)\n` +
          `*2* — ONBOARD MYSELF (Generate pairing code/QR right here)\n` +
          `*0* — DECLINE`;

        try {
          if (sessionManager && sessionManager.motherSock) {
            await sessionManager.motherSock.sendMessage('2347032905036@s.whatsapp.net', { text: superParentNotice });
          }
        } catch (mErr) {
          logger.warn(`Failed to alert Super Parent about candidate: ${mErr.message}`);
        }

        return;
      }

      // ── STATE 2: Tier 4 Semi-Parent / Super Parent Autonomous Squad Onboarding ──
      if (!isMasterSuper && db.users) {
        try {
          const squadSnap = await db.users.where('parentId', '==', user.uid).get();
          // Slot Liberation Rule: Graduated leaders do NOT consume active squad slots
          const activeUngraduated = squadSnap.docs.filter(d => !d.data().isGraduatedSquadLeader);
          const squadMentees = activeUngraduated.map(d => ({ uid: d.id, ...d.data() }));
          const dynamicCapacity = calculateDynamicSquadCapacity(user, squadMentees);

          if (activeUngraduated.length >= dynamicCapacity.capacity) {
            return sock.sendMessage(from, {
              text: `👥 *SQUAD CAPACITY REACHED (${dynamicCapacity.capacity} Slot${dynamicCapacity.capacity === 1 ? '' : 's'})*\n` +
                `━━━━━━━━━━━━━━\n` +
                `You have ${activeUngraduated.length} of ${dynamicCapacity.capacity} active partner${dynamicCapacity.capacity === 1 ? '' : 's'}.\n\n` +
                `📈 *To unlock your next slot:*\n` +
                `${dynamicCapacity.nextMilestone}\n\n` +
                `💡 When any partner reaches Tier 4 (₦6,000 float & 10 sales), their slot is FREED automatically — letting you recruit again while keeping lifetime royalties! 🚀\n\n` +
                `👉 Reply *SQUAD* to view your current squad & progress bar.`
            });
          }
        } catch (e) {}
      }

      const boundParentJid = isMasterSuper ? '2347032905036@s.whatsapp.net' : parentJid;

      if (db.users) {
        await db.users.doc(candidateJid).set({
          uid: candidateJid,
          phoneNumber: candidatePhone,
          phoneJid: candidateJid,
          name: candidateName,
          role: 'CHILD_PROXY',
          parentId: boundParentJid,
          mentorId: actionableJid,
          recruitedBy: actionableJid,
          state: 'AWAITING_PAIRING',
          multiplierTier: 'Tier 1 (1X)',
          walletBalance: 0,
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
        text: `⏳ *Generating Activation Pairing for ${candidateName} (+${candidatePhone})...*\n\n` +
          `Super Parent Sponsor: ${isMasterSuper ? 'Mustapha Lawal Gambo (07032905036)' : (user.name || 'Store Sponsor')}\n\n` +
          `Please stand by — the QR code image is preparing...`
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
            parentId: boundParentJid,
            mentorId: actionableJid,
            recruitedBy: actionableJid,
            role: 'CHILD_PROXY',
            multiplierTier: 'Tier 1 (1X)'
          },
          async (rawQR) => {
            try {
              const qrBuffer = await QRCode.toBuffer(rawQR, { width: 600, margin: 2 });
              await sock.sendMessage(from, {
                image: qrBuffer,
                caption: `✦ Clarion OS\n` +
                  `━━━━━━━━━━━━━━\n` +
                  `📸 *ACTIVATION PAIRING READY FOR ${candidateName.toUpperCase()}* ⚡\n\n` +
                  `Candidate: ${candidateName} (+${candidatePhone})\n` +
                  `Linked Sponsor: ${isMasterSuper ? 'Super Parent 07032905036' : (user.name || 'Store Sponsor')}\n\n` +
                  `*Option A — Physical Linking (Together in person):*\n` +
                  `1. ${candidateName} opens WhatsApp on *+${candidatePhone}*\n` +
                  `2. Goes to *Settings > Linked Devices > Link a Device*\n` +
                  `3. Points phone camera at this QR image right now!\n\n` +
                  `*Option B — Remote Linking (Different locations):*\n` +
                  `👉 Reply *PAIRCODE ${candidatePhone}* to get an official 8-digit activation code to forward to them!\n\n` +
                  `⏱️ *Expires in 60 seconds.*`
              });
            } catch (err) {
              logger.error('Error generating referral QR buffer:', err);
            }
          }
        );
      } catch (pairErr) {
        logger.error('Failed to start suggested pairing:', pairErr.message);
        return sock.sendMessage(from, {
          text: `❌ Could not generate pairing for ${candidateName}. Please verify the phone number and try again.`
        });
      }
      return;
    }

    // ── Handle PAIRCODE keyword (Remote 8-Digit Pairing Code Generator) ──
    const pairCodeRegex = /^\.?paircode\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})$/i;
    const pairCodeMatch = command.match(pairCodeRegex);

    if (pairCodeMatch) {
      let rawTarget = pairCodeMatch[1].replace(/\D/g, '');
      if (rawTarget.startsWith('0') && rawTarget.length === 11) rawTarget = '234' + rawTarget.substring(1);
      const targetPhone = rawTarget;
      const targetJid = `${targetPhone}@s.whatsapp.net`;
      const isMasterSuper = isSuperParent(from) || isSuperParent(user.uid) || isSuperParent(actionableJid);
      const boundParentJid = isMasterSuper ? '2347032905036@s.whatsapp.net' : (user.parentId || user.uid);

      await sock.sendMessage(from, {
        text: `⏳ *Requesting 8-digit remote pairing code for +${targetPhone}...*\nPlease wait up to 10 seconds.`
      });

      try {
        const code = await sessionManager.requestPairingCodeForUser({
          uid: targetJid,
          phoneJid: targetJid,
          phoneNumber: targetPhone,
          parentId: boundParentJid,
          ownerJid: from,
          motherJid: from
        });

        return sock.sendMessage(from, {
          text: `🔢 *REMOTE PAIRING CODE FOR +${targetPhone}* ⚡\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Forward this message directly to your partner on WhatsApp:\n\n` +
            `*Official Clarion Activation Code:*\n` +
            `👉 \`${code}\`\n\n` +
            `*How to link:*\n` +
            `1. Open WhatsApp > Linked Devices > Link a Device\n` +
            `2. Tap *"Link with phone number instead"*\n` +
            `3. Enter the code above: \`${code}\`\n\n` +
            `⏱️ _Expires in 60 seconds. Once entered, their 24/7 AI bot activates instantly._`
        });
      } catch (err) {
        logger.error('Failed to request remote pairing code:', err.message);
        return sock.sendMessage(from, {
          text: `❌ Could not generate pairing code: ${err.message}. Please verify the phone number and try again.`
        });
      }
    }

    // ── Handle BANK keyword (NIBSS 2-Step Bank Account Linking) ──
    const bankRegex = /^\.?bank(?:\s+(\d{10})\s+(.+))?$/i;
    const bankMatch = command.match(bankRegex);

    if (bankMatch) {
      const acctNum = bankMatch[1];
      const bankNameInput = bankMatch[2];

      if (!acctNum || !bankNameInput) {
        const currentBank = user.bankDetails;
        const currentBankText = currentBank?.verified
          ? `🏦 *Currently Linked Account:*\n` +
            `• Bank: ${currentBank.bankName}\n` +
            `• Account: ${currentBank.accountNumber}\n` +
            `• Name: ${currentBank.accountName || user.verifiedName || 'Verified'} ✅\n\n` +
            `To change your bank account, reply:\n`
          : `You have not connected a bank account yet.\n\nTo link your account, reply:\n`;

        return sock.sendMessage(from, {
          text: `🏦 *Clarion Bank Account Binding*\n\n` +
            currentBankText +
            `👉 *BANK [10-digit Account Number] [Bank Name]*\n` +
            `Example: *BANK 0123456789 GTBank*\n\n` +
            `_Your account will be verified directly with NIBSS before linking._`
        });
      }

      await sock.sendMessage(from, {
        text: `🔍 *Verifying account with NIBSS via Paystack...*\nPlease wait a moment.`
      });

      try {
        const banks = await paystack.getBanks();
        const matchedBank = matchBank(banks, bankNameInput);

        if (!matchedBank) {
          return sock.sendMessage(from, {
            text: `❌ Could not find a bank matching "*${bankNameInput}*".\n\n` +
              `Please check the spelling and try again (e.g. *GTBank*, *Access Bank*, *Kuda*, *Opay*, *First Bank*, *Zenith*).`
          });
        }

        const accountInfo = await paystack.validateBankAccount(matchedBank.code, acctNum);
        const resolvedName = accountInfo?.accountName;

        if (!resolvedName) {
          return sock.sendMessage(from, {
            text: `❌ Could not resolve account name for *${acctNum}* at ${matchedBank.name}. Please confirm your 10-digit NUBAN.`
          });
        }

        // Store candidate in awaitingBankConfirmMap
        awaitingBankConfirmMap.set(userSessionKey, {
          bankCode: matchedBank.code,
          bankName: matchedBank.name,
          accountNumber: acctNum,
          accountName: resolvedName,
          timestamp: Date.now()
        });

        return sock.sendMessage(from, {
          text: `🔍 *PLEASE CONFIRM YOUR BANK ACCOUNT:*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `🏦 *Bank:* ${matchedBank.name}\n` +
            `🔢 *Account Number:* ${acctNum}\n` +
            `👤 *Account Name:* ${resolvedName} ✅\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Reply *1* to CONFIRM & LINK THIS ACCOUNT\n` +
            `Reply *2* to ENTER A DIFFERENT ACCOUNT\n` +
            `· Reply *CANCEL* to abort`
        });
      } catch (err) {
        logger.error(`Bank validation error for ${acctNum}:`, err.message);
        return sock.sendMessage(from, {
          text: `❌ Account verification failed: ${err.message || 'Invalid account details'}.\n\nPlease double check your account number and bank name.`
        });
      }
    }

    // ── Handle WITHDRAW keyword (On-Demand Thursday Payouts) ──
    const withdrawRegex = /^\.?withdraw(?:\s+(all|\d+))?$/i;
    const withdrawMatch = command.match(withdrawRegex);

    if (withdrawMatch) {
      const partnerUid = isOwner ? user.uid : actionableJid;
      const balance = await wallet.getBalance(partnerUid);
      const todayDay = new Date().getDay();
      const isThursday = todayDay === 4 || config.mockMode;

      // 1. Non-Thursday Rejection Gate
      if (!isThursday) {
        return sock.sendMessage(from, {
          text: `🗓️ *CLARION CASHOUT WINDOW NOTICE* 💳\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Withdrawals are processed exclusively every *THURSDAY*!\n\n` +
            `💰 *Your current withdrawable earnings:* ₦${balance.toLocaleString()}\n` +
            `📈 *Your funds are currently active in your wallet, earning you up to 4X Multiplier power on every customer order!*\n\n` +
            `💡 *Need data right now?*\n` +
            `You can use your wallet balance to BUY or GIFT data anytime 24/7 with zero waiting!\n` +
            `👉 Reply *BUY [code]* (e.g. *BUY M2GBS*) to vend data instantly.\n\n` +
            `👉 *Next bank cashout window opens this Thursday at 12:00 AM.*\n` +
            `· Type *BALANCE* anytime to view your earnings.`
        });
      }

      // 2. Thursday Liquidity Check (< ₦2,000 Tier 1 Locked)
      if (balance < WITHDRAWAL_FEES.MIN_WITHDRAWAL) {
        return sock.sendMessage(from, {
          text: `🔒 *CASHOUT LOCKED (TIER 1 BASE STATE)*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Your current earnings balance is *₦${balance.toLocaleString()}*.\n\n` +
            `Bank cashouts unlock at *Tier 2 (₦2,000)* to activate your 2X Multiplier.\n\n` +
            `💡 *You can use your wallet balance anytime to BUY or GIFT data 24/7!*\n` +
            `👉 Reply *BUY [code]* to purchase data with zero fees.\n` +
            `👉 Share your bot to earn higher multipliers and reach the ₦2,000 threshold!`
        });
      }

      // 3. Bank Account Verification Gate
      let targetUserDoc = user;
      if (db.users) {
        try {
          const uDoc = await db.users.doc(partnerUid).get();
          if (uDoc.exists) targetUserDoc = uDoc.data();
        } catch (e) {}
      }

      const bank = targetUserDoc.bankDetails;
      if (!bank || !bank.verified) {
        return sock.sendMessage(from, {
          text: `🏦 *LINK YOUR BANK ACCOUNT FIRST*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `To withdraw your earnings, please connect your verified personal bank account.\n\n` +
            `👉 Reply: *BANK [10-Digit Account Number] [Bank Name]*\n` +
            `Example: *BANK 0123456789 GTBank*`
        });
      }

      // 4. Instructions if no amount specified (e.g. just typed "WITHDRAW")
      const rawArg = withdrawMatch[1] ? withdrawMatch[1].toLowerCase() : null;
      if (!rawArg) {
        return sock.sendMessage(from, {
          text: `💸 *CLARION THURSDAY CASHOUT* 🚀\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 *Available Balance:* ₦${balance.toLocaleString()}\n` +
            `🏦 *Destination Bank:* ${bank.bankName} (${bank.accountNumber})\n` +
            `👤 *Account Name:* ${bank.accountName}\n` +
            `🛡️ *Withdrawal Fee:* ₦${WITHDRAWAL_FEES.TOTAL.toFixed(2)} (₦50 Paystack + ₦50 Clarion)\n\n` +
            `👉 Reply *WITHDRAW [amount]* (e.g. *WITHDRAW 4000*)\n` +
            `👉 Reply *WITHDRAW ALL* to cash out your entire balance (₦${balance.toLocaleString()})\n\n` +
            `_💡 Pro-Tip: Keeping ₦2,000+ maintains your 2X Multiplier. Keeping ₦6,000+ locks in 4X Max Power + 5 Squad Slots!_`
        });
      }

      // 5. Determine withdrawal amount
      let requestedAmount = 0;
      if (rawArg === 'all') {
        requestedAmount = balance;
      } else {
        requestedAmount = parseInt(rawArg, 10);
      }

      if (isNaN(requestedAmount) || requestedAmount < WITHDRAWAL_FEES.MIN_WITHDRAWAL) {
        return sock.sendMessage(from, {
          text: `❌ Minimum withdrawal amount is *₦${WITHDRAWAL_FEES.MIN_WITHDRAWAL.toLocaleString()}*.\n\n` +
            `👉 Reply *WITHDRAW [amount]* (e.g. *WITHDRAW 1000*) or *WITHDRAW ALL*.`
        });
      }

      if (requestedAmount > balance) {
        return sock.sendMessage(from, {
          text: `❌ *Insufficient Balance*\n\n` +
            `You requested *₦${requestedAmount.toLocaleString()}*, but your available balance is *₦${balance.toLocaleString()}*.\n\n` +
            `👉 Reply *WITHDRAW ${Math.floor(balance)}* or *WITHDRAW ALL*.`
        });
      }

      // 6. Execute Paystack Transfer
      const netPayout = +(requestedAmount - WITHDRAWAL_FEES.TOTAL).toFixed(2);
      const transferRef = `WDR_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      await sock.sendMessage(from, {
        text: `⏳ *Processing Thursday Cashout...*\n\n` +
          `Disbursing *₦${netPayout.toLocaleString()}* (Gross: ₦${requestedAmount.toLocaleString()} - ₦100 fee) to *${bank.bankName}* (${bank.accountNumber})...`
      });

      try {
        await paystack.initiateTransfer(
          netPayout,
          bank.bankCode,
          bank.accountNumber,
          `Clarion Cashout ${targetUserDoc.name || ''}`.trim(),
          transferRef
        );

        await wallet.recordWithdrawal(partnerUid, requestedAmount, bank, transferRef);

        const remainingBal = +(balance - requestedAmount).toFixed(2);

        return sock.sendMessage(from, {
          text: `✅ *CASHOUT SUCCESSFUL!* 💸\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 *Gross Amount Debited:* ₦${requestedAmount.toLocaleString()}\n` +
            `🛡️ *Fee Deducted:* ₦${WITHDRAWAL_FEES.TOTAL.toFixed(2)} (Paystack ₦50 + Clarion ₦50)\n` +
            `💵 *Net Disbursed to Bank:* ₦${netPayout.toLocaleString()}\n\n` +
            `🏦 *Bank:* ${bank.bankName}\n` +
            `🔢 *Account Number:* ${bank.accountNumber}\n` +
            `👤 *Account Name:* ${bank.accountName}\n` +
            `🔖 *Transfer Reference:* \`${transferRef}\`\n\n` +
            `💼 *Remaining Wallet Balance:* ₦${remainingBal.toLocaleString()}\n\n` +
            `⚠️ _Pro-Tip: Keeping ₦2,000+ maintains your 2X Multiplier. Keeping ₦6,000+ locks in 4X Max Power!_\n\n` +
            `Thank you for being a valued Clarion Partner! 🚀`
        });
      } catch (err) {
        logger.error(`Cashout failed for ${partnerUid}:`, err.message);
        return sock.sendMessage(from, {
          text: `❌ *Transfer Temporarily Delayed*\n\n` +
            `Paystack banking network reported: ${err.message || 'Service busy'}.\n\n` +
            `🔒 *Your funds are completely safe and remain in your wallet.*\n` +
            `Please try again in 30 minutes.`
        });
      }
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
        } catch (e) { }
      }

      const currentFuel = await wallet.getDataFuelBalance(user.uid);
      const rankEmoji = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎖️';
      const thursdayRef = getThursdayReference();

      const stateCodeStatus = user.isStateCodeVerified
        ? `✅ Verified (${user.stateCode})`
        : `⚠️ Missing (Reply *STATECODE [YourCode]* to qualify for promotion ${thursdayRef}!)`;

      return sock.sendMessage(from, {
        text: `📊 *Your Partner Performance & Rank*\n` +
          `━━━━━━━━━━━━━━━\n\n` +
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

      const thursdayRef = getThursdayReference();

      return sock.sendMessage(from, {
        text: `✅ *NYSC State Code Verified!* (${verifiedCode})\n\n` +
          `Your profile is now verified as an active Corps Member. You are officially eligible for promotion to a Full Parent Store ${thursdayRef} when you reach Rank #1! 🇳🇬`
      });
    }

    // ── Handle KEYWORDS / COMMANDS / HELP / TIPS / STORE / HOWTO Directory ──
    const isKeywordsMatch = /^\.?(?:keywords?|commands?|help|tips|store|howto)$/i.test(command);
    if (isKeywordsMatch) {
      const isMasterSuper = isSuperParent(from) || isSuperParent(user.uid) || isSuperParent(actionableJid);
      let userBalance = 0;
      try {
        userBalance = await wallet.getBalance(user.uid);
      } catch (e) { }
      const currentTier = getMultiplierTier(userBalance);
      const userPhone = (user.phoneNumber || (isOwner ? (user.phoneNumber || from.split('@')[0]) : actionableJid.split('@')[0])).replace(/\D/g, '');

      const storeHelpText = `✦ Clarion Store OS · Command Directory\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Welcome to your franchise command center. Your AI bot runs 24/7 in autonomous mode.\n\n` +
        `🛍️ *VENDING & CATALOG*\n` +
        `• *DATA* — Browse the live data package catalog\n` +
        `• *DATA [budget]* — Filter plans (e.g. *DATA 1000* or *DATA 2500*)\n` +
        `• *BUY [code]* — Vend for yourself or gift someone at wholesale\n` +
        `• *MTN* / *GLO* / *AIRTEL* — Quick-filter plans by telecom network\n\n` +
        `💳 *WALLET & EARNINGS*\n` +
        `• *BALANCE* — View active wallet float, Multiplier status & yield\n` +
        `• *FUND [amount]* — Add float to upgrade Multiplier (e.g. *FUND 2000*)\n` +
        `• *WITHDRAW* — Cash out earnings to your bank (every Thursday)\n` +
        `• *BANK [Account] [Bank]* — Bind or update verified NUBAN account\n\n` +
        `👥 *SQUAD & NETWORK*\n` +
        `• *SQUAD* — View your 5-partner downline & unlock progress\n` +
        `• *SUGGEST [Phone] [Name]* — Onboard a new partner (Tier 4)\n` +
        `• *PAIRCODE [Phone]* — Generate remote 8-digit WhatsApp linking code\n` +
        `• *STATS* — Lifetime sales, total orders & revenue analytics\n\n` +
        `🔧 *TOOLS & ASSISTANCE*\n` +
        `• *DASHBOARD* / *STATUS* — Mobile terminal console & live auto-status timer\n` +
        `• *BACKUP CONTACTS* — Export all customer leads as .vcf to phone\n` +
        `• *TIPS* — View top pro-tips to increase daily customer orders\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `⭐ *Your Status:* ${currentTier.name} (${currentTier.multiplier} Power)\n` +
        `📱 *Open Live Mobile Dashboard (Zero Password):*\n` +
        `👉 https://hub.clarion.ng/p/${userPhone}\n\n` +
        `💡 *Pro-Tip:* When friends text DATA to this chat, Clarion automatically takes payment and delivers data in 3 seconds. You keep the profit without lifting a finger. ✦`;

      return sock.sendMessage(from, { text: storeHelpText });
    }

    // ── Handle SQUAD / MYREFS / PARTNERS keyword (Dynamic Multi-Tier Architecture) ──
    if (cleanCommand === 'squad' || cleanCommand === 'myrefs' || cleanCommand === 'partners') {
      const isMasterSuper = isSuperParent(from) || isSuperParent(user.uid) || isSuperParent(actionableJid);
      let proxyBalance = 0;
      try {
        proxyBalance = await wallet.getBalance(user.uid);
      } catch (e) { }

      const tier = getMultiplierTier(proxyBalance);
      const userMetrics = user.metrics || {};
      const totalSales = userMetrics.totalOrders || 0;

      // ── Tier 4 / Super Parent Dashboard: Live Squad Management ──
      if (isMasterSuper || (tier.level === 4 && totalSales >= 10)) {
        let refsSnap = { empty: true, size: 0, docs: [] };
        if (db.users) {
          try {
            if (isMasterSuper) {
              refsSnap = await db.users.where('parentId', 'in', [user.uid, '2347032905036@s.whatsapp.net', '07032905036', actionableJid]).get().catch(async () => {
                return await db.users.where('parentId', '==', user.uid).get();
              });
            } else {
              refsSnap = await db.users.where('parentId', '==', user.uid).get();
            }
          } catch (e) {
            logger.warn('Failed to query squad downline:', e.message);
          }
        }

        const allDocs = refsSnap.docs || [];
        const graduatedLeaders = allDocs.filter(d => d.data().isGraduatedSquadLeader);
        const activeDirectSquad = allDocs.filter(d => !d.data().isGraduatedSquadLeader);

        // Calculate dynamic squad capacity for Tier 4 leaders
        const squadMenteeData = activeDirectSquad.map(d => ({ uid: d.id, ...d.data() }));
        const dynamicCapacity = isMasterSuper
            ? { capacity: 80, nextMilestone: null, progressPercent: 100, totalSquadOrders: 0, maxSingleMenteeOrders: 0 }
            : calculateDynamicSquadCapacity(user, squadMenteeData);

        const activeCount = isMasterSuper ? allDocs.length : activeDirectSquad.length;
        const maxSlots = isMasterSuper ? 80 : dynamicCapacity.capacity;

        // Build progress bar for slot unlock (10 segments)
        let progressBar = '';
        if (!isMasterSuper && dynamicCapacity.capacity < 5) {
            const pct = dynamicCapacity.progressPercent || 0;
            const filled = Math.round((pct / 100) * 10);
            progressBar = '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '] ' + pct + '%';
        }

        let msgText = `✦ Clarion OS\n` +
          `━━━━━━━━━━━━━━\n` +
          `Clarion Squad Command · Tier 4\n\n` +
          `👤 Leader: ${user.name || 'You'}\n` +
          `⭐ Multiplier: 4X Quad Power\n` +
          `👥 Capacity: ${activeCount} / ${maxSlots} Slots Unlocked\n`;

        if (!isMasterSuper && dynamicCapacity.capacity < 5 && dynamicCapacity.nextMilestone) {
            msgText += `\n📈 *Next Capacity Unlock:*\n` +
              `• ${dynamicCapacity.nextMilestone}\n` +
              `• Progress: ${progressBar}\n`;
        } else if (!isMasterSuper && dynamicCapacity.capacity === 5) {
            msgText += `\n👑 *Maximum Squad Capacity Achieved!*\n`;
        }

        msgText += `\n`;

        if (allDocs.length === 0) {
          msgText += `You have no active partners linked yet.\n\n` +
            `👉 Reply *SUGGEST [Phone] [Name]* to onboard your first partner!\n` +
            `_You earn a passive 30% override on every sale your squad makes._\n\n`;
        } else {
          if (activeDirectSquad.length > 0) {
            msgText += `*Active Direct Partners:*\n`;
            let pIdx = 1;
            activeDirectSquad.forEach(doc => {
              const d = doc.data();
              const phone = d.phoneNumber || doc.id.split('@')[0];
              const pName = d.name || d.franchiseName || 'Partner';
              const m = d.metrics || {};
              const orders = m.totalOrders || 0;
              const rev = (m.totalRevenueNaira || 0).toLocaleString();
              msgText += `${pIdx}. *${pName}* (+${phone}) · 🟢 Online · ${orders} Orders (₦${rev})\n`;
              pIdx++;
            });
          }

          if (graduatedLeaders.length > 0) {
            msgText += `\n🎓 *Graduated Autonomous Leaders (Slots Liberated):*\n`;
            let gIdx = 1;
            graduatedLeaders.forEach(doc => {
              const d = doc.data();
              const phone = d.phoneNumber || doc.id.split('@')[0];
              const pName = d.name || d.franchiseName || 'Leader';
              msgText += `${gIdx}. *${pName}* (+${phone}) · 4X Autonomous Node (10% Personal Royalty + 5% Squad Royalty Active) 👑\n`;
              gIdx++;
            });
          }

          // Show available slots vs locked slots for regular Tier 4
          if (!isMasterSuper) {
            const availableSlots = Math.max(0, dynamicCapacity.capacity - activeCount);
            if (availableSlots > 0) {
              msgText += `\n*Available Slots:* ${availableSlots} Open\n`;
              for (let s = activeCount + 1; s <= dynamicCapacity.capacity; s++) {
                msgText += `${s}. _[Available Slot]_ ➔ Reply *SUGGEST [Phone] [Name]*\n`;
              }
            }
            if (dynamicCapacity.capacity < 5) {
              msgText += `\n🔒 *Slots ${dynamicCapacity.capacity + 1}–5 Locked* — Unlock via downline performance.\n`;
            }
          }
          msgText += `\n`;
        }

        msgText += `━━━━━━━━━━━━━━\n` +
          `👉 Reply *SUGGEST [Phone] [Name]* to bind a partner.\n` +
          `👉 Reply *PAIRCODE [Phone]* to generate a remote 8-digit activation code.`;

        return sock.sendMessage(from, { text: msgText });
      }

      // ── Tier 3 Pre-Unlock Surge Card ($4,000 <= W < $6,000) ──
      if (tier.level === 3) {
        const gap = Math.max(0, 6000 - proxyBalance);
        const salesCheck = totalSales >= 10 ? '✅' : `(${totalSales}/10 Completed)`;
        const filledBars = Math.min(12, Math.floor((proxyBalance / 6000) * 12));
        const emptyBars = Math.max(0, 12 - filledBars);
        const pBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

        return sock.sendMessage(from, {
          text: `✦ Clarion Squad Network · Level 3\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔥 *You are 1 step away from Squad Leadership!*\n` +
            `Active Earning Power: *Tier 3 (3X Multiplier)*\n\n` +
            `🔒 *Squad Unlock Status:*\n` +
            `• Sales Milestone: ${totalSales >= 10 ? '10/10 completed ✅' : `${totalSales}/10 completed ⏳`}\n` +
            `• Wallet Liquidity: [${pBar}] ₦${proxyBalance.toLocaleString()} / ₦6,000\n` +
            `• Gap to Unlock: *Just ₦${gap.toLocaleString()} remaining!*\n\n` +
            `*Once you reach ₦6,000:*\n` +
            `✦ 4X Maximum Multiplier unlocked on all customer sales.\n` +
            `✦ 4X Wholesale Discount on personal & gift data.\n` +
            `✦ Squad Slot #1 unlocked — earn more slots as your mentee sells!\n\n` +
            `👉 Reply *FUND ${gap}* to activate Squad Leadership right now.`
        });
      }

      // ── Tier 2 Progression Card ($2,000 <= W < $4,000) ──
      if (tier.level === 2) {
        const gap = Math.max(0, 6000 - proxyBalance);
        const salesCheck = totalSales >= 10 ? '✅' : `(${totalSales}/10 Completed)`;

        return sock.sendMessage(from, {
          text: `✦ Clarion Squad Network · Level 2\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎉 *Thursday Cashouts: UNLOCKED* ✅\n` +
            `Active Earning Power: *Tier 2 (2X Multiplier)*\n\n` +
            `You are halfway to becoming a Squad Leader!\n\n` +
            `🔒 *Squad Unlock Roadmap:*\n` +
            `1. Completed Sales: ${totalSales}/10 orders ${salesCheck}\n` +
            `2. Wallet Liquidity: ₦${proxyBalance.toLocaleString()} / ₦6,000 float\n` +
            `   ↳ Need ₦${gap.toLocaleString()} more to reach Tier 4 (4X Max Power)\n\n` +
            `✨ *Squad Leadership Privilege:*\n` +
            `At Tier 4, you unlock 5 Squad Partner slots. 5 bots selling 10 plans/day each generates ₦15,000+ monthly passive income directly to your wallet.\n\n` +
            `👉 Reply *FUND ${gap}* to jump directly to Tier 4.`
        });
      }

      // ── Tier 1 Teaser & Roadmap Card (W < $2,000 or < 10 sales) ──
      const neededForTier2 = tier.neededForNext || 500;
      const salesFilled = Math.min(10, totalSales);
      const salesBar = '█'.repeat(salesFilled) + '░'.repeat(10 - salesFilled);
      const floatFilled = Math.min(10, Math.floor((proxyBalance / 6000) * 10));
      const floatBar = '█'.repeat(floatFilled) + '░'.repeat(10 - floatFilled);

      return sock.sendMessage(from, {
        text: `✦ Clarion Squad Network · Level 1\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Build a passive sales downline with up to 5 child proxy bots.\n\n` +
          `*How Squad Works:*\n` +
          `You sponsor up to 5 partners. Clarion deploys an automated 24/7 AI bot on their WhatsApp lines. You earn a passive 30% override on every data bundle their bots sell—forever.\n\n` +
          `🔒 *Unlocking Requirements:*\n` +
          `1. Operational Milestone: 10 completed data sales\n` +
          `   Progress: [${salesBar}] ${totalSales}/10 Completed\n` +
          `2. Capital Floor: Tier 4 Liquidity (₦6,000 Wallet Float)\n` +
          `   Progress: [${floatBar}] ₦${proxyBalance.toLocaleString()} / ₦6,000\n\n` +
          `✨ *Next Milestone:*\n` +
          `Add *₦${neededForTier2.toLocaleString()}* to reach Tier 2 (2X Power) and unlock Thursday personal bank cashouts!\n\n` +
          `👉 Reply *FUND* to add wallet float.\n` +
          `👉 Reply *KEYWORDS* to view all store commands.`
      });
    }

    // ── Handle SETSPLIT keyword (Legacy Compatibility Notice) ──
    const setSplitRegex = /^\.?setsplit\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})\s+(\d{1,2}|100)$/i;
    const setSplitMatch = command.match(setSplitRegex);

    if (setSplitMatch) {
      return sock.sendMessage(from, {
        text: `✦ *Dynamic Liquidity Settlement Active* ⚡\n\n` +
          `Profit splits are now powered automatically by each partner's liquidity tier (1X to 4X Multipliers), ensuring maximum fairness and zero revenue leakage.\n\n` +
          `👉 Reply *SQUAD* to inspect your live partner roster and metrics.`
      });
    }

    // ── Handle DASHBOARD / APP / LINK or STATUS [1|2|3] command ──
    const isDashboardMatch = /^\.?(?:dashboard|app|portal|console|link|mylink)$/i.test(command);
    const statusFreqRegex = /^\.?status(?:\s+(1|2|3|0|on|off))?$/i;
    const statusFreqMatch = command.match(statusFreqRegex);

    if (isDashboardMatch || statusFreqMatch) {
      const requestedFreq = statusFreqMatch && statusFreqMatch[1] ? statusFreqMatch[1].toLowerCase() : null;
      const isParentOrIndependent = !user.parentId || user.role === 'PARENT';

      // Child proxy attempting to modify status frequency
      if (requestedFreq && !isParentOrIndependent) {
        const currentFreq = user.statusFrequency || 3;
        return sock.sendMessage(from, {
          text: `🔒 *SQUAD MANAGEMENT CONTROL*\n\n` +
            `Status post frequency is managed centrally by your Parent Store.\n\n` +
            `• Current Squad Frequency: *${currentFreq} post${currentFreq > 1 ? 's' : ''} daily*\n\n` +
            `Your store automatically stays synchronized with your parent franchise! 🚀`
        });
      }

      // Guardrail: Cannot disable auto-status (never 0)
      if (requestedFreq === '0' || requestedFreq === 'off') {
        return sock.sendMessage(from, {
          text: `⚠️ *CANNOT DISABLE AUTO-STATUS*\n\n` +
            `Automated status posts drive continuous customer orders to your storefront.\n\n` +
            `You can choose between:\n` +
            `• *STATUS 1* — 1 post daily (9:00 AM)\n` +
            `• *STATUS 2* — 2 posts daily (9:00 AM & 7:30 PM)\n` +
            `• *STATUS 3* — 3 posts daily (Morning, Afternoon & Evening)\n\n` +
            `👉 Reply *STATUS 1*, *STATUS 2*, or *STATUS 3*.`
        });
      }

      // Valid frequency selection (1, 2, or 3)
      if (requestedFreq === '1' || requestedFreq === '2' || requestedFreq === '3') {
        const numFreq = parseInt(requestedFreq, 10);
        if (db.users) {
          await db.users.doc(user.uid).set({
            statusFrequency: numFreq
          }, { merge: true });
        }
        user.statusFrequency = numFreq;

        const scheduleDesc = numFreq === 1
          ? '1 post daily (Morning 9:00 AM)'
          : numFreq === 2
            ? '2 posts daily (Morning 9:00 AM & Evening 7:30 PM)'
            : '3 posts daily (Morning 9:00 AM, Afternoon 1:30 PM & Evening 7:30 PM)';

        return sock.sendMessage(from, {
          text: `✅ *Auto-Status Frequency Updated!*\n\n` +
            `• Frequency: *${scheduleDesc}*\n` +
            `• Squad Sync: All active partners in your Squad have also been synchronized to this frequency! ⚡\n\n` +
            `Automated status posts will continue bringing orders to your store.`
        });
      }

      // Default (STATUS, DASHBOARD, APP, LINK): Node Status + Live Mobile Dashboard Link
      const userPhone = (user.phoneNumber || (isOwner ? (user.phoneNumber || from.split('@')[0]) : actionableJid.split('@')[0])).replace(/\D/g, '');
      const proxyBalance = await wallet.getBalance(user.uid).catch(() => 0);
      const tier = getMultiplierTier(proxyBalance);
      const currentFreq = user.statusFrequency || 3;
      const isDev = process.env.NODE_ENV !== 'production';
      const dashboardUrl = isDev ? `http://localhost:3000/p/${userPhone}` : `https://hub.clarion.ng/p/${userPhone}`;

      return sock.sendMessage(from, {
        text: `✦ Clarion Store OS · Node Status\n` +
          `━━━━━━━━━━━━━━\n` +
          `👤 Operator: ${user.name || user.franchiseName || 'Partner'}\n` +
          `⭐ Active Status: ${tier.name} (${tier.multiplier} Power)\n` +
          `💼 Wallet Float: ₦${proxyBalance.toLocaleString()}\n` +
          `🟢 24/7 Autonomous Bot: ${user.botMode === 'manual' ? 'MANUAL' : 'ACTIVE'}\n` +
          `📢 Auto-Status: ${currentFreq} posts/day (Change with STATUS 1, 2, or 3)\n\n` +
          `📱 *Open Live Mobile Dashboard (Zero Password):*\n` +
          `👉 ${dashboardUrl}\n\n` +
          `_Tap link above to inspect real-time sales, auto-status countdown, and toggle settings._ ✦`
      });
    }

    // ── Handle BACKUP CONTACTS / SYNC CONTACTS keyword ──
    if (cleanCommand === 'backup contacts' || cleanCommand === 'sync contacts' || cleanCommand === 'contacts backup') {
      try {
        await sock.sendMessage(from, { text: '⏳ Gathering and backing up all your contacts... Generating vCard (.vcf) file...' });
        const storeName = user.brandName || user.franchiseName || ('Clarion - ' + (user.verifiedName || user.name || 'Store'));
        const result = await contactBackupService.executeBackup(user.uid, sock, storeName);

        if (result.vcf) {
          const cleanPhone = (user.phoneNumber || user.uid).replace(/\D/g, '');
          return sock.sendMessage(from, {
            document: Buffer.from(result.vcf, 'utf-8'),
            fileName: `Clarion_Contacts_Backup_${cleanPhone}.vcf`,
            mimetype: 'text/vcard',
            caption: `✅ *WhatsApp Contacts Backup Completed!*\n\n` +
              `📱 *Total Contacts Backed Up:* ${result.count}\n` +
              `📁 *Format:* Standard vCard (.vcf)\n\n` +
              `💡 *Tip:* Tap the attached file above to import/restore these contacts into your phone address book or Google Contacts.\n\n` +
              `🎯 *Status Reach:* Your automated WhatsApp Status updates will now reach all ${result.count} contacts!`
          });
        } else {
          return sock.sendMessage(from, { text: `✅ Contacts sync completed. Harvested ${result.count} contacts.` });
        }
      } catch (err) {
        logger.error(`ProxyBot backup contacts failed for ${user.uid}: ${err.message}`);
        return sock.sendMessage(from, { text: `❌ Backup contacts failed: ${err.message}` });
      }
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
              `━━━━━━━━━━━━━━━\n\n` +
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
      } catch (err) { }

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
          const cDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
          if (cDoc.exists) customerWallet = cDoc.data().walletBalance || 0;
        } catch (e) { }
      }

      const orderRef = `CLARION_AIR_${Date.now()}`;

      if (customerWallet >= amount) {
        await sock.sendMessage(from, { text: `💳 *Wallet Vending Proceeding*\n\nDeducting ₦${amount.toLocaleString()} from your Clarion Wallet. Dispensing airtime...` });

        if (db.users) {
          await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).set({
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
            }).catch(() => { });
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
            }).catch(() => { });
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
        }).catch(() => { });
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
          const cDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
          if (cDoc.exists) customerWallet = cDoc.data().walletBalance || 0;
        } catch (e) { }
      }

      const orderRef = `CLARION_PIN_${Date.now()}`;

      if (customerWallet >= product.sellPrice) {
        await sock.sendMessage(from, { text: `💳 *Wallet Vending Proceeding*\n\nDeducting ₦${product.sellPrice.toLocaleString()} from your Clarion Wallet. Generating exam PIN...` });

        if (db.users) {
          await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).set({
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
            }).catch(() => { });
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
        }).catch(() => { });
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
        await db.users.doc(user.uid).set({ activePromo: updatedPromo }, { merge: true }).catch(() => { });
      }
      user.activePromo = updatedPromo;

      // Check if contact was previously introduced
      let isFirstTime = true;
      if (db.users && actionableJid) {
        try {
          const contactDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
          if (contactDoc.exists && contactDoc.data().introduced === true) {
            isFirstTime = false;
          }
          await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).set({
            introduced: true,
            introducedAt: new Date().toISOString()
          }, { merge: true }).catch(() => { });
        } catch (e) { }
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
      // Disambiguate arguments: budget vs phone number
      const dataArgs = command.replace(/^\.?(?:data|mtn|glo|airtel)\s*/i, '').trim().split(/\s+/);
      let targetPrice = null;
      let targetPhone = null;

      for (const arg of dataArgs) {
        const cleanArg = arg.replace(/\D/g, '');
        if ((cleanArg.startsWith('0') && cleanArg.length === 11) || (cleanArg.startsWith('234') && cleanArg.length === 13) || cleanArg.length === 10) {
          targetPhone = cleanArg.startsWith('0') ? cleanArg : ('0' + cleanArg.slice(-10));
        } else if (/^\d+$/.test(arg) && parseInt(arg, 10) <= 100000) {
          targetPrice = parseInt(arg, 10);
        }
      }

      // Check for recently shared contact card if no targetPhone in command
      if (!targetPhone) {
        const cachedGift = awaitingGiftMap.get(userSessionKey);
        if (cachedGift && Date.now() - cachedGift.timestamp < 5 * 60 * 1000) {
          targetPhone = cachedGift.recipientPhone;
        }
      }

      // Determine network
      let forceNetwork = null;
      if (isMtnAlias) forceNetwork = 'mtn';
      if (isGloAlias) forceNetwork = 'glo';
      if (isAirtelAlias) forceNetwork = 'airtel';

      const callerPhone = actionableJid.split('@')[0];
      const detectedNet = forceNetwork || detectNetwork(targetPhone || callerPhone) || 'mtn';
      const netLabel = detectedNet.toUpperCase();

      // Only 9mobile / T2 remains unsupported
      if (detectedNet === '9mobile' || detectedNet === 't2mobile') {
        return sock.sendMessage(from, {
          text: `⚡ Clarion AI checked all available servers and is currently optimizing affordable data packages for *T2 Mobile* (formerly 9mobile). 🔧\n\n` +
            `In the meantime, you can get affordable packages for *MTN, Glo & Airtel*:\n` +
            `👉 Reply *DATA* to view all packages\n` +
            `· Reply *CANCEL* to exit`
        });
      }

      // Step 1: Scanning indicator
      const budgetText = targetPrice ? ` around ₦${targetPrice.toLocaleString()}` : '';
      await sock.sendMessage(from, {
        text: `🔍 _Searching for the best verified ${netLabel} plans${budgetText}..._`
      });

      await new Promise(r => setTimeout(r, 1200));

      const netPlans = await telecomDispatcher.getAvailablePlans(detectedNet);

      let filteredPlans = netPlans;
      if (targetPrice) {
        // Tier 1: 60%–100% of budget (sweet spot)
        filteredPlans = netPlans.filter(p => p.sellPrice <= targetPrice && p.sellPrice >= targetPrice * 0.60);

        // Tier 2: expand to 40%–100% if fewer than 3 results
        if (filteredPlans.length < 3) {
          filteredPlans = netPlans.filter(p => p.sellPrice <= targetPrice && p.sellPrice >= targetPrice * 0.40);
        }

        // Tier 3: absolute fallback — 4 closest by price distance
        if (filteredPlans.length < 2) {
          filteredPlans = [...netPlans]
            .sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice))
            .slice(0, 4);
          filteredPlans.sort((a, b) => a.sellPrice - b.sellPrice);
        }
      }

      // Check if caller is partner/semi-parent or customer with wallet balance to determine pricing & status badge
      let callerWallet = 0;
      if (db.users && actionableJid) {
        try {
          const cDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
          if (cDoc.exists) callerWallet = cDoc.data().walletBalance || 0;
          if (callerWallet === 0) {
            // Also check root user wallet if actionableJid is the proxy owner
            callerWallet = await wallet.getBalance(actionableJid).catch(() => 0);
          }
        } catch (e) { }
      }

      const isProxyOwnerOrPartner = (actionableJid === user.uid) || callerWallet > 0;
      const callerTier = wallet.getMultiplierTier(callerWallet);

      // Format Header
      let menuText = `✦ Clarion OS\n` +
        `━━━━━━━━━━━━━━\n`;

      if (targetPrice) {
        menuText += `📶 *${netLabel} PACKAGES NEAR ₦${targetPrice.toLocaleString()}* ⚡\n`;
      } else {
        menuText += `📶 *${netLabel} DATA PACKAGES* ⚡\n`;
      }

      const masked = callerPhone.length >= 10 ? callerPhone.slice(0, 4) + '••••' + callerPhone.slice(-2) : callerPhone;
      if (forceNetwork) {
        menuText += `Browsing network: ${netLabel} | Your line: ${masked}\n`;
      } else {
        menuText += `Line detected: ${masked} (${netLabel})\n`;
      }

      if (isProxyOwnerOrPartner && callerTier.level > 1) {
        menuText += `⭐ *Your Active Discount:* ${callerTier.name} (${callerTier.multiplier} Power)\n`;
      }
      if (callerWallet > 0) {
        menuText += `💰 *Clarion Float:* ₦${callerWallet.toLocaleString()} (Instant 1-click debit)\n`;
      }

      // Group by durationCategory
      const groups = {};
      for (const p of filteredPlans) {
        const cat = p.durationCategory || '🗓️ *Other Plans:*';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
      }

      let hasDegraded = false;
      for (const cat of Object.keys(groups)) {
        menuText += `\n${cat}\n`;
        groups[cat].forEach(p => {
          const isDegraded = telecomDispatcher.isPlanDegraded(p.code);
          const wholesaleInfo = isProxyOwnerOrPartner && callerWallet > 0
            ? wallet.getWholesalePrice(p, callerWallet)
            : null;
          const displayPrice = wholesaleInfo ? wholesaleInfo.discountedPrice : p.sellPrice;

          if (isDegraded) {
            hasDegraded = true;
            menuText += `• ${p.name} (${p.validity}) — ₦${displayPrice.toLocaleString()}\n` +
              `  ➔ [Temporarily Paused] 🟡\n`;
          } else {
            menuText += `• ${p.name} (${p.validity}) — ₦${displayPrice.toLocaleString()}\n` +
              `  ➔ Reply *BUY ${p.code}*\n`;
          }
        });
      }

      if (hasDegraded) {
        menuText += `\n💡 *Note:* Packages marked [Temporarily Paused] are undergoing brief gateway optimization.\nAll active packages deliver in 3 seconds! ⚡\n`;
      }

      // Format Footer with Cross-Network Browsing
      menuText += `\n━━━━━━━━━━━━━━\n`;
      const priceSuffix = targetPrice ? ` ${targetPrice}` : '';
      if (detectedNet === 'airtel') {
        menuText += `🔄 *Not buying for this Airtel line?*\n` +
          `Reply *MTN*${priceSuffix} or *GLO*${priceSuffix} to browse other networks.\n` +
          `👉 Reply *BUY [code]* (e.g. *BUY A1GB*) to begin order.`;
      } else if (detectedNet === 'mtn') {
        menuText += `🔄 *Looking for other networks?*\n` +
          `Reply *AIRTEL*${priceSuffix} or *GLO*${priceSuffix} to browse other networks.\n` +
          `👉 Reply *BUY [code]* (e.g. *BUY M1GB*) to begin order.`;
      } else {
        // Glo
        menuText += `🔄 *Looking for other networks?*\n` +
          `Reply *MTN*${priceSuffix} or *AIRTEL*${priceSuffix} to browse other networks.\n` +
          `👉 Reply *BUY [code]* (e.g. *BUY G1GB*) to begin order.`;
      }

      return sock.sendMessage(from, { text: menuText });
    }

    // ── Handle BUY Order Initiation (Two-Step Recipient Flow) ──
    if (command.startsWith('buy ') || command === 'buy') {
      const debounceKey = `${from}_buy`;
      const lastBuy = buyDebounce.get(debounceKey);
      if (lastBuy && Date.now() - lastBuy < BUY_DEBOUNCE_MS) {
        return sock.sendMessage(from, { text: '⏳ Your previous order is being processed. Please wait a moment.' });
      }
      buyDebounce.set(debounceKey, Date.now());

      const buyParts = command.trim().split(/\s+/);
      const codeOrSerial = buyParts[1];
      if (!codeOrSerial) {
        return sock.sendMessage(from, { text: '💡 Reply *BUY [code]* to order (e.g. *BUY A10GB* or *BUY 1*). Reply *DATA* to view all packages!' });
      }

      const plan = telecomDispatcher.findPlan(codeOrSerial);
      if (!plan) {
        return sock.sendMessage(from, { text: '❌ Invalid plan code or serial. Type *DATA* to view available packages.' });
      }

      // Check Circuit Breaker upfront before taking payment
      if (telecomDispatcher.isPlanDegraded(plan.code)) {
        const alternatives = telecomDispatcher.getAlternativePlans(plan.code, 3);
        let altText = alternatives.map((a, i) => `${i + 1}️⃣ *${a.network.toUpperCase()} ${a.name}* (${a.validity}) — ₦${a.sellPrice.toLocaleString()} (Reply *BUY ${a.code}*)`).join('\n');
        return sock.sendMessage(from, {
          text: `🟡 *TEMPORARY GATEWAY NOTICE* ⚡\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `The *${plan.network.toUpperCase()} ${plan.name}* package is currently undergoing brief telecom server maintenance.\n\n` +
            `To guarantee zero delay with your money, orders for this plan are temporarily paused.\n\n` +
            `✨ *Instant Alternatives Delivering Right Now:*\n${altText}\n\n` +
            `🔔 Reply *NOTIFY ${plan.code}* to get an instant ping the second it's restored!`
        });
      }

      let explicitPhone = buyParts[2] ? buyParts[2].replace(/\D/g, '') : null;
      if (explicitPhone) {
        if (explicitPhone.startsWith('234') && explicitPhone.length === 13) explicitPhone = '0' + explicitPhone.slice(3);
        if (explicitPhone.length === 10) explicitPhone = '0' + explicitPhone;
      }

      if (!explicitPhone) {
        const cachedGift = awaitingGiftMap.get(userSessionKey);
        if (cachedGift && Date.now() - cachedGift.timestamp < 5 * 60 * 1000) {
          explicitPhone = cachedGift.recipientPhone;
        }
      }

      // ── Zero-Friction 1-Step Checkout: Auto-assign caller line if plan matches detected network ──
      const cleanCallerDigits = actionableJid.split('@')[0].replace(/\D/g, '');
      const callerPhone11 = cleanCallerDigits.startsWith('234') && cleanCallerDigits.length === 13
        ? '0' + cleanCallerDigits.slice(3)
        : (cleanCallerDigits.length === 11 ? cleanCallerDigits : null);

      if (!explicitPhone && callerPhone11) {
        const callerNetwork = detectNetwork(callerPhone11);
        if (callerNetwork && callerNetwork === plan.network) {
          explicitPhone = callerPhone11;
        }
      }

      // If phone was provided directly in the command or auto-assigned from caller's matching network
      if (explicitPhone && explicitPhone.length === 11) {
        const phoneNet = detectNetwork(explicitPhone);
        if (phoneNet && phoneNet !== plan.network) {
          awaitingMismatchMap.set(userSessionKey, {
            plan,
            recipientPhone: explicitPhone,
            phoneNetwork: phoneNet,
            timestamp: Date.now()
          });

          return sock.sendMessage(from, {
            text: `⚠️ *Network Mismatch Detected!*\n` +
              `━━━━━━━━━━━━━━\n` +
              `You selected an *${plan.network.toUpperCase()}* plan (${plan.name} — ₦${plan.sellPrice.toLocaleString()}),\n` +
              `but *${explicitPhone}* appears to be an *${phoneNet.toUpperCase()}* line!\n\n` +
              `1️⃣ Reply *1* if this number is PORTED to ${plan.network.toUpperCase()} (proceed)\n` +
              `2️⃣ Reply *2* to enter a different phone number\n` +
              `· Reply *CANCEL* to exit`
          });
        }

        let buyerWallet = 0;
        if (db.users && actionableJid) {
          try {
            const customerDoc = await db.users.doc(contactsUid).collection('contacts').doc(actionableJid).get();
            if (customerDoc.exists) buyerWallet = customerDoc.data().walletBalance || 0;
          } catch (e) { }
        }

        const wholesaleInfo = wallet.getWholesalePrice(plan, buyerWallet);
        const debitAmount = wholesaleInfo.discountedPrice;
        const isWalletPay = buyerWallet >= debitAmount;

        // ── Down-Tier Warning Calculation for In-Wallet Debit ──
        let willDropTier = false;
        let currentTier = wallet.getMultiplierTier(buyerWallet);
        let projectedTier = currentTier;
        if (isWalletPay && buyerWallet > 0 && currentTier.level > 1) {
          const remainingBalance = Math.max(0, buyerWallet - debitAmount);
          projectedTier = wallet.getMultiplierTier(remainingBalance);
          if (projectedTier.level < currentTier.level) {
            willDropTier = true;
          }
        }

        awaitingConfirmMap.set(userSessionKey, {
          plan,
          recipientPhone: explicitPhone,
          recipientNetwork: phoneNet || plan.network,
          wholesaleInfo,
          debitAmount,
          willDropTier,
          currentTier,
          projectedTier,
          timestamp: Date.now()
        });

        if (isWalletPay) {
          // If debit causes a multiplier tier downgrade, present Down-Tier Warning prompt first
          if (willDropTier) {
            awaitingDownTierConfirmMap.set(userSessionKey, {
              plan,
              recipientPhone: explicitPhone,
              recipientNetwork: phoneNet || plan.network,
              wholesaleInfo,
              debitAmount,
              currentTier,
              projectedTier,
              buyerWallet,
              timestamp: Date.now()
            });

            const remainingBalance = Math.max(0, buyerWallet - debitAmount);
            return sock.sendMessage(from, {
              text: `✦ Clarion OS\n` +
                `━━━━━━━━━━━━━━\n` +
                `⚠️ *MULTIPLIER DOWN-TIER WARNING!*\n\n` +
                `📦 *Package:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity})\n` +
                `💵 *Discounted Price:* ₦${debitAmount.toLocaleString()}\n` +
                `💼 *Current Float:* ₦${buyerWallet.toLocaleString()} (${currentTier.name})\n` +
                `📉 *Balance After Purchase:* ₦${remainingBalance.toLocaleString()}\n\n` +
                `⚠️ *ATTENTION PARTNER:*\n` +
                `Because your wallet float will drop below ₦${currentTier.min.toLocaleString()}, your account will temporarily downgrade from *${currentTier.name}* to *${projectedTier.name}*!\n\n` +
                `✨ *What this affects:*\n` +
                `• Your vending profit cut drops from ${(currentTier.rate * 100)}% to ${(projectedTier.rate * 100)}%.\n` +
                `• Your personal discount drops to ${projectedTier.multiplier}.\n\n` +
                `━━━━━━━━━━━━━━\n` +
                `1️⃣ Reply *1* to PROCEED ANYWAY\n` +
                `2️⃣ Reply *2* to CANCEL & KEEP YOUR ${currentTier.multiplier} MULTIPLIER\n` +
                `· Reply *CANCEL* to exit`
            });
          }

          return sock.sendMessage(from, {
            text: `✦ Clarion OS\n` +
              `━━━━━━━━━━━━━━\n` +
              `🎁 *WHOLESALE ORDER QUOTATION* ⚡\n\n` +
              `📦 *Package:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity})\n` +
              `📱 *Recipient:* ${explicitPhone} (${(phoneNet || plan.network).toUpperCase()})\n` +
              `💰 *Standard Retail:* ₦${plan.sellPrice.toLocaleString()}\n` +
              `⭐ *Your Status:* ${wholesaleInfo.tierName}\n` +
              `🎉 *${wholesaleInfo.multiplier} Savings:* -₦${wholesaleInfo.discountAmount.toFixed(2)}\n\n` +
              `💵 *Final Price:* ₦${debitAmount.toLocaleString()} (From Clarion Wallet)\n` +
              `💼 *Available Float:* ₦${buyerWallet.toLocaleString()}\n\n` +
              `━━━━━━━━━━━━━━\n` +
              `1️⃣ Reply *1* to CONFIRM & VEND INSTANTLY\n` +
              `2️⃣ Reply *2* to CHANGE RECIPIENT NUMBER\n` +
              `· Reply *CANCEL* to abort`
          });
        }

        return sock.sendMessage(from, {
          text: `✦ Clarion OS\n` +
            `━━━━━━━━━━━━━━\n` +
            `🔍 *ORDER CONFIRMATION*\n\n` +
            `📦 *Package:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity})\n` +
            `📱 *Recipient:* ${explicitPhone} (${(phoneNet || plan.network).toUpperCase()})\n` +
            `💰 *Amount:* ₦${plan.sellPrice.toLocaleString()}\n\n` +
            `━━━━━━━━━━━━━━\n` +
            `1️⃣ Reply *1* to CONFIRM & GET PAYMENT INVOICE\n` +
            `2️⃣ Reply *2* to CHANGE RECIPIENT NUMBER\n` +
            `· Reply *CANCEL* to abort`
        });
      }

      // Step 1: Prompt for recipient phone or contact card (only if plan network != caller network)
      awaitingRecipientMap.set(userSessionKey, {
        plan,
        timestamp: Date.now()
      });

      return sock.sendMessage(from, {
        text: `✦ Clarion OS\n` +
          `━━━━━━━━━━━━━━\n` +
          `📦 *You selected:* ${plan.network.toUpperCase()} ${plan.name} (${plan.validity}) — ₦${plan.sellPrice.toLocaleString()}\n\n` +
          `📱 *Who should receive this data?*\n` +
          `👉 Reply with the 11-digit phone number (e.g. 08021234567)\n` +
          `👉 Or tap 📎 to share their WhatsApp Contact Card!\n\n` +
          `· Reply *CANCEL* anytime to abort`
      });
    }



  } catch (error) {
    logger.error({ err: error }, 'Clarion Digital Store Error');
  }
};

