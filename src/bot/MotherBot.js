import { logger } from '../config/env.js';
import admin, { db } from '../services/firebase.js';
import squad from '../services/SquadService.js';
import payflex from '../services/payflex.js';
import sessionManager from './SessionManager.js';
import wallet, { WITHDRAWAL_FEES, PARTNERSHIP_TIERS } from '../services/WalletService.js';
import reportService from '../services/ReportService.js';
import broadcastQueue from '../services/BroadcastQueue.js';
import mediaGen from '../services/mediaGen.js';
import { detectNetwork } from '../utils/networkUtils.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import QRCode from 'qrcode';
import { mockCdsProposals } from '../services/AdminService.js';

// ── Inbound message rate limiter: 5 messages per 10 seconds per contact ──
const motherMessageLimiter = new RateLimiterMemory({ points: 5, duration: 10 });

const STATES = {
  START: 'START',
  AWAITING_NYSC_CODE: 'AWAITING_NYSC_CODE',
  AWAITING_TIER_SELECTION: 'AWAITING_TIER_SELECTION',
  AWAITING_INITIAL_BANK: 'AWAITING_INITIAL_BANK',
  AWAITING_PROXY_NUMBER: 'AWAITING_PROXY_NUMBER',
  AWAITING_QR_DELIVERY_NUMBER: 'AWAITING_QR_DELIVERY_NUMBER',
  AWAITING_QR_SCAN: 'AWAITING_QR_SCAN',
  AWAITING_DETAILS: 'AWAITING_DETAILS',
  COMPLETED: 'COMPLETED',
  AWAITING_WITHDRAW_DETAILS: 'AWAITING_WITHDRAW_DETAILS',
  AWAITING_WITHDRAW_CONFIRM: 'AWAITING_WITHDRAW_CONFIRM',
  AWAITING_UPDATE_BANK: 'AWAITING_UPDATE_BANK',
  AWAITING_UPDATE_BANK_CONFIRM: 'AWAITING_UPDATE_BANK_CONFIRM',
  AWAITING_BROADCAST_CONTACTS: 'AWAITING_BROADCAST_CONTACTS',
  AWAITING_CONTACT_ACTION: 'AWAITING_CONTACT_ACTION',
  AWAITING_DATA_PLAN_SELECT: 'AWAITING_DATA_PLAN_SELECT',
  AWAITING_PAYMENT_METHOD: 'AWAITING_PAYMENT_METHOD',
  AWAITING_MB_CARD_AMOUNT: 'AWAITING_MB_CARD_AMOUNT',
  AWAITING_CDS_PROPOSAL_DETAILS: 'AWAITING_CDS_PROPOSAL_DETAILS'
};

// Central ClarionHub Virtual Account for public orders (mock for now, connected via Squad later)
export const CENTRAL_HUB_ACCOUNT = {
  bankName: 'Wema Bank',
  accountNumber: '0123456789',
  accountName: 'ClarionHub Central'
};

/**
 * Helper to determine if a corps member is running their proxy bot
 * directly on the same phone number they use to chat with MotherBot.
 */
export function checkIsSameNumber(userJid, botPhoneNumber) {
  if (!userJid || !botPhoneNumber) return false;
  const userDigits = String(userJid).replace(/[^0-9]/g, '');
  const botDigits = String(botPhoneNumber).replace(/[^0-9]/g, '');
  if (userDigits.length < 10 || botDigits.length < 10) return false;
  return userDigits.slice(-10) === botDigits.slice(-10);
}

// In-memory fallback if Firestore is slow/down
const mockUserStore = new Map();

const startQRImageDelivery = async (sock, from, user, saveUser) => {
  const targetNumber = user.phoneNumber;
  const deliveryJid = user.qrDeliveryJid || from;

  try {
    await sessionManager.startQRPairingForUser(
      {
        ...user,
        uid: targetNumber.includes('@') ? targetNumber : `${targetNumber}@s.whatsapp.net`
      },
      async (rawQR) => {
        try {
          const qrBuffer = await QRCode.toBuffer(rawQR, { width: 600, margin: 2 });

          await sock.sendMessage(deliveryJid, {
            image: qrBuffer,
            caption: `📸 *Scan this QR Code with your Bot Phone (+${targetNumber})!*\n\n1. Open WhatsApp on *+${targetNumber}*\n2. Go to *Settings > Linked Devices > Link a Device*\n3. Point your camera at this QR image on this screen!\n\n⏱️ *Expires in 60 seconds. Reply RESEND to get a fresh code.*`
          });

          if (deliveryJid !== from) {
            await sock.sendMessage(from, {
              text: `📤 *QR image sent to +${deliveryJid.split('@')[0]}!* Open that phone and scan the image with your bot phone (*+${targetNumber}*).`
            });
          }
        } catch (imgErr) {
          logger.error('Error generating/sending QR image:', imgErr);
          await sock.sendMessage(from, { text: '❌ Error generating QR code image. Reply *RESEND* to try again.' });
        }
      }
    );
  } catch (err) {
    logger.error('QR Pairing Error:', err);
    await saveUser({ ...user, state: STATES.AWAITING_PROXY_NUMBER });
    await sock.sendMessage(from, { text: '❌ Failed to generate QR code. Please try typing your bot phone number again (e.g. 08012345678).' });
  }
};

