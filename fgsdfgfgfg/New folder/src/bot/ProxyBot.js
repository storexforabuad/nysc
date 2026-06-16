import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import payflex from '../services/payflex.js';
import broadcastQueue from '../services/BroadcastQueue.js';

const NETWORK_PREFIXES = {
  mtn: ['0803', '0806', '0810', '0813', '0814', '0816', '0703', '0706', '0903', '0906', '0913', '0916'],
  airtel: ['0802', '0808', '0812', '0701', '0708', '0901', '0902', '0904', '0907', '0912'],
  glo: ['0805', '0807', '0811', '0815', '0705', '0905', '0915'],
  '9mobile': ['0809', '0817', '0818', '0908', '0909']
};

const detectNetwork = (from) => {
  if (!from) return null;
  const cleanNumber = from.split('@')[0].replace(/\D/g, '');
  let normalized = cleanNumber;
  if (cleanNumber.startsWith('234')) {
    normalized = '0' + cleanNumber.substring(3);
  } else if (!cleanNumber.startsWith('0')) {
    normalized = '0' + cleanNumber;
  }

  const prefix = normalized.substring(0, 4);
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix)) return network;
  }
  return null;
};

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
    let actionableJid = from;
    if (from.endsWith('@lid')) {
      try {
        const lid = from.split('@')[0];
        const mapping = await sock.authState.keys.get('lid-mapping', [`${lid}_reverse`]);
        if (mapping && mapping[`${lid}_reverse`]) {
          actionableJid = mapping[`${lid}_reverse`];
          console.log(`[LID RESOLUTION] Successfully mapped ${from} to ${actionableJid}`);
        }
      } catch (err) {
        logger.warn('Could not resolve LID mapping for ' + from);
      }
    }

    if (command === 'menu' || command === '.data' || command === 'data' || command === 'start') {
      const plans = await payflex.getAvailablePlans();
      const detectedNet = detectNetwork(actionableJid);

      let filteredPlans = plans;
      if (detectedNet) {
        filteredPlans = plans.filter(p => {
          if (detectedNet === 'mtn') {
            return p.network.includes('mtn');
          }
          return p.network.includes(detectedNet);
        });
      }

      let menuText = `👋 Hello ${pushName}!\n\nWelcome to *${user.name}'s* Data Store.\n\n`;

      if (detectedNet) {
        menuText += `🔎 I've detected you are on the *${detectedNet.toUpperCase()}* network.\n\n*Available ${detectedNet.toUpperCase()} Plans:*\n`;
      } else {
        menuText += `*Available Data Plans:*\n`;
      }

      let currentNet = '';

      filteredPlans.forEach(plan => {
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
