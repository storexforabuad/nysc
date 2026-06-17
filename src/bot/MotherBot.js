import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import monnify from '../services/monnify.js';
import payflex from '../services/payflex.js';
import sessionManager from './SessionManager.js';
import wallet, { WITHDRAWAL_FEES } from '../services/WalletService.js';
import reportService from '../services/ReportService.js';
import broadcastQueue from '../services/BroadcastQueue.js';

const STATES = {
  START: 'START',
  AWAITING_NYSC_CODE: 'AWAITING_NYSC_CODE',
  AWAITING_DETAILS: 'AWAITING_DETAILS',
  COMPLETED: 'COMPLETED',
  AWAITING_WITHDRAW_DETAILS: 'AWAITING_WITHDRAW_DETAILS',
  AWAITING_WITHDRAW_CONFIRM: 'AWAITING_WITHDRAW_CONFIRM',
  AWAITING_BROADCAST_PERMISSION: 'AWAITING_BROADCAST_PERMISSION'
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

  if (!text) {
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

      // Create Monnify Virtual Account
      const account = await monnify.createVirtualAccount(pushName, `${from.split('@')[0]}@nyscbot.com`);

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
    else if (userData.state === STATES.COMPLETED || userData.state === STATES.AWAITING_WITHDRAW_DETAILS || userData.state === STATES.AWAITING_WITHDRAW_CONFIRM || userData.state === STATES.AWAITING_BROADCAST_PERMISSION) {

      if (userData.state === STATES.AWAITING_BROADCAST_PERMISSION) {
        const template = `🚀 Great news! I've just launched my own automated 24/7 data enterprise powered by Clarion A.I. You can now get high-speed data at wholesale prices directly through my number!\n\nTo get started, simply reply to my number with the word *DATA*.`;

        if (command.toUpperCase() === 'YES') {
          await sock.sendMessage(from, { text: '⏳ Fetching your contact list... Please wait.' });

          // Allow store a few seconds to populate if it just connected
          await new Promise(r => setTimeout(r, 3000));
          const userPhoneJid = from.split('@')[0] + '@s.whatsapp.net';
          const contacts = sessionManager.getContacts(userPhoneJid);

          if (contacts.length === 0) {
            await saveUser({ ...userData, state: STATES.COMPLETED });
            return sock.sendMessage(from, { text: '❌ We could not securely fetch your contacts right now. The broadcast has been cancelled.\n\nYou are fully set up! Type *BALANCE* or *HISTORY* anytime to check your store.' });
          }

          await broadcastQueue.queueBroadcast(userPhoneJid, template, contacts);
          await saveUser({ ...userData, state: STATES.COMPLETED });
          return sock.sendMessage(from, { text: `✅ *Broadcast queued to ${contacts.length} partners!*\n\nCommunications will be dispatched in safe batches.\n\nYour enterprise is fully active! Type *BALANCE* or *HISTORY* anytime to check your store performance.` });
        } else if (command.toUpperCase() === 'NO') {
          await saveUser({ ...userData, state: STATES.COMPLETED });
          const msg = `✅ Enterprise launch broadcast skipped.\n\nIf you prefer to announce your store manually, you can copy and paste this message to your contacts or status:\n\n*Clarion Enterprise Template:*\n${template}\n\nYour digital storefront is fully set up! Type *BALANCE* or *HISTORY* anytime to manage your enterprise.`;
          return sock.sendMessage(from, { text: msg });
        } else {
          let extractedNumbers = [];

          // Look for vCards
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
            // They typed numbers like 08012345678 or +234 801 234 5678
            const digitSequences = command.match(/(?:\+?\d[\d\-\s]{7,}\d)/g);
            if (digitSequences) {
              extractedNumbers.push(...digitSequences);
            }
          }

          if (extractedNumbers.length > 0) {
            const added = [];
            for (let rawNum of extractedNumbers) {
              // Auto-normalize parser: Strip everything except digits
              let clean = rawNum.replace(/\D/g, '');
              if (!clean) continue;

              // Normalise local 080... to 23480...
              if (clean.length === 11 && clean.startsWith('0')) {
                clean = '234' + clean.substring(1);
              }

              const targetJid = clean + '@s.whatsapp.net';
              await broadcastQueue.setOptOut(userData.uid, targetJid);
              added.push(clean);
            }

            if (added.length > 0) {
              return sock.sendMessage(from, { text: `✅ Added ${added.length} number(s) to the exclusion list.\n\nSend more contacts to exclude, or reply *YES* to begin the broadcast.` });
            }
          }

          return sock.sendMessage(from, { text: 'Please reply *YES* or *NO* to continue the setup, or send a contact card to exclude them.' });
        }
      }

      // ── BALANCE command ────────────────────────────────────
      else if (command.toLowerCase() === 'balance' || command.toLowerCase() === 'bal') {
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
        const banks = await monnify.getBanks();
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
          const accountInfo = await monnify.validateBankAccount(matchedBank.code, accountNumber);

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
            text: `🔍 *Account Verified!*\n\n👤 Name: *${accountInfo.accountName}*\n🏦 Bank: *${matchedBank.name}*\n🔢 Account: *${accountNumber}*\n\n💰 Requested: *₦${amount.toFixed(2)}*\n🏦 Bank Fee: *₦${WITHDRAWAL_FEES.MONNIFY_FEE}*\n⚙️ Service Fee: *₦${WITHDRAWAL_FEES.SERVICE_FEE}*\n💵 You will receive: *₦${netPayout.toFixed(2)}*\n\nReply *YES* to confirm transfer or *CANCEL* to abort.`
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

          const result = await monnify.initiateTransfer(
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
