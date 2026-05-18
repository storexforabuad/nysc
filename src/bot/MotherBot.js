import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import monnify from '../services/monnify.js';

const STATES = {
  START: 'START',
  AWAITING_NYSC_CODE: 'AWAITING_NYSC_CODE',
  AWAITING_DETAILS: 'AWAITING_DETAILS',
  COMPLETED: 'COMPLETED'
};

export const handleMotherMessage = async (sock, msg) => {
  const from = msg.key.remoteJid;
  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  const pushName = msg.pushName || 'Co-member';

  if (!text) return;

  try {
    const userRef = db.users.doc(from);
    const userDoc = await userRef.get();
    let userData = userDoc.exists ? userDoc.data() : { state: STATES.START, uid: from };

    const command = text.trim();

    if (userData.state === STATES.START) {
      await sock.sendMessage(from, { 
        text: `🇳🇬 Welcome ${pushName} to the NYSC Data Bot System!\n\nI am the Mother Bot. I will help you setup your personal Data Proxy Bot.\n\nTo begin, please reply with your *NYSC State Code* (e.g., NY/24A/1234):`
      });
      await userRef.set({ ...userData, state: STATES.AWAITING_NYSC_CODE }, { merge: true });
    } 
    else if (userData.state === STATES.AWAITING_NYSC_CODE) {
      const stateCodeRegex = /^[A-Z]{2}\/\d{2}[A-C]\/\d{4}$/i;
      if (!stateCodeRegex.test(command)) {
        return sock.sendMessage(from, { text: '❌ Invalid State Code format. Please use the format: NY/24A/1234' });
      }

      await sock.sendMessage(from, { text: '✅ Verified! Now creating your business wallet...' });
      
      // Create Monnify Virtual Account
      const account = await monnify.createVirtualAccount(pushName, `${from.split('@')[0]}@nyscbot.com`);
      
      await userRef.set({ 
        ...userData, 
        stateCode: command.toUpperCase(), 
        virtualAccount: account,
        state: STATES.COMPLETED,
        name: pushName
      }, { merge: true });

      await sock.sendMessage(from, { 
        text: `🎊 Onboarding Complete!\n\nYour Profit Wallet is active.\nBank: ${account.bankName}\nAcct: ${account.accountNumber}\n\n*Final Step:* Type *PAIR* to link your WhatsApp and activate your Proxy Bot.`
      });
    }
    else if (command.toUpperCase() === 'PAIR') {
      // In a real implementation with pairing codes:
      // await sock.requestPairingCode(from.split('@')[0]);
      await sock.sendMessage(from, { text: '🔄 Pairing logic initiated. Check your notifications for a linking code (Simulated in this demo).' });
    }

  } catch (error) {
    logger.error('Mother Bot Error:', error);
  }
};
