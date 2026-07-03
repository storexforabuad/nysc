import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import squad from '../services/SquadService.js';
import payflex from '../services/payflex.js';
import sessionManager from './SessionManager.js';
import wallet, { WITHDRAWAL_FEES } from '../services/WalletService.js';
import reportService from '../services/ReportService.js';
import broadcastQueue from '../services/BroadcastQueue.js';
import { detectNetwork } from '../utils/networkUtils.js';

const STATES = {
  START: 'START',
  AWAITING_NYSC_CODE: 'AWAITING_NYSC_CODE',
  AWAITING_DETAILS: 'AWAITING_DETAILS',
  COMPLETED: 'COMPLETED',
  AWAITING_WITHDRAW_DETAILS: 'AWAITING_WITHDRAW_DETAILS',
  AWAITING_WITHDRAW_CONFIRM: 'AWAITING_WITHDRAW_CONFIRM',
  AWAITING_BROADCAST_CONTACTS: 'AWAITING_BROADCAST_CONTACTS',
  AWAITING_CONTACT_ACTION: 'AWAITING_CONTACT_ACTION',
  AWAITING_DATA_PLAN_SELECT: 'AWAITING_DATA_PLAN_SELECT',
  AWAITING_PAYMENT_METHOD: 'AWAITING_PAYMENT_METHOD'
};

// In-memory fallback if Firestore is slow/down
const mockUserStore = new Map();

