import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import payflex from '../services/payflex.js';

export const handleProxyMessage = async (sock, msg, user) => {
  const from = msg.key.remoteJid;
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  const pushName = msg.pushName || 'User';

  if (!text) return;

  const command = text.toLowerCase().trim();

  try {
    if (command === 'menu' || command === '.data' || command === 'start') {
      const plansSnapshot = await db.plansCache.limit(10).get();
      let menuText = `👋 Hello ${pushName}!\n\nWelcome to *${user.name}'s* Data Store.\n\n*Available Data Plans:*\n`;
      
      plansSnapshot.forEach(doc => {
        const plan = doc.data();
        menuText += `\n🔹 *${plan.name}* - ₦${plan.price}\n   Reply with *SUB ${plan.id}* to buy.`;
      });

      menuText += `\n\n💡 Funding Account:\nBank: ${user.virtualAccount?.bankName || 'N/A'}\nAcct: ${user.virtualAccount?.accountNumber || 'N/A'}\nName: ${user.virtualAccount?.accountName || 'N/A'}\n\n_Transfer exact amount and data will be vended instantly._`;

      await sock.sendMessage(from, { text: menuText });
    } 
    else if (command.startsWith('sub ')) {
      const planId = command.split(' ')[1];
      const planDoc = await db.plansCache.doc(planId).get();

      if (!planDoc.exists) {
        return sock.sendMessage(from, { text: '❌ Invalid plan selected. Type *MENU* to see options.' });
      }

      const plan = planDoc.data();
      await sock.sendMessage(from, { 
        text: `✅ Order Initialized for *${plan.name}*.\n\nPlease transfer ₦${plan.price} to your unique account above.\n\nDestination: ${from.split('@')[0]}`
      });

      // Save pending order to firestore linked to this user's virtual account
      await db.ledger.add({
        type: 'PENDING_DATA',
        userId: user.uid,
        buyerPhone: from,
        planId: planId,
        amount: plan.price,
        createdAt: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Proxy Bot Error:', error);
  }
};
