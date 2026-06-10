import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import payflex from '../services/payflex.js';
import broadcastQueue from '../services/BroadcastQueue.js';

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
  const pushName = msg.pushName || 'User';

  if (!text) return;

  const command = text.toLowerCase().trim();

  if (command === 'stop') {
    await broadcastQueue.setOptOut(user.uid, from);
    return sock.sendMessage(from, { text: 'You have been successfully opted out of automated promotional broadcasts.' });
  }

  console.log('\n' + '='.repeat(50));
  console.log(`🤖 PROXY BOT MESSAGE RECEIVED`);
  console.log(`FROM: ${from}`);
  console.log(`OWNER: ${user.name || 'Unknown User'}`);
  console.log(`CONTENT: "${command}"`);
  console.log('='.repeat(50) + '\n');

  try {
    if (command === 'menu' || command === '.data' || command === 'data' || command === 'start') {
      const plans = await payflex.getAvailablePlans();

      let menuText = `👋 Hello ${pushName}!\n\nWelcome to *${user.name}'s* Data Store.\n\n*Available Data Plans:*\n`;
      let currentNet = '';

      plans.forEach(plan => {
        const netName = plan.network || 'OTHER';
        if (netName !== currentNet) {
          menuText += `\n*${netName.split('_').join(' ').toUpperCase()}*\n`;
          currentNet = netName;
        }
        menuText += `🔹 *${plan.name}* - ₦${plan.sellPrice || plan.price}\n   Reply with *SUB ${plan.serial || plan.id}* to buy.\n`;
      });

      menuText += `\n\n💡 Funding Account:\nBank: ${user.virtualAccount?.bankName || 'MOCK WEMA'}\nAcct: ${user.virtualAccount?.accountNumber || '0123456789'}\nName: ${user.virtualAccount?.accountName || user.name}\n\n_Transfer exact amount and data will be vended instantly._`;

      await sock.sendMessage(from, { text: menuText });
    }
    else if (command.startsWith('sub ')) {
      const serialId = command.split(' ')[1];
      const plans = await payflex.getAvailablePlans();
      const plan = plans.find(p => p.serial.toString() === serialId.toString());

      if (!plan) {
        return sock.sendMessage(from, { text: '❌ Invalid plan selected. Type *MENU* to see options.' });
      }

      await sock.sendMessage(from, {
        text: `✅ Order Initialized for *${plan.name}*.\n\nPlease transfer ₦${plan.sellPrice} to your unique account above.\n\nDestination: ${from.split('@')[0]}`
      });

      // Save pending order to firestore if available
      if (db.ledger) {
        await db.ledger.add({
          type: 'PENDING_DATA',
          userId: user.uid,
          buyerPhone: from,
          planId: plan.id,
          serial: plan.serial,
          amount: plan.sellPrice,
          markup: plan.markup,        // Tiered profit on this order
          proxyCost: plan.proxyCost,
          baseCost: plan.basePrice,
          createdAt: new Date().toISOString()
        }).catch(err => logger.warn('Ledger write failed, order processed in memory only.'));
      }
    }
  } catch (error) {
    console.error('CRITICAL RAW ERROR:', error);
    logger.error({ err: error }, 'Proxy Bot Error');
  }
};
