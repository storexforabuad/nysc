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
    const dataCommandRegex = /^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
    const isDataMatch = dataCommandRegex.test(command);

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

      let menuText = `👋 Welcome to *${user.name || 'our'}* Digital Hub!\nPowered by *Clarion A.I.*\n\n`;

      let networkStr = detectedNet ? detectedNet.toUpperCase() : 'Digital';
      if (detectedNet && targetPhone) {
        menuText += `🔎 Network Detected: *${networkStr}* for ${targetPhone}\n\n`;
      } else if (detectedNet) {
        menuText += `🔎 Network Detected: *${networkStr}*\n\n`;
      }

      if (targetPrice) {
        menuText += `*Available ${networkStr} Plans around ₦${targetPrice}:*\n`;
      } else {
        menuText += `*Available ${networkStr} Enterprise Plans:*\n`;
      }

      if (filteredPlans.length === 0) {
        menuText += `\n❌ No plans found matching your criteria.`;
      } else {
        filteredPlans.forEach(plan => {
          menuText += `\n🔹 *${plan.name}* - ₦${plan.sellPrice}\n   Reply *BUY ${plan.serial}* to order.`;
        });
      }

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