export const handleMotherMessage = async (sock, msg) => {
  const from = msg.key.remoteJid;

  // Rate limit check
  try {
    await motherMessageLimiter.consume(from);
  } catch (rejRes) {
    logger.warn(`[RATE-LIMIT] Mother Bot message throttled for ${from}`);
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
  const pushName = msg.pushName || 'Co-member';

  if (!text && !msg.message?.contactMessage && !msg.message?.contactsArrayMessage) {
    if (!msg.message?.protocolMessage) {
      logger.info({ msg: msg.message }, 'Received non-text message');
    }
    return;
  }
  if (from.endsWith('@g.us')) return; // Ignore group messages

  try {
    let userData;
    let userRef;

    if (db.users) {
      userRef = db.users.doc(from);
      try {
        const userDoc = await userRef.get().catch(() => null);
        userData = userDoc?.exists ? userDoc.data() : (mockUserStore.get(from) || { state: STATES.START, uid: from });
      } catch (e) {
        userData = mockUserStore.get(from) || { state: STATES.START, uid: from };
      }
    } else {
      userData = mockUserStore.get(from) || { state: STATES.START, uid: from };
    }

    const command = text.trim();

    const saveUser = async (data) => {
      mockUserStore.set(from, data);
      if (userRef) {
        await userRef.set(data, { merge: true }).catch(err => logger.warn('Firestore write failed, using memory:', err.message));
      }
    };

    logger.info(`Mother Bot handling message from ${pushName} (${userData.state})`);

    if (userData.state === STATES.START) {
      if (command.toLowerCase() === 'connect 000') {
        await sock.sendMessage(from, {
          text: `🎺 Welcome to Clarion A.I! 🚀 Let's set up your automated 24/7 Data Business and start earning extra income while helping NYSC community projects.\n\nTo begin, please reply with your *NYSC State Code* (e.g., NY/24A/1234):`
        });
        await saveUser({ ...userData, state: STATES.AWAITING_NYSC_CODE });
        return;
      }

      // Public Airtime (Card) check
      const cardRegex = /^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
      if (cardRegex.test(command)) {
        const match = command.match(cardRegex);
        const amount = match && match[1] ? parseInt(match[1]) : null;
        let targetPhone = match && match[2] ? match[2] : from.split('@')[0];

        if (!amount) {
          await saveUser({ ...userData, state: STATES.AWAITING_MB_CARD_AMOUNT, previousState: STATES.START });
          return sock.sendMessage(from, {
            text: `📲 *Clarion Airtime Top-up*\n\nHow much airtime would you like to buy?\n\nReply:\n👉 *CARD [amount]* (e.g. *CARD 500* for this number)\n👉 *CARD [amount] [phone]* (e.g. *CARD 500 08012345678* to gift someone)`
          });
        }

        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const network = detectNetwork(targetPhone) || 'mtn';

        if (amount < 50 || amount > 50000) {
          return sock.sendMessage(from, { text: '❌ Airtime amount must be between ₦50 and ₦50,000.' });
        }

        const orderRef = `CLARION_AIR_${Date.now()}`;
        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'PENDING_AIRTIME',
            userId: 'HUB',
            buyerPhone: from,
            targetPhone,
            network,
            amount,
            donationTier: 'HUB',
            status: 'AWAITING_PAYMENT',
            createdAt: new Date().toISOString()
          }).catch(() => {});
        }

        return sock.sendMessage(from, {
          text: `📲 *Clarion Airtime Order Confirmation*\n\n` +
            `📱 *Recipient:* ${targetPhone}\n` +
            `🌐 *Network:* ${network.toUpperCase()}\n` +
            `💰 *Amount:* ₦${amount.toLocaleString()}\n\n` +
            `💳 *Payment Transfer Details:*\n` +
            `🏦 *Bank:* ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
            `🔢 *Account Number:* ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
            `👤 *Account Name:* ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
            `_Transfer exactly ₦${amount.toLocaleString()} to receive instant airtime top-up._`
        });
      }

      // Public Data plans check
      const dataRegex = /^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
      if (dataRegex.test(command)) {
        const match = command.match(dataRegex);
        const targetPrice = match && match[1] ? parseInt(match[1]) : null;
        let targetPhone = match && match[2] ? match[2] : from.split('@')[0];
        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const network = detectNetwork(targetPhone) || 'mtn';
        const plans = await payflex.getAvailablePlans();
        let filtered = plans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));

        if (targetPrice) {
          filtered.sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice));
          filtered = filtered.slice(0, 4);
          filtered.sort((a, b) => a.sellPrice - b.sellPrice);
        } else {
          filtered = filtered.slice(0, 6);
        }

        let menuText = `👋 Welcome to *Clarion A.I.* Digital Hub!\n\n🔎 Network Detected: *${network.toUpperCase()}* for ${targetPhone}\n\n`;
        filtered.forEach(p => {
          menuText += `👉 *${p.name}* = ₦${p.sellPrice}\n`;
        });
        menuText += `\n💳 *Payment Transfer Details:*\n` +
          `🏦 Bank: ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
          `🔢 Account Number: ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
          `👤 Account Name: ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
          `_Transfer the exact amount for your chosen plan to receive instant data delivery._`;

        return sock.sendMessage(from, { text: menuText });
      }

      // Public Exam PIN check
      const pinRegex = /^\.?pin(?:\s+(waec|neco))?$/i;
      if (pinRegex.test(command)) {
        const match = command.match(pinRegex);
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

        const prod = examProducts[exam];
        const orderRef = `CLARION_PIN_${Date.now()}`;
        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'PENDING_EXAM_PIN',
            userId: 'HUB',
            buyerPhone: from,
            examType: exam,
            amount: prod.sellPrice,
            donationTier: 'HUB',
            status: 'AWAITING_PAYMENT',
            createdAt: new Date().toISOString()
          }).catch(() => {});
        }

        return sock.sendMessage(from, {
          text: `🎓 *${prod.name} Confirmation*\n\n` +
            `💰 *Price:* ₦${prod.sellPrice.toLocaleString()}\n\n` +
            `💳 *Payment Transfer Details:*\n` +
            `🏦 *Bank:* ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
            `🔢 *Account Number:* ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
            `👤 *Account Name:* ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
            `_Transfer exactly ₦${prod.sellPrice.toLocaleString()} to receive your PIN & Serial Number instantly._`
        });
      }

      // Quietly ignore any other non-trigger message for unregistered users
      return;
    }
    else if (userData.state === STATES.AWAITING_MB_CARD_AMOUNT) {
      const match = command.match(/^(?:card\s+|airtime\s+)?(\d+)(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i);
      if (!match) {
        return sock.sendMessage(from, {
          text: '❌ Invalid format. Please reply with the amount of airtime you need, e.g. *500* or *500 08012345678*:'
        });
      }

      const amount = parseInt(match[1]);
      let targetPhone = match[2] || userData.phoneNumber || from.split('@')[0];
      if (targetPhone.startsWith('234') && targetPhone.length === 13) {
        targetPhone = '0' + targetPhone.slice(3);
      }
      const network = detectNetwork(targetPhone) || 'mtn';

      if (amount < 50 || amount > 50000) {
        return sock.sendMessage(from, { text: '❌ Airtime amount must be between ₦50 and ₦50,000.' });
      }

      // Restore user state
      const returnState = userData.previousState || (userData.verifiedName ? STATES.COMPLETED : STATES.START);
      await saveUser({ ...userData, state: returnState, previousState: null });

      // If registered corps member with balance, vend from wallet
      if (returnState === STATES.COMPLETED) {
        const balance = await wallet.getBalance(from);
        if (balance >= amount) {
          await sock.sendMessage(from, { text: `⏳ *Processing Airtime Top-up...*\nDeducting ₦${amount.toLocaleString()} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, amount, `Airtime: ₦${amount} to ${targetPhone} (${network.toUpperCase()})`, { network, targetPhone, amount });
            const result = await payflex.purchaseAirtime(network, targetPhone, amount);
            const newBal = (balance - amount).toFixed(2);
            return sock.sendMessage(from, {
              text: `✅ *Airtime Vended Successfully!*\n\n📱 *Recipient:* ${targetPhone}\n🌐 *Network:* ${network.toUpperCase()}\n💰 *Amount:* ₦${amount.toLocaleString()}\n💳 *Paid via:* Clarion Wallet\n🪙 *Remaining Balance:* ₦${newBal}\n🧾 *Ref:* ${result.reference}`
            });
          } catch (err) {
            logger.error('Error vending airtime to partner:', err.message);
            return sock.sendMessage(from, { text: `❌ Airtime delivery failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour current Clarion balance is *₦${balance.toFixed(2)}*, but this airtime order requires *₦${amount.toLocaleString()}*.\n\nTo fund your wallet, transfer to your collection account:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}\n👤 *Name:* ${userData.virtualAccount?.accountName || userData.verifiedName}`
          });
        }
      } else {
        // Public customer
        const orderRef = `CLARION_AIR_${Date.now()}`;
        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'PENDING_AIRTIME',
            userId: 'HUB',
            buyerPhone: from,
            targetPhone,
            network,
            amount,
            donationTier: 'HUB',
            status: 'AWAITING_PAYMENT',
            createdAt: new Date().toISOString()
          }).catch(() => {});
        }

        return sock.sendMessage(from, {
          text: `📲 *Clarion Airtime Order Confirmation*\n\n` +
            `📱 *Recipient:* ${targetPhone}\n` +
            `🌐 *Network:* ${network.toUpperCase()}\n` +
            `💰 *Amount:* ₦${amount.toLocaleString()}\n\n` +
            `💳 *Payment Transfer Details:*\n` +
            `🏦 *Bank:* ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
            `🔢 *Account Number:* ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
            `👤 *Account Name:* ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
            `_Transfer exactly ₦${amount.toLocaleString()} to receive instant airtime top-up._`
        });
      }
    }
    else if (userData.state === STATES.AWAITING_CDS_PROPOSAL_DETAILS) {
      if (command.toLowerCase() === 'cancel') {
        await saveUser({ ...userData, state: STATES.COMPLETED });
        return sock.sendMessage(from, { text: '↩️ CDS proposal application cancelled.' });
      }

      const match = command.match(/^(\d+)\s+(.+)$/s);
      if (!match) {
        return sock.sendMessage(from, {
          text: `❌ *Invalid Format*\n\nPlease reply with the grant amount and project details:\n👉 *[Amount] [Project Title & Summary]*\n\n*Example:* 50000 Corpers Lodge Water Borehole Repair\n\n_Reply CANCEL to exit._`
        });
      }

      const grantAmount = parseInt(match[1]);
      const projectDetails = match[2].trim();
      const rawStateCode = (userData.stateCode || 'NYSC').replace(/[^a-zA-Z0-9]/g, '');
      const proposalId = `CDS-${rawStateCode}-${Math.floor(1000 + Math.random() * 9000)}`;

      const tier = (userData.donationTier || 'MEMBER').toUpperCase();
      const priorityMap = { PIONEER: 100, LORD: 90, MASTER: 70, MEMBER: 50 };
      const priorityScore = priorityMap[tier] || 50;

      const newProposal = {
        id: proposalId,
        proposalId,
        userId: from,
        verifiedName: userData.verifiedName || userData.name || 'Corps Member',
        stateCode: userData.stateCode || 'NYSC',
        donationTier: tier,
        priorityScore,
        grantAmountRequested: grantAmount,
        title: projectDetails.split('\n')[0].slice(0, 60),
        description: projectDetails,
        status: 'PENDING',
        submittedAt: new Date().toISOString()
      };

      if (db.cdsProposals) {
        await db.cdsProposals.doc(proposalId).set(newProposal).catch(err => {
          logger.warn('Firestore proposal save failed, using memory:', err.message);
        });
      }
      mockCdsProposals.set(proposalId, newProposal);

      await saveUser({ ...userData, state: STATES.COMPLETED });

      return sock.sendMessage(from, {
        text: `✅ *CDS Micro-Grant Proposal Submitted!*\n\n` +
          `🔖 *Tracking ID:* \`${proposalId}\`\n` +
          `💰 *Grant Requested:* ₦${grantAmount.toLocaleString()}\n` +
          `📋 *Project:* ${newProposal.title}\n` +
          `🎖️ *Priority Standing:* ${PARTNERSHIP_TIERS[tier]?.name || tier} (${priorityScore}/100 Priority)\n\n` +
          `_Your application has been submitted to the Clarion CDS Allocation Board. You can type *CDS STATUS* anytime to check review status._`
      });
    }
    else if (userData.state === STATES.AWAITING_NYSC_CODE) {
      const stateCodeRegex = /^[A-Z]{2}\/\d{2}[A-C]\/\d{4}$/i;
      if (!stateCodeRegex.test(command)) {
        return sock.sendMessage(from, { text: '❌ Invalid State Code format. Please use the format: NY/24A/1234' });
      }

      await saveUser({
        ...userData,
        stateCode: command.toUpperCase(),
        state: STATES.AWAITING_TIER_SELECTION
      });

      const tierPrompt = `🎖️ *Choose your Clarion Partnership Tier:*\n\n` +
        `*1* - Clarion Member (Donate 16% to CDS) [Default]\n` +
        `*2* - Clarion Master (Donate 40% to CDS)\n` +
        `*3* - Clarion Lord (Donate 64% to CDS)\n` +
        `*4* - Clarion Pioneer Class (Founding Batch: Donate 16% to CDS + Awarded Clarion Lord Rank & All Privileges) 🚀\n\n` +
        `Reply *1*, *2*, *3*, or *4* to proceed:`;

      return sock.sendMessage(from, { text: tierPrompt });
    }
    else if (userData.state === STATES.AWAITING_TIER_SELECTION) {
      let selectedTier = 'MEMBER';
      let rankBadge = 'MEMBER';

      if (command === '1' || command.toLowerCase().includes('member')) {
        selectedTier = 'MEMBER';
        rankBadge = 'MEMBER';
      } else if (command === '2' || command.toLowerCase().includes('master')) {
        selectedTier = 'MASTER';
        rankBadge = 'MASTER';
      } else if (command === '3' || command.toLowerCase().includes('lord')) {
        selectedTier = 'LORD';
        rankBadge = 'LORD';
      } else if (command === '4' || command.toLowerCase().includes('pioneer')) {
        selectedTier = 'PIONEER';
        rankBadge = 'LORD';
      } else {
        return sock.sendMessage(from, { text: '❌ Invalid selection. Please reply *1*, *2*, *3*, or *4* to choose your tier:' });
      }

      const tierInfo = PARTNERSHIP_TIERS[selectedTier];
      await saveUser({
        ...userData,
        donationTier: selectedTier,
        rankBadge: rankBadge,
        state: STATES.AWAITING_INITIAL_BANK
      });

      return sock.sendMessage(from, {
        text: `🎖️ *Tier Selected: ${tierInfo.name}* (${tierInfo.displayDonate} CDS Donation)\n\n` +
          `🏦 *Bank Account Setup & Verification*\n\n` +
          `To ensure automated profit cashouts, please provide your payout bank details. Your account holder name will be verified via bank lookup and permanently locked to your Clarion enterprise.\n\n` +
          `Please reply with your *Bank Name* and *10-digit Account Number* (e.g. *GTBank 0123456789* or *Access Bank 0123456789*):`
      });
    }
    else if (userData.state === STATES.AWAITING_INITIAL_BANK) {
      let bankName = '';
      let accountNumber = '';

      const spaceMatch = command.match(/^(.+?)\s*(\d{10})$/);
      if (spaceMatch) {
        bankName = spaceMatch[1].trim();
        accountNumber = spaceMatch[2];
      } else {
        const noSpaceMatch = command.match(/^([a-zA-Z\s]+?)(\d{10})$/);
        if (noSpaceMatch) {
          bankName = noSpaceMatch[1].trim();
          accountNumber = noSpaceMatch[2];
        }
      }

      if (!bankName || !accountNumber) {
        return sock.sendMessage(from, {
          text: '❌ Could not read bank details.\n\nPlease reply with your Bank Name and 10-digit Account Number.\nExample: *GTBank 0123456789*'
        });
      }

      await sock.sendMessage(from, { text: '🔍 Verifying account details with bank servers...' });
      const banks = await squad.getBanks();
      const matchedBank = banks.find(b =>
        b.name.toLowerCase().replace(/\s+/g, '') === bankName.toLowerCase().replace(/\s+/g, '')
      );

      if (!matchedBank) {
        const supported = banks.map(b => b.name).join(', ');
        return sock.sendMessage(from, {
          text: `❌ Bank "${bankName}" not recognized.\n\nSupported banks include: ${supported}.\nPlease try again:`
        });
      }

      try {
        const accountInfo = await squad.validateBankAccount(matchedBank.code, accountNumber);
        const verifiedName = accountInfo.accountName;

        await sock.sendMessage(from, { text: `✅ *Account Verified:* ${verifiedName}!\n\nCreating your dedicated virtual collection account...` });

        // Create Squad Virtual Account in the verified name
        const account = await squad.createVirtualAccount(
          verifiedName,
          `${from.split('@')[0]}@nyscbot.com`,
          from.split('@')[0]
        );

        const updatedUser = {
          ...userData,
          name: verifiedName,
          verifiedName: verifiedName,
          bankDetails: {
            bankName: matchedBank.name,
            bankCode: matchedBank.code,
            accountNumber,
            accountName: verifiedName
          },
          virtualAccount: account,
          state: STATES.AWAITING_PROXY_NUMBER
        };

        await saveUser(updatedUser);

        return sock.sendMessage(from, {
          text: `🎊 *Enterprise Identity Setup Complete!*\n\n` +
            `👤 *Verified Name:* ${verifiedName} (Permanently Locked)\n` +
            `🏦 *Payout Bank:* ${matchedBank.name} (${accountNumber})\n` +
            `💳 *Clarion Collection Acct:* ${account.bankName} - ${account.accountNumber}\n` +
            `🎖️ *Tier:* ${PARTNERSHIP_TIERS[userData.donationTier || 'MEMBER'].name}\n\n` +
            `*Final Step:* To activate your Digital Storefront, please reply with the WhatsApp number you want your Bot to run on (e.g. 08012345678):`
        });
      } catch (err) {
        logger.error('Initial bank validation failed:', err.message);
        return sock.sendMessage(from, {
          text: '❌ Could not verify bank account. Please check your bank name and account number, then try again:'
        });
      }
    }
    else if (userData.state === STATES.AWAITING_PROXY_NUMBER || command.toUpperCase().startsWith('PAIR')) {
      let rawNumber = command.toUpperCase().startsWith('PAIR') ? command.split(/\s+/)[1] : command;
      rawNumber = rawNumber ? rawNumber.replace(/\D/g, '') : '';

      if (rawNumber.length < 10) {
        return sock.sendMessage(from, { text: `❌ Phone Number Required. Please reply with the number you want your Bot to run on (e.g. 08012345678):` });
      }

      // Normalize Nigerian local numbers: 080... -> 23480...
      if (rawNumber.startsWith('0') && rawNumber.length === 11) {
        rawNumber = '234' + rawNumber.substring(1);
        logger.info(`Normalized local number to ${rawNumber}`);
      }

      let targetNumber = rawNumber;

      await saveUser({
        ...userData,
        phoneNumber: targetNumber,
        phoneJid: `${targetNumber}@s.whatsapp.net`,
        state: STATES.AWAITING_QR_DELIVERY_NUMBER
      });

      return sock.sendMessage(from, {
        text: `📱 *Where should we send your QR activation code image?*\n\nTo scan the QR code, the image needs to be displayed on a screen nearby (so your bot phone *+${targetNumber}* can scan it).\n\n• Reply *SAME* to receive the QR image right here in this chat.\n• Or reply with a *Phone Number* (e.g. 08012345678 - personal phone, laptop, or friend's WhatsApp) to receive the image there instead.`
      });
    }
    else if (userData.state === STATES.AWAITING_QR_DELIVERY_NUMBER) {
      let deliveryJid = from;

      if (command.toUpperCase() !== 'SAME') {
        let rawNum = command.replace(/\D/g, '');
        if (rawNum.startsWith('0') && rawNum.length === 11) {
          rawNum = '234' + rawNum.substring(1);
        }
        if (rawNum.length < 10) {
          return sock.sendMessage(from, { text: '❌ Invalid phone number. Reply *SAME* to send here, or enter a valid 11-digit phone number:' });
        }
        deliveryJid = `${rawNum}@s.whatsapp.net`;
      }

      const updatedUser = { ...userData, qrDeliveryJid: deliveryJid, state: STATES.AWAITING_QR_SCAN };
      await saveUser(updatedUser);

      await sock.sendMessage(from, { text: `⏳ Generating your activation QR code image for *+${userData.phoneNumber}*...\n\nPlease stand by!` });

      await startQRImageDelivery(sock, from, updatedUser, saveUser);
    }
    else if (userData.state === STATES.AWAITING_QR_SCAN) {
      if (command.toUpperCase() === 'RESEND' || command.toUpperCase() === 'RETRY') {
        await sock.sendMessage(from, { text: `⏳ Regenerating a fresh QR code image...` });
        await startQRImageDelivery(sock, from, userData, saveUser);
      } else {
        const destNum = (userData.qrDeliveryJid || from).split('@')[0];
        return sock.sendMessage(from, {
          text: `📱 Your activation QR code image was sent to *+${destNum}*.\n\nOpen WhatsApp on *+${destNum}*, display the image on screen, and scan it with your bot phone (*+${userData.phoneNumber}*).\n\nReply *RESEND* if the code expired!`
        });
      }
    }
    else if (userData.state === STATES.COMPLETED || userData.state === STATES.AWAITING_WITHDRAW_DETAILS || userData.state === STATES.AWAITING_WITHDRAW_CONFIRM || userData.state === STATES.AWAITING_BROADCAST_CONTACTS || userData.state === STATES.AWAITING_CONTACT_ACTION || userData.state === STATES.AWAITING_DATA_PLAN_SELECT || userData.state === STATES.AWAITING_PAYMENT_METHOD) {

      // --- Helper for contact extraction ---
      const extractContacts = () => {
        let extractedNumbers = [];
        const contactMsg = msg.message?.contactMessage;
        const contactsArray = msg.message?.contactsArrayMessage?.contacts;
        if (contactMsg) {
          const vcard = contactMsg.vcard;
          const jidMatch = vcard?.match(/waid=(\d+)/i);
          const numMatch = vcard?.match(/TEL.*?:(.*)/i);
          if (jidMatch) extractedNumbers.push(jidMatch[1]);
          else if (numMatch) extractedNumbers.push(numMatch[1]);
        } else if (contactsArray) {
          contactsArray.forEach(c => {
            const vcard = c.vcard;
            const jidMatch = vcard?.match(/waid=(\d+)/i);
            const numMatch = vcard?.match(/TEL.*?:(.*)/i);
            if (jidMatch) extractedNumbers.push(jidMatch[1]);
            else if (numMatch) extractedNumbers.push(numMatch[1]);
          });
        }
        if (command && extractedNumbers.length === 0) {
          const digitSequences = command.match(/(?:\+?\d[\d\-\s]{7,}\d)/g);
          if (digitSequences) extractedNumbers.push(...digitSequences);
        }
        return extractedNumbers.map(rawNum => {
          let clean = rawNum.replace(/\D/g, '');
          if (clean.length === 11 && clean.startsWith('0')) clean = '234' + clean.substring(1);
          return clean ? clean + '@s.whatsapp.net' : null;
        }).filter(Boolean);
      };

      if (userData.state === STATES.AWAITING_BROADCAST_CONTACTS) {
        const template = `Big news! 🚀 I just launched my automated 24/7 Data Bot powered by Clarion A.I (NYSC SAED Project). Get your MTN, Airtel, and Glo data instantly, at either official rates or cheaper! 🔥\n\nThe bot runs on this my number, but it ignores normal chat. To talk to the bot, you MUST trigger it!\n\nJust reply to me with:\n*Data 500* - To see deals around ₦500\n*Data 1000* - To see deals around ₦1000\n\nThe best part? Every time you buy, you're helping fund NYSC community projects! 🇳🇬 Try it right now!`;

        let validJids = extractContacts();
        if (validJids.length > 0) {
          let whitelist = userData.tempWhitelist || [];
          let added = 0;
          let invalid = 0;

          if (validJids.length > 2) {
            await sock.sendMessage(from, { text: `⏳ Verifying ${validJids.length} contacts with WhatsApp servers...` });
          }

          for (let targetJid of validJids) {
            if (!whitelist.includes(targetJid)) {
              // Verify number directly on WhatsApp platform
              const [result] = await sock.onWhatsApp(targetJid).catch(() => []);
              if (result && result.exists) {
                whitelist.push(targetJid);
                added++;
              } else {
                invalid++;
              }
            }
          }

          let responseText = '';
          if (added > 0) {
            await saveUser({ ...userData, tempWhitelist: whitelist });
            responseText = `✅ Added ${added} valid number(s). (Total: ${whitelist.length})\n`;
          } else {
            responseText = `No valid new numbers were added.\n`;
          }

          if (invalid > 0) {
            responseText += `⚠️ Skipped ${invalid} number(s) that are NOT registered on WhatsApp to protect your account.\n`;
          }

          responseText += `\nKeep sharing more contacts, or reply *DONE* to send the broadcast!`;
          return sock.sendMessage(from, { text: responseText.trim() });
        } else if (command.toUpperCase() === 'DONE' || command.toUpperCase() === 'YES') {
          const whitelist = userData.tempWhitelist || [];
          const userPhoneJid = from.split('@')[0] + '@s.whatsapp.net';

          if (whitelist.length === 0) {
            await saveUser({ ...userData, state: STATES.COMPLETED });
            return sock.sendMessage(from, { text: '✅ Launch broadcast skipped.\n\nYou are fully set up! Type *BALANCE* or *HISTORY* anytime to manage your enterprise.' });
          }

          await broadcastQueue.queueBroadcast(userPhoneJid, template, whitelist);
          const previousBroadcasts = userData.broadcastHistory || [];
          const updatedHistory = [...new Set([...previousBroadcasts, ...whitelist])];
          await saveUser({ ...userData, state: STATES.COMPLETED, tempWhitelist: [], broadcastHistory: updatedHistory });
          return sock.sendMessage(from, { text: `✅ *Broadcast queued to your ${whitelist.length} selected contacts!*\n\nCommunications will be dispatched safely.\n\nYour enterprise is fully active! Type *BALANCE* or *HISTORY* anytime to manage your store.` });
        } else if (command.toUpperCase() === 'SKIP' || command.toUpperCase() === 'NO') {
          await saveUser({ ...userData, state: STATES.COMPLETED, tempWhitelist: [] });
          return sock.sendMessage(from, { text: '✅ Enterprise launch broadcast skipped.\n\nYour digital storefront is fully set up! Type *BALANCE* or *HISTORY* anytime.' });
        } else {
          return sock.sendMessage(from, { text: 'Please send contact cards/numbers to add to your broadcast list, or reply *DONE* to begin, or *SKIP*.' });
        }
      }

      // ── VIP command ────────────────────────────────────────
      else if (userData.state === STATES.COMPLETED && command.toLowerCase() === 'vip') {
        const vipData = await reportService.getVIPCustomers(from);
        if (!vipData || vipData.list.length === 0) {
          return sock.sendMessage(from, { text: '📭 Cannot generate VIP report: No completed customer orders yet.' });
        }

        let msg = `🏆 *Your VIP Customers*\n\n`;
        const medals = ['🥇', '🥈', '🥉'];
        vipData.list.forEach((cust, index) => {
          msg += `${medals[index]} +${cust.phone} — ₦${cust.amount} (${cust.orders} orders)\n`;
        });

        msg += `\n*Total Enterprise Revenue:* ₦${vipData.totalRevenue} across ${vipData.totalOrders} orders`;

        return sock.sendMessage(from, { text: msg });
      }

      // ── AWAITING CONTACT ACTIONS & DATA CHECKOUT ───────────
      else if (userData.state === STATES.COMPLETED && extractContacts().length > 0) {
        const sharedJids = extractContacts();
        const activeContact = sharedJids[0];

        const hasBroadcasted = (userData.broadcastHistory || []).includes(activeContact);
        await saveUser({ ...userData, state: STATES.AWAITING_CONTACT_ACTION, activeContact });

        if (hasBroadcasted) {
          return sock.sendMessage(from, { text: `📱 Contact received: +${activeContact.split('@')[0]}\n\nReply *1* to purchase data for this number.\nReply *CANCEL* to abort.` });
        } else {
          return sock.sendMessage(from, { text: `📱 Contact received: +${activeContact.split('@')[0]}\n\nWhat would you like to do?\n*1* - Send Broadcast message\n*2* - Purchase data for this number\n\nReply *CANCEL* to abort.` });
        }
      }
      else if (userData.state === STATES.AWAITING_CONTACT_ACTION) {
        if (command === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null });
          return sock.sendMessage(from, { text: '❌ Action cancelled.' });
        }

        const hasBroadcasted = (userData.broadcastHistory || []).includes(userData.activeContact);

        if (command === '1' && !hasBroadcasted) {
          // Broadcast
          const template = `Big news! 🚀 I just launched my automated 24/7 Data Bot powered by Clarion A.I (NYSC SAED Project). Get your MTN, Airtel, and Glo data instantly, at either official rates or cheaper! 🔥\n\nThe bot runs on this my number, but it ignores normal chat. To talk to the bot, you MUST trigger it!\n\nJust reply to me with:\n*Data 500* - To see deals around ₦500\n*Data 1000* - To see deals around ₦1000\n\nThe best part? Every time you buy, you're helping fund NYSC community projects! 🇳🇬 Try it right now!`;
          const userPhoneJid = from.split('@')[0] + '@s.whatsapp.net';
          await broadcastQueue.queueBroadcast(userPhoneJid, template, [userData.activeContact]);
          const updatedHistory = [...new Set([...(userData.broadcastHistory || []), userData.activeContact])];
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, broadcastHistory: updatedHistory });
          return sock.sendMessage(from, { text: `✅ Broadcast queued for +${userData.activeContact.split('@')[0]}.` });
        }
        else if (command === '2' || (command === '1' && hasBroadcasted)) {
          // Data Purchase flow
          await sock.sendMessage(from, { text: '⏳ Detecting network & parsing plans...' });
          const network = detectNetwork(userData.activeContact);
          const allPlans = await payflex.getAvailablePlans();
          let plans = network ? allPlans.filter(p => p.network.includes(network) || (network === 'mtn' && p.network.includes('mtn_'))) : allPlans;

          if (plans.length === 0) {
            await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null });
            return sock.sendMessage(from, { text: '❌ Could not find plans for this network. Action cancelled.' });
          }

          const topMenu = network ? `📶 *Auto-Detected Network:* ${network.toUpperCase()}` : `🌐 Available Plans`;
          let displayPlans = plans;
          if (!network) displayPlans = plans.slice(0, 10);

          let menuText = `${topMenu}\n\n`;
          displayPlans.forEach(plan => {
            menuText += `🔹 *${plan.name}* - ₦${plan.sellPrice}\n   Reply *${plan.serial}* to select.\n`;
          });
          menuText += '\nReply *CANCEL* to abort.';

          await saveUser({ ...userData, state: STATES.AWAITING_DATA_PLAN_SELECT, activeContactNetwork: network });
          return sock.sendMessage(from, { text: menuText });
        }

        return sock.sendMessage(from, { text: '❌ Invalid option.' });
      }
      else if (userData.state === STATES.AWAITING_DATA_PLAN_SELECT) {
        if (command === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null });
          return sock.sendMessage(from, { text: '❌ Action cancelled.' });
        }
        const plans = await payflex.getAvailablePlans();
        const selectedPlan = plans.find(p => p.serial.toString() === command);
        if (!selectedPlan) return sock.sendMessage(from, { text: '❌ Invalid serial. Try again or reply *CANCEL*.' });

        const balance = await wallet.getBalance(from);
        const canUseWallet = balance >= selectedPlan.basePrice;

        await saveUser({ ...userData, state: STATES.AWAITING_PAYMENT_METHOD, selectedDataPlan: selectedPlan.serial });

        let promptText = `🛒 *Order Preview*\nPlan: ${selectedPlan.name}\nCost: ₦${selectedPlan.basePrice}\nProfit Markup: ₦${selectedPlan.sellPrice - selectedPlan.basePrice}\n\nYour Profit Wallet: ₦${balance.toFixed(2)}\n\n`;

        if (canUseWallet) {
          promptText += `Options:\n*1* - Pay from Profit Wallet\n*2* - Pay via Squad Transfer\n\nReply *1* or *2* (or *CANCEL*)`;
        } else {
          promptText += `*Insufficient funds in Profit Wallet.* To proceed, you must use Transfer.\n\nReply *2* to Pay via Squad Transfer (or *CANCEL*)`;
        }
        return sock.sendMessage(from, { text: promptText });
      }
      else if (userData.state === STATES.AWAITING_PAYMENT_METHOD) {
        if (command === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, selectedDataPlan: null });
          return sock.sendMessage(from, { text: '❌ Action cancelled.' });
        }

        const plans = await payflex.getAvailablePlans();
        const selectedPlan = plans.find(p => p.serial.toString() === userData.selectedDataPlan.toString());
        const balance = await wallet.getBalance(from);

        if (command === '1') {
          if (balance < selectedPlan.basePrice) {
            return sock.sendMessage(from, { text: '❌ Wallet balance changed/insufficient. Action cancelled.' });
          }
          await sock.sendMessage(from, { text: '⏳ Dispensing data...' });
          try {
            await payflex.dispenseData(userData.activeContact.split('@')[0], selectedPlan.serial.toString());
            const profitStr = (selectedPlan.sellPrice - selectedPlan.basePrice).toFixed(2);
            if (db.ledger) {
              await db.ledger.add({
                type: 'COMPLETED_DATA', // Mocks a fulfilled order so profit is captured
                userId: userData.uid,
                buyerPhone: userData.activeContact.split('@')[0],
                planId: selectedPlan.id,
                amount: selectedPlan.sellPrice,
                settlement: {
                  coMemberShare: parseFloat(profitStr)
                },
                status: 'COMPLETED',
                createdAt: new Date().toISOString()
              });
              // Lower wallet balance
              await db.ledger.add({
                type: 'WITHDRAWAL',
                userId: userData.uid,
                amount: selectedPlan.basePrice,
                status: 'SUCCESS', // Implicitly successful local spend
                transferRef: `DATA_PURCHASE_${Date.now()}`,
                createdAt: new Date().toISOString()
              });
            }

            // Increment contacts collection here
            if (db.users && userData.activeContact) {
              try {
                const uId = userData.uid || from;
                const cleanCustomer = userData.activeContact.includes('@') ? userData.activeContact : `${userData.activeContact}@s.whatsapp.net`;
                await db.users.doc(uId).collection('contacts').doc(cleanCustomer).set({
                  totalSpent: admin.firestore.FieldValue.increment(selectedPlan.sellPrice),
                  totalOrders: admin.firestore.FieldValue.increment(1)
                }, { merge: true });
              } catch (e) {
                logger.warn(`Failed to increment contact ${userData.activeContact} stats: ${e.message}`);
              }
            }

            await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, selectedDataPlan: null });
            const successMessage = `✅ *Data Vended Successfully!*\n\nThanks for supporting the hustle! Your purchase just contributed to funding NYSC community projects (lodge renovations, extra camp kits, etc) today. 🇳🇬\n\n🤝 To buy next time, simply text *Data [Amount]* (e.g. Data 500).`;
            return sock.sendMessage(from, { text: `${successMessage}\n\n[Profit of ₦${profitStr} registered to your wallet]` });
          } catch (err) {
            return sock.sendMessage(from, { text: `❌ Data vending failed: ${err.message}` });
          }
        } else if (command === '2') {
          // Send Virtual Account info
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, selectedDataPlan: null });
          const paymentInstruction = `💳 *Squad Transfer*\n\nPlease transfer *₦${selectedPlan.sellPrice}* to your collection account below to complete this manual purchase:\n\nBank: ${userData.virtualAccount.bankName}\nAccount: ${userData.virtualAccount.accountNumber}\nName: Clarion - ${userData.name}\n\n✅ Data will be dispensed upon payment detection.`;
          return sock.sendMessage(from, { text: paymentInstruction });
        } else {
          return sock.sendMessage(from, { text: 'Invalid option ' + command });
        }
      }

      // ── BALANCE command ────────────────────────────────────
      else if ((userData.state === STATES.COMPLETED && command.toLowerCase() === 'balance') || (userData.state === STATES.COMPLETED && command.toLowerCase() === 'bal')) {
        const balance = await wallet.getBalance(from);

        const history = await wallet.getTransactionHistory(from);
        const pendingWithdrawals = history.filter(tx => tx.type === 'WITHDRAWAL' && tx.status === 'PENDING');
        const pendingSum = pendingWithdrawals.reduce((sum, tx) => sum + tx.amount, 0);

        let text = `💰 *Your Wallet Balance*\n\nAvailable: *₦${balance.toFixed(2)}*\n\n`;
        if (pendingSum > 0) {
          text += `⏳ Pending Withdrawals: *₦${pendingSum.toFixed(2)}*\n\n`;
        }
        text += `Type *WITHDRAW [amount]* to cash out.\nType *HISTORY* to view recent transactions.`;

        return sock.sendMessage(from, { text });
      }

      // ── HISTORY command ────────────────────────────────────
      else if (command.toLowerCase() === 'history' || command.toLowerCase() === 'tx') {
        const history = await wallet.getTransactionHistory(from);
        if (history.length === 0) {
          return sock.sendMessage(from, { text: '📭 No recent transactions found.' });
        }

        let historyMsg = `📜 *Recent Transactions*\n\n`;
        history.forEach(tx => {
          const date = new Date(tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          if (tx.type === 'WITHDRAWAL') {
            const icon = tx.status === 'SUCCESS' ? '✅' : tx.status === 'PENDING' ? '⏳' : '❌';
            historyMsg += `${icon} *Out* | ${date}\n   Amt: ₦${tx.amount.toFixed(2)} (${tx.status})\n   Ref: ${tx.transferRef}\n\n`;
          } else if (tx.type === 'COMPLETED_DATA' || (tx.type === 'PENDING_DATA' && tx.status === 'COMPLETED')) {
            const profit = tx.settlement?.coMemberShare || 0;
            historyMsg += `📥 *In*  | ${date}\n   Profit: ₦${profit.toFixed(2)}\n   Plan: ${tx.planId || 'Data'}\n\n`;
          }
        });
        return sock.sendMessage(from, { text: historyMsg.trim() });
      }

      // ── TEST REPORT command ────────────────────────────────
      else if (command.toLowerCase() === '.testreport') {
        const stats = await reportService.generateWeeklyStats(from);

        if (!stats) {
          return sock.sendMessage(from, { text: '📭 Cannot generate test report: You have absolutely zero activity in the last 7 days.' });
        }

        const badgeTitle = stats.impactMilestone?.current
          ? `${stats.impactMilestone.current.badge} ${stats.impactMilestone.current.title}`
          : '🌱 Community Contributor';

        let msg = `📈 *Your Weekly Clarion Enterprise Report*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📊 *This Week's Sales*\n` +
          `• Total Orders: ${stats.totalOrders}\n` +
          `• Data Orders: ${stats.dataOrders || 0}\n` +
          `• Airtime Orders: ${stats.airtimeOrders || 0}\n` +
          `• Exam PINs Sold: ${stats.examPinOrders || 0}\n` +
          `• Gross Revenue: ₦${stats.grossRevenue.toLocaleString()}\n` +
          `• Your Net Profit: ₦${stats.netProfit.toLocaleString()}\n` +
          `• Active Customers: ${stats.activeCustomers}\n\n` +
          `🏆 *Your NYSC CDS Impact*\n` +
          `• Standing: ${badgeTitle}\n` +
          `• Total Donated to Date: ₦${(stats.totalCdsDonated || 0).toLocaleString()}\n`;

        if (stats.impactMilestone?.next) {
          msg += `• Next Milestone: ${stats.impactMilestone.next.badge} ${stats.impactMilestone.next.title} (₦${stats.impactMilestone.next.threshold.toLocaleString()})\n\n`;
        } else {
          msg += `• 💎 Maximum NYSC Hero of Service Impact Achieved!\n\n`;
        }

        if (stats.topCustomers && stats.topCustomers.length > 0) {
          msg += `👑 *Top VIP Customers This Week*\n`;
          stats.topCustomers.slice(0, 3).forEach((c, idx) => {
            const maskedPhone = c.phone.length > 7
              ? `${c.phone.substring(0, 4)}****${c.phone.substring(c.phone.length - 4)}`
              : c.phone;
            msg += `${idx + 1}. ${maskedPhone} — ₦${c.amount.toLocaleString()} (${c.orders} orders)\n`;
          });
          msg += `\n`;
        }

        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `_Keep building your digital enterprise! Have a highly profitable weekend._ 🚀`;

        return sock.sendMessage(from, { text: msg });
      }

      // ── SYNC PLANS command (admin only) ─────────────────────
      else if (command.toLowerCase() === '.syncplans') {
        await sock.sendMessage(from, { text: '⏳ Syncing plans from Peyflex API...' });
        try {
          const plans = await payflex.syncPlans();
          return sock.sendMessage(from, { text: `✅ *Plans Synced Successfully!*\n\n${plans.length} plans updated in Firestore with the latest tiered pricing.\n\nMarkup tiers applied:\n• < ₦500 → +₦15\n• ₦500–₦999 → +₦20\n• ₦1000–₦2999 → +₦50\n• ₦3000+ → +₦100` });
        } catch (err) {
          return sock.sendMessage(from, { text: `❌ Sync failed: ${err.message}` });
        }
      }

      // ── WITHDRAW command (Streamlined with Permanent Bank Lock) ──
      else if (command.toLowerCase().startsWith('withdraw')) {
        const amountStr = command.split(/\s+/)[1];
        const amount = parseFloat(amountStr);

        if (!amount || isNaN(amount)) {
          return sock.sendMessage(from, {
            text: '❌ Please specify an amount.\n\nExample: *WITHDRAW 2000*'
          });
        }
        if (amount < WITHDRAWAL_FEES.MIN_WITHDRAWAL) {
          return sock.sendMessage(from, {
            text: `❌ Minimum withdrawal is *₦${WITHDRAWAL_FEES.MIN_WITHDRAWAL}*.`
          });
        }

        const balance = await wallet.getBalance(from);
        if (amount > balance) {
          return sock.sendMessage(from, {
            text: `❌ Insufficient balance.\n\nYour balance is *₦${balance.toFixed(2)}* but you requested *₦${amount.toFixed(2)}*.`
          });
        }

        // Zero Repetitive Typing: If bank details are already locked on file
        if (userData.bankDetails && userData.bankDetails.accountNumber) {
          const bank = userData.bankDetails;
          const netPayout = +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2);

          await saveUser({
            ...userData,
            state: STATES.AWAITING_WITHDRAW_CONFIRM,
            pendingWithdrawAmount: amount,
            pendingBank: bank
          });

          return sock.sendMessage(from, {
            text: `💸 *Confirm Payout Transfer*\n\n` +
              `Transfer *₦${amount.toFixed(2)}* (Net *₦${netPayout.toFixed(2)}* after ₦${WITHDRAWAL_FEES.TOTAL.toFixed(0)} fee) to your verified account:\n\n` +
              `👤 *Name:* ${bank.accountName || userData.verifiedName}\n` +
              `🏦 *Bank:* ${bank.bankName}\n` +
              `🔢 *Account:* ${bank.accountNumber}\n\n` +
              `Reply *YES* to confirm transfer or *CANCEL* to abort.`
          });
        }

        // Fallback for legacy users without locked bank details: prompt once and lock
        await saveUser({ ...userData, state: STATES.AWAITING_WITHDRAW_DETAILS, pendingWithdrawAmount: amount });
        return sock.sendMessage(from, {
          text: `💸 *Withdrawal Request: ₦${amount.toFixed(2)}*\n\nPlease provide your payout bank details:\n\nReply with your *Bank Name* and *Account Number* (e.g. *GTBank 0123456789*):\n\nType *CANCEL* to abort.`
        });
      }

      // ── AWAITING_WITHDRAW_DETAILS (Fallback for unconfigured accounts) ──
      else if (userData.state === STATES.AWAITING_WITHDRAW_DETAILS) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, { text: '❌ Withdrawal cancelled.' });
        }

        let bankName = '';
        let accountNumber = '';

        const spaceMatch = command.match(/^(.+?)\s*(\d{10})$/);
        if (spaceMatch) {
          bankName = spaceMatch[1].trim();
          accountNumber = spaceMatch[2];
        } else {
          const noSpaceMatch = command.match(/^([a-zA-Z\s]+?)(\d{10})$/);
          if (noSpaceMatch) {
            bankName = noSpaceMatch[1].trim();
            accountNumber = noSpaceMatch[2];
          }
        }

        if (!bankName || !accountNumber) {
          return sock.sendMessage(from, {
            text: '❌ Could not read your bank details.\n\nPlease reply like: *GTBank 0123456789*\n(Bank name followed by 10-digit account number)'
          });
        }

        await sock.sendMessage(from, { text: '🔍 Looking up your bank details...' });
        const banks = await squad.getBanks();
        const matchedBank = banks.find(b =>
          b.name.toLowerCase().replace(/\s+/g, '') === bankName.toLowerCase().replace(/\s+/g, '')
        );

        if (!matchedBank) {
          const bankList = banks.map(b => b.name).join(', ');
          return sock.sendMessage(from, {
            text: `❌ Bank "${bankName}" not recognized.\n\nSupported banks include:\n${bankList}\n\nPlease try again.`
          });
        }

        try {
          const accountInfo = await squad.validateBankAccount(matchedBank.code, accountNumber);
          const amount = userData.pendingWithdrawAmount;
          const netPayout = +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2);
          const bankData = {
            bankName: matchedBank.name,
            bankCode: matchedBank.code,
            accountNumber,
            accountName: accountInfo.accountName
          };

          await saveUser({
            ...userData,
            state: STATES.AWAITING_WITHDRAW_CONFIRM,
            verifiedName: accountInfo.accountName,
            bankDetails: bankData,
            pendingBank: bankData
          });

          return sock.sendMessage(from, {
            text: `🔍 *Account Verified & Locked!*\n\n👤 Name: *${accountInfo.accountName}*\n🏦 Bank: *${matchedBank.name}*\n🔢 Account: *${accountNumber}*\n\n💰 Requested: *₦${amount.toFixed(2)}*\n🏦 Payout Fee: *₦${WITHDRAWAL_FEES.TOTAL.toFixed(0)}*\n💵 You will receive: *₦${netPayout.toFixed(2)}*\n\nReply *YES* to confirm transfer or *CANCEL* to abort.`
          });
        } catch (err) {
          logger.error('Bank validation failed:', err.message);
          return sock.sendMessage(from, {
            text: '❌ Could not verify bank account. Please check the account number and try again.'
          });
        }
      }

      // ── AWAITING_WITHDRAW_CONFIRM (YES / CANCEL) ──────────
      else if (userData.state === STATES.AWAITING_WITHDRAW_CONFIRM) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, { text: '❌ Withdrawal cancelled.' });
        }

        if (command.toLowerCase() !== 'yes') {
          return sock.sendMessage(from, { text: 'Reply *YES* to confirm the transfer or *CANCEL* to abort.' });
        }

        const amount = userData.pendingWithdrawAmount;
        const bank = userData.pendingBank || userData.bankDetails;
        const netPayout = +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2);

        // Re-check balance to prevent double-spend
        const currentBalance = await wallet.getBalance(from);
        if (amount > currentBalance) {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, {
            text: `❌ Balance changed. Your current balance is *₦${currentBalance.toFixed(2)}*. Please try again.`
          });
        }

        await sock.sendMessage(from, { text: '⏳ Processing your withdrawal...' });

        const transferRef = `WDR_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

        try {
          await wallet.recordWithdrawal(from, amount, bank, transferRef);

          const result = await squad.initiateTransfer(
            netPayout,
            bank.bankCode,
            bank.accountNumber,
            `NYSC Clarion payout for ${userData.verifiedName || userData.name || from}`,
            transferRef
          );

          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });

          return sock.sendMessage(from, {
            text: `✅ *Withdrawal Submitted!*\n\n💵 *₦${netPayout.toFixed(2)}* is on its way to:\n👤 ${bank.accountName || userData.verifiedName}\n🏦 ${bank.bankName} (${bank.accountNumber})\n\nRef: ${transferRef}\n\nType *BALANCE* to check your updated wallet. Type *HISTORY* to track status.`
          });
        } catch (err) {
          logger.error('Transfer failed:', err.message);
          await wallet.updateWithdrawalStatus(transferRef, 'FAILED');
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, {
            text: '❌ Transfer failed. Your balance has been restored. Please try again later.'
          });
        }
      }

      // ── UPDATE BANK command (Security flow with ₦100 fee) ──
      else if (command.toLowerCase() === 'update bank' || command.toLowerCase() === 'change bank') {
        const balance = await wallet.getBalance(from);
        if (balance < WITHDRAWAL_FEES.BANK_UPDATE_FEE) {
          return sock.sendMessage(from, {
            text: `❌ *Insufficient Wallet Balance*\n\nUpdating your permanently verified bank details incurs a security verification fee of *₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)}*.\n\nYour current wallet balance is *₦${balance.toFixed(2)}*. You need at least ₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} to proceed.`
          });
        }

        await saveUser({ ...userData, state: STATES.AWAITING_UPDATE_BANK });
        return sock.sendMessage(from, {
          text: `🏦 *Update Verified Payout Bank*\n\nPlease reply with your new *Bank Name* and *10-digit Account Number* (e.g. *Access Bank 0123456789*):\n\n⚠️ *Security Notice:* A *₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)}* verification charge will be debited from your wallet upon confirmation.\n\nReply *CANCEL* to abort.`
        });
      }

      // ── AWAITING_UPDATE_BANK ───────────────────────────────
      else if (userData.state === STATES.AWAITING_UPDATE_BANK) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingNewBank: null });
          return sock.sendMessage(from, { text: '❌ Bank update cancelled.' });
        }

        let bankName = '';
        let accountNumber = '';
        const spaceMatch = command.match(/^(.+?)\s*(\d{10})$/);
        if (spaceMatch) {
          bankName = spaceMatch[1].trim();
          accountNumber = spaceMatch[2];
        } else {
          const noSpaceMatch = command.match(/^([a-zA-Z\s]+?)(\d{10})$/);
          if (noSpaceMatch) {
            bankName = noSpaceMatch[1].trim();
            accountNumber = noSpaceMatch[2];
          }
        }

        if (!bankName || !accountNumber) {
          return sock.sendMessage(from, {
            text: '❌ Could not parse bank details. Please reply with Bank Name and 10-digit Account Number.\nExample: *Access Bank 0123456789*\n\nReply *CANCEL* to abort.'
          });
        }

        await sock.sendMessage(from, { text: '🔍 Verifying new account details with bank servers...' });
        const banks = await squad.getBanks();
        const matchedBank = banks.find(b =>
          b.name.toLowerCase().replace(/\s+/g, '') === bankName.toLowerCase().replace(/\s+/g, '')
        );

        if (!matchedBank) {
          const bankList = banks.map(b => b.name).join(', ');
          return sock.sendMessage(from, {
            text: `❌ Bank "${bankName}" not recognized.\n\nSupported banks: ${bankList}\nPlease try again or reply *CANCEL*:`
          });
        }

        try {
          const accountInfo = await squad.validateBankAccount(matchedBank.code, accountNumber);
          const pendingNewBank = {
            bankName: matchedBank.name,
            bankCode: matchedBank.code,
            accountNumber,
            accountName: accountInfo.accountName
          };

          await saveUser({
            ...userData,
            state: STATES.AWAITING_UPDATE_BANK_CONFIRM,
            pendingNewBank
          });

          return sock.sendMessage(from, {
            text: `🔍 *New Account Verified!*\n\n` +
              `👤 *Account Name:* ${accountInfo.accountName}\n` +
              `🏦 *Bank:* ${matchedBank.name}\n` +
              `🔢 *Account Number:* ${accountNumber}\n\n` +
              `💳 *Security Debit:* ₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} will be debited from your wallet.\n\n` +
              `Reply *YES* to confirm and lock this new account, or *CANCEL* to abort.`
          });
        } catch (err) {
          logger.error('Update bank validation failed:', err.message);
          return sock.sendMessage(from, {
            text: '❌ Could not verify bank account with bank servers. Please check your account number and try again:'
          });
        }
      }

      // ── AWAITING_UPDATE_BANK_CONFIRM ──────────────────────
      else if (userData.state === STATES.AWAITING_UPDATE_BANK_CONFIRM) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingNewBank: null });
          return sock.sendMessage(from, { text: '❌ Bank update cancelled.' });
        }

        if (command.toLowerCase() !== 'yes') {
          return sock.sendMessage(from, { text: 'Reply *YES* to confirm the update or *CANCEL* to abort.' });
        }

        const balance = await wallet.getBalance(from);
        if (balance < WITHDRAWAL_FEES.BANK_UPDATE_FEE) {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingNewBank: null });
          return sock.sendMessage(from, {
            text: `❌ Insufficient balance for ₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} verification fee. Bank update aborted.`
          });
        }

        const newBank = userData.pendingNewBank;
        await wallet.recordBankUpdateFee(from);

        await saveUser({
          ...userData,
          state: STATES.COMPLETED,
          verifiedName: newBank.accountName,
          name: newBank.accountName,
          bankDetails: newBank,
          pendingNewBank: null
        });

        return sock.sendMessage(from, {
          text: `✅ *Bank Details Successfully Updated!*\n\n` +
            `Your payout destination is permanently locked to:\n` +
            `👤 ${newBank.accountName}\n` +
            `🏦 ${newBank.bankName} (${newBank.accountNumber})\n\n` +
            `₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} security fee has been deducted from your wallet balance.`
        });
      }

      // ── RANK / TIER command ────────────────────────────────
      else if (command.toLowerCase() === 'rank' || command.toLowerCase() === 'tier') {
        const tier = (userData.donationTier || 'MEMBER').toUpperCase();
        const tierConfig = PARTNERSHIP_TIERS[tier] || PARTNERSHIP_TIERS.MEMBER;
        const personalProfit = await wallet.getTotalPersonalProfit(from);
        const cdsDonated = await wallet.getTotalCdsDonated(from);
        const rankBadge = userData.rankBadge || (tier === 'PIONEER' ? 'LORD' : tier);

        const rankMsg = `🎖️ *Clarion Enterprise Rank & Philanthropy Report*\n\n` +
          `👤 *Partner:* ${userData.verifiedName || userData.name}\n` +
          `🎖️ *Partnership Tier:* ${tierConfig.name}\n` +
          `👑 *Clarion Rank Badge:* ${rankBadge}\n\n` +
          `💰 *Total Personal Earnings:* ₦${personalProfit.toFixed(2)}\n` +
          `🤝 *Total CDS Impact Pooled:* ₦${cdsDonated.toFixed(2)} (${tierConfig.displayDonate} dedication)\n\n` +
          `🏆 *Active Privileges:*\n` +
          (tier === 'PIONEER'
            ? `• Clarion Lord Executive Badge & Rank\n• Maximum 64% Personal Profit Retention\n• Priority CDS Grant Proposal Consideration\n• Dedicated Enterprise Cloud Node`
            : tier === 'LORD'
            ? `• Clarion Lord Executive Badge & Honors\n• Highest CDS Philanthropist Standing (64% Pool)\n• VIP Community Recognition`
            : tier === 'MASTER'
            ? `• Clarion Master Enterprise Standing\n• Balanced 40/40 Social Enterprise Split`
            : `• Clarion Standard Partner\n• 64% Personal Profit Retention`) +
          `\n\n_Type *ID* anytime to download your Official Franchise Identification Card._`;

        return sock.sendMessage(from, { text: rankMsg });
      }

      // ── ID / LICENSE / PROFILE command (Download Franchise Profile Card) ──
      else if (command.toLowerCase() === 'id' || command.toLowerCase() === 'license' || command.toLowerCase() === 'profile') {
        await sock.sendMessage(from, { text: '⏳ Rendering your Official Clarion Franchise ID Card...' });
        try {
          const cardBuffer = await mediaGen.generateProfileCard(userData);
          return sock.sendMessage(from, {
            image: cardBuffer,
            caption: `🪪 *Clarion Franchise Identification License*\n\nPartner: *${userData.verifiedName || userData.name}*\nState Code: *${userData.stateCode || 'NYSC'}*\nTier: *${PARTNERSHIP_TIERS[userData.donationTier || 'MEMBER'].name}*`
          });
        } catch (e) {
          logger.error('Error generating franchise card:', e.message);
          return sock.sendMessage(from, { text: '❌ Failed to render card. Please try again shortly.' });
        }
      }

      // ── CARD / AIRTIME command (Buy Airtime via Wallet) ─────
      else if (/^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i.test(command)) {
        const cardMatch = command.match(/^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i);
        const amount = cardMatch && cardMatch[1] ? parseInt(cardMatch[1]) : null;
        let targetPhone = cardMatch && cardMatch[2] ? cardMatch[2] : (userData.phoneNumber || from.split('@')[0]);

        if (!amount) {
          await saveUser({ ...userData, state: STATES.AWAITING_MB_CARD_AMOUNT, previousState: STATES.COMPLETED });
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

        const balance = await wallet.getBalance(from);
        if (balance >= amount) {
          await sock.sendMessage(from, { text: `⏳ *Processing Airtime Top-up...*\nDeducting ₦${amount.toLocaleString()} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, amount, `Airtime: ₦${amount} to ${targetPhone} (${network.toUpperCase()})`, { network, targetPhone, amount });
            const result = await payflex.purchaseAirtime(network, targetPhone, amount);
            const newBal = (balance - amount).toFixed(2);
            return sock.sendMessage(from, {
              text: `✅ *Airtime Vended Successfully!*\n\n📱 *Recipient:* ${targetPhone}\n🌐 *Network:* ${network.toUpperCase()}\n💰 *Amount:* ₦${amount.toLocaleString()}\n💳 *Paid via:* Clarion Wallet\n🪙 *Remaining Balance:* ₦${newBal}\n🧾 *Ref:* ${result.reference}`
            });
          } catch (err) {
            logger.error('Error vending airtime to partner:', err.message);
            return sock.sendMessage(from, { text: `❌ Airtime delivery failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour current Clarion balance is *₦${balance.toFixed(2)}*, but this airtime order requires *₦${amount.toLocaleString()}*.\n\nTo fund your wallet, transfer to your collection account:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}\n👤 *Name:* ${userData.virtualAccount?.accountName || userData.verifiedName}`
          });
        }
      }

      // ── DATA command (Wholesale Self / Gift Purchase) ────────
      else if (/^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i.test(command) && command.toLowerCase() !== '.data') {
        const dataMatch = command.match(/^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i);
        const targetPrice = dataMatch && dataMatch[1] ? parseInt(dataMatch[1]) : null;
        let targetPhone = dataMatch && dataMatch[2] ? dataMatch[2] : (userData.phoneNumber || from.split('@')[0]);

        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const network = detectNetwork(targetPhone) || 'mtn';
        const plans = await payflex.getAvailablePlans();
        let filtered = plans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));

        if (targetPrice) {
          filtered.sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice));
          filtered = filtered.slice(0, 4);
        } else {
          filtered = filtered.slice(0, 6);
        }

        let msg = `📦 *Wholesale Data Plans for ${targetPhone} (${network.toUpperCase()})*\n\n`;
        filtered.forEach(p => {
          msg += `👉 *${p.name}*\n   💰 *Wholesale Cost:* ₦${p.basePrice} (Retail: ₦${p.sellPrice})\n   Reply *BUYDATA ${p.serial} ${targetPhone}* to purchase from wallet.\n\n`;
        });
        return sock.sendMessage(from, { text: msg });
      }
      else if (command.toLowerCase().startsWith('buydata ')) {
        const parts = command.split(/\s+/);
        const serial = parts[1];
        let targetPhone = parts[2] || userData.phoneNumber || from.split('@')[0];
        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }

        const plans = await payflex.getAvailablePlans();
        const plan = plans.find(p => p.serial.toString() === serial.toString());
        if (!plan) {
          return sock.sendMessage(from, { text: '❌ Invalid plan selection. Type *DATA* to view wholesale plans.' });
        }

        const balance = await wallet.getBalance(from);
        if (balance >= plan.basePrice) {
          await sock.sendMessage(from, { text: `⏳ *Dispensing Data...*\nDeducting wholesale price ₦${plan.basePrice} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, plan.basePrice, `Data: ${plan.name} to ${targetPhone}`, { serial: plan.serial, planName: plan.name, targetPhone });
            await payflex.dispenseData(targetPhone, plan.serial);
            const newBal = (balance - plan.basePrice).toFixed(2);
            return sock.sendMessage(from, {
              text: `✅ *Data Vended Successfully!*\n\n📱 *Recipient:* ${targetPhone}\n📦 *Plan:* ${plan.name}\n💰 *Wholesale Cost:* ₦${plan.basePrice}\n💳 *Paid via:* Clarion Wallet\n🪙 *Remaining Balance:* ₦${newBal}`
            });
          } catch (err) {
            logger.error('Error dispensing self/gift data:', err.message);
            return sock.sendMessage(from, { text: `❌ Data vending failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour balance is *₦${balance.toFixed(2)}*, but this wholesale plan costs *₦${plan.basePrice}*.\n\nFund your wallet by transferring to:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}`
          });
        }
      }

      // ── PIN command (Exam Result Checker PINs) ─────────────
      else if (/^\.?pin(?:\s+(waec|neco))?$/i.test(command)) {
        const pinMatch = command.match(/^\.?pin(?:\s+(waec|neco))?$/i);
        const exam = pinMatch && pinMatch[1] ? pinMatch[1].toUpperCase() : null;
        const examProducts = payflex.getExamProducts();

        if (!exam) {
          let msg = `🎓 *Clarion Exam Result Checker PINs*\n\nAvailable PINs:\n`;
          for (const [k, v] of Object.entries(examProducts)) {
            msg += `👉 *PIN ${k}* — ₦${v.sellPrice.toLocaleString()} (${v.name})\n`;
          }
          msg += `\nReply *PIN WAEC* or *PIN NECO* to purchase directly from your wallet balance.`;
          return sock.sendMessage(from, { text: msg });
        }

        const product = examProducts[exam];
        const balance = await wallet.getBalance(from);
        if (balance >= product.sellPrice) {
          await sock.sendMessage(from, { text: `⏳ *Processing ${product.name}...*\nDeducting ₦${product.sellPrice.toLocaleString()} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, product.sellPrice, `Exam PIN: ${product.name}`, { examType: exam, price: product.sellPrice });
            const result = await payflex.purchaseExamPin(exam);
            const newBal = (balance - product.sellPrice).toFixed(2);
            return sock.sendMessage(from, {
              text: `🎓 *${product.name} Purchased Successfully!*\n\n` +
                `🔑 *PIN:* \`${result.pin}\`\n` +
                `🔢 *Serial:* \`${result.serialNumber}\`\n` +
                `💰 *Amount:* ₦${product.sellPrice.toLocaleString()}\n` +
                `💳 *Paid via:* Clarion Wallet\n` +
                `🪙 *Remaining Balance:* ₦${newBal}`
            });
          } catch (err) {
            logger.error('Error vending exam pin to partner:', err.message);
            return sock.sendMessage(from, { text: `❌ Exam PIN purchase failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour balance is *₦${balance.toFixed(2)}*, but ${product.name} costs *₦${product.sellPrice.toLocaleString()}*.\n\nFund your wallet by transferring to:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}`
          });
        }
      }

      // ── Existing COMPLETED state commands ──────────────────
      else if (command.toLowerCase() === 'menu' || command.toLowerCase() === '.data') {
        const plans = await payflex.getAvailablePlans();
        let menuText = `🛍️ *Clarion A.I. Digital Storefront*\n\nAvailable Enterprise Plans:\n`;
        plans.forEach(plan => {
          menuText += `\n🔹 *${plan.name}* - ₦${plan.sellPrice}\n   Reply *SUB ${plan.serial}* to test your store.`;
        });
        await sock.sendMessage(from, { text: menuText });
      }
      else if (command.toLowerCase().startsWith('sub ')) {
        const serialId = command.split(' ')[1];
        await sock.sendMessage(from, {
          text: `✅ *Simulated Order Success*\n\nYou just tested ordering Plan #${serialId}.\n\nIn a real scenario, your customer would receive this, pay their unique account, and you would earn profit instantly!`
        });
      }

      // ── CDS APPLY Command ──────────────────────────────────
      else if (/^\.?cds\s+apply(?:\s+(\d+))?(?:\s+(.+))?$/i.test(command)) {
        const match = command.match(/^\.?cds\s+apply(?:\s+(\d+))?(?:\s+(.+))?$/i);
        const amount = match && match[1] ? parseInt(match[1]) : null;
        const details = match && match[2] ? match[2].trim() : null;

        if (!amount || !details) {
          await saveUser({ ...userData, state: STATES.AWAITING_CDS_PROPOSAL_DETAILS });
          return sock.sendMessage(from, {
            text: `📋 *NYSC Community Development Service (CDS) Micro-Grant Application*\n\n` +
              `Clarion's CDS Community Fund sponsors personal and community development projects undertaken by corps members!\n\n` +
              `Please reply with your project details:\n` +
              `👉 *[Amount] [Project Title & Brief Details]*\n\n` +
              `*Example:* 75000 Primary School Science Lab Upgrade\n\n` +
              `_Reply CANCEL at anytime to exit._`
          });
        }

        const rawStateCode = (userData.stateCode || 'NYSC').replace(/[^a-zA-Z0-9]/g, '');
        const proposalId = `CDS-${rawStateCode}-${Math.floor(1000 + Math.random() * 9000)}`;
        const tier = (userData.donationTier || 'MEMBER').toUpperCase();
        const priorityMap = { PIONEER: 100, LORD: 90, MASTER: 70, MEMBER: 50 };
        const priorityScore = priorityMap[tier] || 50;

        const newProposal = {
          id: proposalId,
          proposalId,
          userId: from,
          verifiedName: userData.verifiedName || userData.name || 'Corps Member',
          stateCode: userData.stateCode || 'NYSC',
          donationTier: tier,
          priorityScore,
          grantAmountRequested: amount,
          title: details.split('\n')[0].slice(0, 60),
          description: details,
          status: 'PENDING',
          submittedAt: new Date().toISOString()
        };

        if (db.cdsProposals) {
          await db.cdsProposals.doc(proposalId).set(newProposal).catch(err => {
            logger.warn('Firestore proposal save failed, using memory:', err.message);
          });
        }
        mockCdsProposals.set(proposalId, newProposal);

        return sock.sendMessage(from, {
          text: `✅ *CDS Micro-Grant Proposal Submitted!*\n\n` +
            `🔖 *Tracking ID:* \`${proposalId}\`\n` +
            `💰 *Grant Requested:* ₦${amount.toLocaleString()}\n` +
            `📋 *Project:* ${newProposal.title}\n` +
            `🎖️ *Priority Standing:* ${PARTNERSHIP_TIERS[tier]?.name || tier} (${priorityScore}/100 Priority)\n\n` +
            `_Your proposal has been logged to the Clarion CDS Allocation Board. Type *CDS STATUS* anytime to check review status._`
        });
      }

      // ── CDS STATUS Command ─────────────────────────────────
      else if (/^\.?cds\s+status$/i.test(command)) {
        let userProposals = [];
        if (db.cdsProposals) {
          try {
            const snap = await db.cdsProposals.where('userId', '==', from).get();
            if (!snap.empty) {
              userProposals = snap.docs.map(doc => doc.data());
            }
          } catch (e) {}
        }
        if (userProposals.length === 0 && mockCdsProposals.size > 0) {
          userProposals = Array.from(mockCdsProposals.values()).filter(p => p.userId === from);
        }

        if (userProposals.length === 0) {
          return sock.sendMessage(from, {
            text: `ℹ️ *No CDS Grant Proposals Found*\n\nYou haven't submitted any micro-grant applications yet.\n\nType *CDS APPLY* to submit a project for community funding!`
          });
        }

        let report = `📋 *Your Clarion CDS Micro-Grant Applications:*\n\n`;
        userProposals.forEach(p => {
          const statusIcon = p.status === 'APPROVED' ? '✅ APPROVED' : (p.status === 'REJECTED' ? '❌ NOT APPROVED' : '⏳ UNDER REVIEW');
          report += `🔖 *ID:* \`${p.proposalId || p.id}\`\n` +
            `📌 *Project:* ${p.title}\n` +
            `💰 *Requested:* ₦${Number(p.grantAmountRequested || 0).toLocaleString()}\n` +
            (p.status === 'APPROVED' ? `🎉 *Approved Grant:* ₦${Number(p.approvedAmount || p.grantAmountRequested || 0).toLocaleString()}\n` : '') +
            `🚦 *Status:* ${statusIcon}\n` +
            (p.reviewNotes ? `📝 *Board Notes:* "${p.reviewNotes}"\n` : '') +
            `\n`;
        });
        report += `_Clarion allocates profit to sponsor impactful NYSC Community Development Service projects!_`;
        return sock.sendMessage(from, { text: report });
      }

      // ── IMPACT command ─────────────────────────────────────
      else if (/^\.?impact$/i.test(command)) {
        const totalCds = await wallet.getTotalCdsDonated(from);
        const impact = wallet.getImpactLevel(totalCds);

        const filledBars = Math.round((impact.percentage || 0) / 10);
        const emptyBars = Math.max(0, 10 - filledBars);
        const progressVisual = '▓'.repeat(filledBars) + '░'.repeat(emptyBars);

        const currentBadge = impact.current ? `${impact.current.badge} *${impact.current.title}*` : '🌱 *Community Contributor*';

        let impactMsg = `🏆 *Your NYSC Community Impact Score*\n\n` +
          `${currentBadge}\n` +
          `₦${totalCds.toLocaleString()} pooled to NYSC CDS\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (impact.next) {
          impactMsg += `Next Milestone: ${impact.next.badge} *${impact.next.title}* (₦${impact.next.threshold.toLocaleString()})\n` +
            `${progressVisual} ${impact.percentage}% complete (₦${impact.remaining.toLocaleString()} needed)\n`;
        } else {
          impactMsg += `💎 *Maximum Impact Achieved! NYSC Hero of Service*\n`;
        }

        impactMsg += `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `_Every airtime, data, and exam pin sale automatically contributes to community projects! Type *PROFILE* to view your upgraded ID card._ 🚀`;

        return sock.sendMessage(from, { text: impactMsg });
      }

      // ── PROFILE command ────────────────────────────────────
      else if (/^\.?profile$/i.test(command)) {
        await sock.sendMessage(from, { text: '🎨 Generating your Clarion Franchise Profile Card...' });
        try {
          const totalCds = await wallet.getTotalCdsDonated(from);
          const cardUser = {
            ...userData,
            totalCdsDonated: totalCds,
            phone: userData.phoneNumber || from.split('@')[0]
          };
          const cardBuffer = await mediaGen.generateProfileCard(cardUser);
          return sock.sendMessage(from, {
            image: cardBuffer,
            caption: `🪪 *Clarion Franchise Partner License*\n\n` +
              `👤 *Name:* ${cardUser.verifiedName || cardUser.name || 'Corps Member'}\n` +
              `🎖️ *Tier:* ${cardUser.donationTier || 'MEMBER'}\n` +
              `🏆 *CDS Impact:* ₦${totalCds.toLocaleString()} donated\n\n` +
              `_Save this to your phone and post it on your WhatsApp Status!_`
          });
        } catch (err) {
          logger.error('Error generating profile card for user:', err.message);
          return sock.sendMessage(from, { text: `❌ Could not generate profile card: ${err.message}` });
        }
      }

      // ── KIT / LAUNCH command ───────────────────────────────
      else if (/^\.?(?:kit|launch)$/i.test(command)) {
        const partnerPhone = (userData.phoneNumber || from.split('@')[0]).replace(/[^0-9]/g, '');
        const waPhone = partnerPhone.startsWith('0') ? `234${partnerPhone.substring(1)}` : (partnerPhone.startsWith('234') ? partnerPhone : `234${partnerPhone}`);
        const isSame = checkIsSameNumber(from, partnerPhone);

        let promoText = '';
        if (isSame) {
          promoText = `⚡ *Need Cheap & Fast Data?* 📶\n\n` +
            `I sell MTN, Airtel, Glo & 9mobile data at subsidized rates — instant automated delivery in 20 seconds!\n\n` +
            `👉 *To order right now, just reply to ME right here with:*\n` +
            `*DATA*\n\n` +
            `_Available 24/7 • 100% automated • Works right here on this number!_ 🚀`;
        } else {
          promoText = `⚡ *Need Cheap & Fast Data?* 📶\n\n` +
            `Get MTN, Airtel, Glo & 9mobile data delivered in 20 seconds!\n\n` +
            `👉 *Tap here to order from my 24/7 store line:*\n` +
            `https://wa.me/${waPhone}?text=DATA\n\n` +
            `Or text *DATA* to 0${partnerPhone.slice(-10)}! ⚡\n\n` +
            `_Available 24/7 • Instant automated top-up • Low rates guaranteed!_`;
        }

        await sock.sendMessage(from, { text: promoText });

        try {
          const shareBuffer = await mediaGen.generateShareCard({
            ...userData,
            phone: partnerPhone,
            isSameNumber: isSame
          });

          const captionText = isSame
            ? `📢 *Your Safe Launch Promotional Share Card!*\n\n` +
              `1️⃣ Save this image to your gallery.\n` +
              `2️⃣ Copy the message above.\n` +
              `3️⃣ Post both to your WhatsApp Status!\n\n` +
              `_When your contacts view your status and reply 'DATA', your automated bot takes over and sells data instantly!_ 🚀`
            : `📢 *Your Safe Launch Promotional Share Card!*\n\n` +
              `1️⃣ Save this image to your gallery.\n` +
              `2️⃣ Copy the message above.\n` +
              `3️⃣ Post both to your WhatsApp Status and forward to 20 friends or groups.\n\n` +
              `_When they tap your wa.me link, your bot takes over and sells data automatically!_ 🚀`;

          await sock.sendMessage(from, {
            image: shareBuffer,
            caption: captionText
          });
        } catch (cardErr) {
          logger.error('Error generating share card for KIT command:', cardErr.message);
        }

        return;
      }

      // ── PROMO / GIVEAWAY / FUEL command ─────────────────────
      else if (/^\.?(?:promo|giveaway|fuel)$/i.test(command)) {
        const partnerPhone = (userData.phoneNumber || from.split('@')[0]).replace(/[^0-9]/g, '');
        const isSame = checkIsSameNumber(from, partnerPhone);
        const balance = await wallet.getBalance(from);
        const virtualAcct = userData.virtualAccount || CENTRAL_HUB_ACCOUNT;

        if (balance < 250) {
          return sock.sendMessage(from, {
            text: `⛽ *Promo Fuel: Kickstart Your Store Engagement!* 🚀\n\n` +
              `Clarion is 100% free with ₦0 startup capital. BUT vendors who add *₦500 – ₦2,000* to their wallet on Day 1 to run a *Launch Giveaway* see 4x faster sales!\n\n` +
              `*How to load Promo Fuel:*\n` +
              `1️⃣ Transfer ₦500 or ₦1,000 to your Dedicated Store Account:\n` +
              `   🏦 *Bank:* ${virtualAcct.bankName}\n` +
              `   🔢 *Account:* ${virtualAcct.accountNumber}\n` +
              `   👤 *Name:* ${virtualAcct.accountName || userData.verifiedName}\n\n` +
              `2️⃣ Once loaded, we automatically generate your custom *Launch Giveaway Poster* and status text to gift free 500MB to your first 5 friends!\n\n` +
              `_Transfer anytime to unlock your Launch Giveaway kit._ ⚡`
          });
        }

        await sock.sendMessage(from, { text: '🎨 Generating your custom Launch Giveaway Poster...' });
        try {
          const promoBuffer = await mediaGen.generateGiveawayPromoCard({
            ...userData,
            phone: partnerPhone,
            isSameNumber: isSame
          }, balance);

          const giveawayStatusText = isSame
            ? `🎉 *MY 24/7 DATA BOT IS OFFICIALLY LIVE!* 🚀\n\n` +
              `To celebrate my launch, I’m giving away FREE 500MB Data to the first 5 people who test my automated bot right now!\n\n` +
              `👉 *To claim: Just reply to ME right here with:* \n*DATA*\n\n` +
              `Watch the bot reply and vend your data in 20 seconds! ⚡`
            : `🎉 *MY 24/7 DATA BOT IS OFFICIALLY LIVE!* 🚀\n\n` +
              `To celebrate my launch, I’m giving away FREE 500MB Data to the first 5 people who test my automated bot right now!\n\n` +
              `👉 *To claim: Tap this link to message my bot:*\nhttps://wa.me/234${partnerPhone.slice(-10)}?text=DATA\n\n` +
              `Or text *DATA* to 0${partnerPhone.slice(-10)}! ⚡`;

          await sock.sendMessage(from, {
            image: promoBuffer,
            caption: `🎁 *YOUR EXCLUSIVE LAUNCH GIVEAWAY POSTER!* 🎨\n\n` +
              `You have *₦${balance.toFixed(2)}* Promo Fuel in your wallet.\n\n` +
              `📋 *Copy the text below and post it on your WhatsApp Status with this image:*`
          });

          return sock.sendMessage(from, { text: giveawayStatusText });
        } catch (err) {
          logger.error('Error generating giveaway promo card:', err.message);
          return sock.sendMessage(from, { text: `❌ Could not generate giveaway poster: ${err.message}` });
        }
      }

      // ── GIFT command ───────────────────────────────────────
      else if (/^\.?gift\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})(?:\s+(\S+))?$/i.test(command)) {
        const giftMatch = command.match(/^\.?gift\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})(?:\s+(\S+))?$/i);
        let targetPhone = giftMatch[1];
        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const planArg = giftMatch[2] || '500MB';
        const network = detectNetwork(targetPhone) || 'mtn';

        const plans = await payflex.getAvailablePlans();
        const networkPlans = plans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));

        let matchedPlan = networkPlans.find(p => p.name.toLowerCase().includes(planArg.toLowerCase())) || networkPlans[0];

        if (!matchedPlan) {
          return sock.sendMessage(from, { text: `❌ No matching data plan found for ${network.toUpperCase()}.` });
        }

        const balance = await wallet.getBalance(from);
        if (balance < matchedPlan.basePrice) {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance to Gift Data*\n\n` +
              `Gifting *${matchedPlan.name}* costs *₦${matchedPlan.basePrice}* wholesale, but your balance is *₦${balance.toFixed(2)}*.\n\n` +
              `To fund your wallet, transfer to:\n` +
              `🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n` +
              `🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}`
          });
        }

        await sock.sendMessage(from, { text: `⏳ Dispensing promotional gift of *${matchedPlan.name}* to *${targetPhone}* (${network.toUpperCase()})...` });

        try {
          await wallet.recordPurchaseDebit(from, matchedPlan.basePrice, `Promo Gift: ${matchedPlan.name} to ${targetPhone}`, { targetPhone, planName: matchedPlan.name });
          await payflex.dispenseData(targetPhone, matchedPlan.serial);
          const newBal = (balance - matchedPlan.basePrice).toFixed(2);

          return sock.sendMessage(from, {
            text: `🎁 *Promo Data Gift Vended Successfully!*\n\n` +
              `📱 *Recipient:* ${targetPhone}\n` +
              `📦 *Plan:* ${matchedPlan.name} (${network.toUpperCase()})\n` +
              `💰 *Wholesale Cost:* ₦${matchedPlan.basePrice}\n` +
              `🪙 *Remaining Balance:* ₦${newBal}\n\n` +
              `_Your contact just experienced your 20-second automated delivery firsthand!_ 🚀`
          });
        } catch (giftErr) {
          logger.error('Error vending promo gift:', giftErr.message);
          return sock.sendMessage(from, { text: `❌ Gift delivery failed: ${giftErr.message}. Balance was not deducted.` });
        }
      }
    }

  } catch (error) {
    logger.error('Mother Bot Error:', error);
  }
};

/**
 * Checks if an updated CDS donation crosses an impact milestone.
 * Dispatches congratulatory message and an updated Profile Card to the partner.
 */
export const handleMilestoneCheck = async (userId, previousCdsTotal, newCdsTotal, userData = null) => {
  try {
    const crossed = wallet.checkMilestone(previousCdsTotal, newCdsTotal);
    if (!crossed) return null;

    logger.info(`[MILESTONE] User ${userId} crossed milestone: ${crossed.title} (₦${crossed.threshold})`);

    const sock = sessionManager.motherSock;
    const targetJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;

    let user = userData;
    if (!user && db.users) {
      try {
        const doc = await db.users.doc(userId).get();
        if (doc.exists) user = doc.data();
      } catch (e) {
        logger.warn(`Could not fetch user doc for milestone check: ${e.message}`);
      }
    }
    if (!user) {
      user = mockUserStore.get(userId) || { uid: userId, name: 'Corps Member', totalCdsDonated: newCdsTotal };
    }
    user.totalCdsDonated = newCdsTotal;

    const congratsText = `🎉 *CONGRATULATIONS CORPS MEMBER!* 🏆\n\n` +
      `You just unlocked a new community impact milestone:\n` +
      `🎖️ *${crossed.badge} ${crossed.title}*!\n\n` +
      `Your automated sales have contributed over *₦${crossed.threshold.toLocaleString()}* directly into the NYSC Community Development Fund.\n\n` +
      `_Here is your upgraded Clarion Franchise ID Card featuring your new honor:_`;

    if (sock) {
      await sock.sendMessage(targetJid, { text: congratsText });
      try {
        const cardBuffer = await mediaGen.generateProfileCard(user);
        await sock.sendMessage(targetJid, {
          image: cardBuffer,
          caption: `🪪 *Official Clarion Franchise License — ${crossed.badge} ${crossed.title}*\nTotal CDS Contributed: ₦${newCdsTotal.toLocaleString()}`
        });
      } catch (imgErr) {
        logger.error('Error generating milestone profile card image:', imgErr.message);
      }
    }

    return crossed;
  } catch (error) {
    logger.error('Error handling milestone check:', error);
    return null;
  }
};
