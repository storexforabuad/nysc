import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import payflex from '../services/payflex.js';
import broadcastQueue from '../services/BroadcastQueue.js';
import { detectNetwork } from '../utils/networkUtils.js';

export const handleProxyMessage = async (sock, msg, user) => {
  const from = msg.key.remoteJid;
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

    // Handle Data/Menu request
    if (command === 'menu' || command === '.data' || command === 'data' || command === 'start') {
      const plans = await payflex.getAvailablePlans();
      const detectedNet = detectNetwork(actionableJid);

      let filteredPlans = plans;
      if (detectedNet) {
        filteredPlans = plans.filter(p => {
          if (detectedNet === 'mtn') return p.network.includes('mtn');
          return p.network.includes(detectedNet);
        });
      }

      let menuText = `👋 Welcome to *${user.name || 'our'}* Digital Hub!\nPowered by *Clarion A.I.*\n\n`;

      if (detectedNet) {
        menuText += `🔎 Network Detected: *${detectedNet.toUpperCase()}*\n\n*Available ${detectedNet.toUpperCase()} Enterprise Plans:*\n`;
      } else {
        menuText += `*Available Digital Enterprise Plans:*\n`;
      }

      filteredPlans.forEach(plan => {
        menuText += `\n🔹 *${plan.name}* - ₦${plan.sellPrice}\n   Reply *BUY ${plan.serial}* to order.`;
      });

      menuText += '\n\n_Transfer exact amount and data will be vended instantly._';
      return sock.sendMessage(from, { text: menuText });
    }

    // Handle Order initiation
    if (command.startsWith('buy ')) {
      const serial = command.split(' ')[1];
      const plans = await payflex.getAvailablePlans();
      const plan = plans.find(p => p.serial.toString() === serial.toString());

      if (!plan) {
        return sock.sendMessage(from, { text: '❌ Invalid plan serial. Type *DATA* to view the Clarion catalog.' });
      }

      const orderRef = `CLARION_${Date.now()}`;
      if (db.ledger) {
        await db.ledger.add({
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

      const paymentInstruction = `💳 *Order Confirmation: ${plan.name}*\n\nTo complete your purchase, please transfer *₦${plan.sellPrice}* to the secure Clarion collection account below:\n\nBank: ${user.virtualAccount.bankName}\nAccount: ${user.virtualAccount.accountNumber}\nName: Clarion - ${user.name}\n\n✅ Your data will be dispensed automatically upon payment detection.`;
      return sock.sendMessage(from, { text: paymentInstruction });
    }

    // Default welcome message for first contact or unrecognizable input
    if (command.includes('hi') || command.includes('hello') || !command) {
      return sock.sendMessage(from, {
        text: `👋 Welcome to *${user.name || 'our'}* Digital Hub!\n\nI am your Clarion A.I. assistant. We provide high-speed data at wholesale prices 24/7.\n\nType *DATA* to view our available enterprise plans.`
      });
    }

  } catch (error) {
    logger.error({ err: error }, 'Clarion Digital Store Error');
  }
};