export const handleMotherMessage = async (sock, msg) => {
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
      await sock.sendMessage(from, {
        text: `🎺 Welcome ${pushName} to Clarion A.I. — your NYSC SAED-inspired digital enterprise partner!\n\nI am the Clarion Hub. I'm here to help you activate your very own automated data storefront. Ready to blow your trumpet?\n\nTo begin, please reply with your *NYSC State Code* (e.g., NY/24A/1234):`
      });
      await saveUser({ ...userData, state: STATES.AWAITING_NYSC_CODE });
    }
    else if (userData.state === STATES.AWAITING_NYSC_CODE) {
      const stateCodeRegex = /^[A-Z]{2}\/\d{2}[A-C]\/\d{4}$/i;
      if (!stateCodeRegex.test(command)) {
        return sock.sendMessage(from, { text: '❌ Invalid State Code format. Please use the format: NY/24A/1234' });
      }

      await sock.sendMessage(from, { text: '✅ Verified! Now creating your business wallet...' });

      // Create Squad Virtual Account
      const account = await squad.createVirtualAccount(pushName, `${from.split('@')[0]}@nyscbot.com`, from.split('@')[0]);

      await saveUser({
        ...userData,
        stateCode: command.toUpperCase(),
        virtualAccount: account,
        state: STATES.COMPLETED,
        name: pushName
      });

      await sock.sendMessage(from, {
        text: `🎊 Enterprise Setup Complete!\n\nYour Clarion Profit Wallet is now active.\nBank: ${account.bankName}\nAcct: ${account.accountNumber}\n\n*Final Step:* Type *PAIR [your_phone_number]* to link your WhatsApp and activate your Digital Storefront.`
      });
    }
    else if (command.toUpperCase().startsWith('PAIR')) {
      let targetNumber = userData.uid.split('@')[0];
      const parts = command.split(/\s+/);

      if (parts.length > 1) {
        // User provided a manual number, e.g. PAIR 08012345678
        let rawNumber = parts[1].replace(/\D/g, '');

        // Normalize Nigerian local numbers: 080... -> 23480...
        if (rawNumber.startsWith('0') && rawNumber.length === 11) {
          rawNumber = '234' + rawNumber.substring(1);
          logger.info(`Normalized local number ${parts[1]} to ${rawNumber}`);
        }

        targetNumber = rawNumber;

        // Save phone number to DB immediately
        await saveUser({ ...userData, phoneNumber: targetNumber, phoneJid: `${targetNumber}@s.whatsapp.net` });

        await sock.sendMessage(from, { text: `⏳ Generating your activation QR code for *${targetNumber}*...\n\nPlease stand by — the Clarion Hub is preparing your secure link!` });
      } else {
        // No manual number provided. Check if we have an LID which can't be used for pairing.
        const isLid = userData.uid.endsWith('@lid');
        if (isLid) {
          return sock.sendMessage(from, {
            text: `❌ *Phone Number Required*\n\nI detected that you are using an LID-based account. To generate a pairing code, I need your actual phone number.\n\nPlease type:\n*PAIR [your_phone_number]*\n(e.g., *PAIR 08012345678*)`
          });
        }
        await sock.sendMessage(from, { text: '⏳ Generating your activation QR code... Please stand by!' });
      }

      try {
        await sessionManager.startQRPairingForUser(
          {
            ...userData,
            uid: targetNumber.includes('@') ? targetNumber : `${targetNumber}@s.whatsapp.net`
          },
          async () => {
            // Called the instant the QR appears in the terminal
            await sock.sendMessage(from, {
              text: `📱 *Your QR code is now live!*\n\nThe admin is turning the screen towards you right now.\n\n*How to scan:*\n1. Open WhatsApp on your phone\n2. Go to *Settings > Linked Devices*\n3. Tap *Link a Device*\n4. Point your camera at the QR code on the screen\n\n⏱️ You have about 60 seconds before it expires!`
            });
          }
        );
      } catch (err) {
        logger.error('QR Pairing Error:', err);
        await sock.sendMessage(from, { text: '❌ Failed to generate QR code. Please try again by typing *PAIR [your_phone_number]*.' });
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
        const template = `🚀 Great news! I've just launched my own automated 24/7 data enterprise powered by Clarion A.I (An NYSC SAED Inspired Project). You can now get high-speed data at affordable prices directly through my number!\n\nIf you ever need data, simply reply to my number with:\n\n*DATA* - See all plans for your network\n*DATA [price]* - Find plans around your budget (e.g., DATA 500)\n*DATA [price] [number]* - Send to someone else (e.g., DATA 500 08123...)\n\nFeel free to ignore this if you're not interested right now! 😊`;

        let validJids = extractContacts();
        if (validJids.length > 0) {
          let whitelist = userData.tempWhitelist || [];
          let added = 0;
          for (let targetJid of validJids) {
            if (!whitelist.includes(targetJid)) {
              whitelist.push(targetJid);
              added++;
            }
          }
          if (added > 0) {
            await saveUser({ ...userData, tempWhitelist: whitelist });
            return sock.sendMessage(from, { text: `✅ Added ${added} number(s) to your broadcast list. (Total: ${whitelist.length})\n\nKeep sending more contacts, or reply *DONE* to send the broadcast!` });
          } else {
            return sock.sendMessage(from, { text: 'Number(s) already in the list. Reply *DONE* to broadcast.' });
          }
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
          const template = `🚀 Great news! I've just launched my own automated 24/7 data enterprise powered by Clarion A.I (An NYSC SAED Inspired Project). You can now get high-speed data at affordable prices directly through my number!\n\nIf you ever need data, simply reply to my number with:\n\n*DATA* - See all plans for your network\n*DATA [price]* - Find plans around your budget (e.g., DATA 500)\n*DATA [price] [number]* - Send to someone else (e.g., DATA 500 08123...)\n\nFeel free to ignore this if you're not interested right now! 😊`;
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
            await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, selectedDataPlan: null });
            return sock.sendMessage(from, { text: `✅ *Data Vended Successfully!*\n\nProfit of ₦${profitStr} registered to your wallet.` });
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

        const msg = `📈 *Weekly Enterprise Report: Clarion A.I.*\n\n` +
          `Total Orders: ${stats.totalOrders}\n` +
          `Gross Revenue: ₦${stats.grossRevenue}\n` +
          `Net Profit Earned: ₦${stats.netProfit}\n` +
          `Active Customer Base: ${stats.activeCustomers}\n\n` +
          `_Keep scaling your digital enterprise! Have a highly profitable weekend._ 🚀`;

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

      // ── WITHDRAW command (initiates flow) ──────────────────
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

        await saveUser({ ...userData, state: STATES.AWAITING_WITHDRAW_DETAILS, pendingWithdrawAmount: amount });
        return sock.sendMessage(from, {
          text: `💸 *Withdrawal Request: ₦${amount.toFixed(2)}*\n\nPlease provide your bank details:\n\nReply with your *Bank Name* and *Account Number*.\n(e.g., *GTBank 0123456789* or *GTBank0123456789*)\n\nType *CANCEL* to abort.`
        });
      }

      // ── AWAITING_WITHDRAW_DETAILS (bank + account) ─────────
      else if (userData.state === STATES.AWAITING_WITHDRAW_DETAILS) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, { text: '❌ Withdrawal cancelled.' });
        }

        // Smart parsing: handle "GTBank 0123456789", "GTBank0123456789", "Access Bank 0123456789"
        let bankName = '';
        let accountNumber = '';

        // Try splitting on space first (handles "GTBank 0123456789" and "Access Bank 0123456789")
        const spaceMatch = command.match(/^(.+?)\s*(\d{10})$/);
        if (spaceMatch) {
          bankName = spaceMatch[1].trim();
          accountNumber = spaceMatch[2];
        } else {
          // Fallback: no space between bank name and digits (e.g. "GTBank0123456789")
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

        // Look up the bank code from the bank list
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

        // Validate the account with Monnify
        try {
          const accountInfo = await squad.validateBankAccount(matchedBank.code, accountNumber);

          const amount = userData.pendingWithdrawAmount;
          const netPayout = +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2);

          await saveUser({
            ...userData,
            state: STATES.AWAITING_WITHDRAW_CONFIRM,
            pendingBank: {
              bankName: matchedBank.name,
              bankCode: matchedBank.code,
              accountNumber,
              accountName: accountInfo.accountName
            }
          });

          return sock.sendMessage(from, {
            text: `🔍 *Account Verified!*\n\n👤 Name: *${accountInfo.accountName}*\n🏦 Bank: *${matchedBank.name}*\n🔢 Account: *${accountNumber}*\n\n💰 Requested: *₦${amount.toFixed(2)}*\n🏦 Bank Fee: *₦${WITHDRAWAL_FEES.SQUAD_FEE}*\n⚙️ Service Fee: *₦${WITHDRAWAL_FEES.SERVICE_FEE}*\n💵 You will receive: *₦${netPayout.toFixed(2)}*\n\nReply *YES* to confirm transfer or *CANCEL* to abort.`
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
        const bank = userData.pendingBank;
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
          // Record as pending before calling Monnify to prevent double spend
          await wallet.recordWithdrawal(from, amount, bank, transferRef);

          const result = await squad.initiateTransfer(
            netPayout,
            bank.bankCode,
            bank.accountNumber,
            `NYSC Bot payout for ${userData.name || from}`,
            transferRef
          );

          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });

          return sock.sendMessage(from, {
            text: `✅ *Withdrawal Request Submitted!*\n\n💵 *₦${netPayout.toFixed(2)}* is on its way to:\n👤 ${bank.accountName}\n🏦 ${bank.bankName} (${bank.accountNumber})\n\nRef: ${transferRef}\n\nType *BALANCE* to check your updated wallet. Type *HISTORY* to track status.`
          });
        } catch (err) {
          logger.error('Transfer failed:', err.message);
          // Fail the withdrawal so balance is restored
          await wallet.updateWithdrawalStatus(transferRef, 'FAILED');
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, {
            text: '❌ Transfer failed. Your balance has been restored. Please try again later.'
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
    }

  } catch (error) {
    logger.error('Mother Bot Error:', error);
  }
};
