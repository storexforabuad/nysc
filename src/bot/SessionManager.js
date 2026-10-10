import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleMotherMessage, CENTRAL_HUB_ACCOUNT } from './MotherBot.js';
import mediaGen from '../services/mediaGen.js';
import path from 'path';
import fs from 'fs';
import { Worker } from 'worker_threads';

class SessionManager {
  constructor() {
    this.sessions = new Map(); // now holds worker instances
    this.pendingPairings = new Map();
    this.sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir);
  }

  async initMotherBot() {
    try {
      logger.info('Initializing Clarion Hub...');
      const authPath = path.join(this.sessionsDir, 'mother_bot');

      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      let version;
      try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
      } catch (vError) {
        version = [6, 33, 0];
      }

      const socketFunction = makeWASocket.default || makeWASocket;

      const sock = socketFunction({
        version,
        printQRInTerminal: true,
        auth: state,
        logger: pino({ level: 'silent' })
      });

      // ── Outbound Response Deduplication Cache ──
      const originalSendMessage = sock.sendMessage.bind(sock);
      const outboundDebounce = new Map();
      sock.sendMessage = async (jid, content, options) => {
        if (content && content.text) {
          const hash = `${jid}_${Buffer.from(content.text.substring(0, 35)).toString('base64')}`;
          const lastSent = outboundDebounce.get(hash) || 0;
          if (Date.now() - lastSent < 6000) {
            logger.info(`[DEDUPE] Dropped duplicate outgoing msg to ${jid}`);
            return {};
          }
          outboundDebounce.set(hash, Date.now());
        }
        return originalSendMessage(jid, content, options);
      };

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          logger.info('========================================');
          logger.info('SCAN THIS QR CODE WITH WHATSAPP:');
          qrcode.generate(qr, { small: true });
          logger.info('========================================');
        }
        if (connection === 'close') {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          if (shouldReconnect) {
            logger.info('Mother Bot disconnected. Reconnecting...');
            this.initMotherBot();
          } else {
            logger.info('Mother Bot logged out.');
          }
        } else if (connection === 'open') {
          logger.info('✅ Clarion Hub connected successfully!');
          this.motherSock = sock;
          this.baileysVersion = version;
          this.initProxyBots();
        }
      });

      sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;
          await handleMotherMessage(sock, msg);
        }
      });

      return sock;
    } catch (err) {
      logger.error({ err }, 'Error in initMotherBot');
      throw err;
    }
  }

  async initProxyBots() {
    logger.info('Initializing Clarion Digital Stores...');
    try {
      if (!db.users) return;
      const usersSnapshot = await db.users.where('state', 'in', ['COMPLETED', 'PAIRED']).get();
      for (const doc of usersSnapshot.docs) {
        const userData = { uid: doc.id, ...doc.data() };
        this.startProxyBot(userData);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Could not initialize Proxy Bots');
    }
  }

  _handleWorkerIPC(worker, user, sessionKey) {
    const phoneNumber = user.uid.split('@')[0];
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;
    let hasEverConnected = false;

    worker.on('message', async (msg) => {
      if (msg.type === 'new_login') {
        logger.info(`✅ Activation payload accepted for ${user.uid}!`);
        const ownerJid = user.ownerJid || user.motherJid || phoneJid;
        const activationData = {
          state: 'COMPLETED',
          botMode: 'manual',
          phoneJid,
          phoneNumber,
          pairedAt: new Date().toISOString()
        };

        if (db.users) {
          db.users.doc(user.uid).set(activationData, { merge: true }).catch(e => logger.error(`DB Update failed:`, e.message));
          if (ownerJid && ownerJid !== user.uid) {
            db.users.doc(ownerJid).set(activationData, { merge: true }).catch(e => logger.error(`DB Update owner failed:`, e.message));
          }
        }
        if (this.motherSock) {
          this._sendActivationSuccessMessages(ownerJid, user);
        }
      }

      if (msg.type === 'open') {
        hasEverConnected = true;
        logger.info(`✅ Clarion Digital Store for ${user.uid} fully operational (Worker).`);
        this.pendingPairings.delete(user.uid);

        const ownerJid = user.ownerJid || user.motherJid || phoneJid;
        const activationData = {
          state: 'COMPLETED',
          botMode: 'manual',
          phoneJid,
          phoneNumber,
          pairedAt: new Date().toISOString()
        };

        if (db.users) {
          db.users.doc(user.uid).set(activationData, { merge: true }).catch(e => logger.error(`DB Update failed:`, e.message));
          if (ownerJid && ownerJid !== user.uid) {
            db.users.doc(ownerJid).set(activationData, { merge: true }).catch(e => logger.error(`DB Update owner failed:`, e.message));
          }
        }
      }

      if (msg.type === 'close') {
        const { shouldReconnect, statusCode } = msg;

        if (!shouldReconnect) {
          logger.info(`[CLARION] Enterprise session permanently closed for ${user.uid}.`);
          this.sessions.delete(sessionKey);
          this.pendingPairings.delete(user.uid);

          const authPath = path.join(this.sessionsDir, `proxy_${sessionKey}`);
          try {
            if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
          } catch (e) { }

          if (hasEverConnected) {
            const lastAlertKey = `last_alert_${user.uid}`;
            const lastAlertTime = this.sessions.get(lastAlertKey) || 0;
            const now = Date.now();
            if (now - lastAlertTime > 30 * 60 * 1000) {
              this.sessions.set(lastAlertKey, now);
              if (this.motherSock) {
                const alertMsg = `⚠️ *Action Required: Your Digital Storefront is offline.*\n\nYour customers currently cannot place orders. Please reply *PAIR [your_phone_number]* to reactivate your Clarion Store — a fresh activation code will be prepared for you.`;
                try {
                  await this.motherSock.sendMessage(phoneJid, { text: alertMsg });
                } catch (e) { }
              }
            }
          }
        }
      }
    });

    worker.on('error', (err) => {
      logger.error(err, `[WORKER ERROR] ${user.uid}`);
    });

    worker.on('exit', (code) => {
      if (code !== 0) logger.error(`[WORKER EXIT] ${user.uid} exited with code ${code}`);
      this.sessions.delete(sessionKey);
    });
  }

  startProxyBot(user) {
    const sessionKey = user.phoneJid || user.uid;
    if (this.sessions.has(sessionKey)) return;

    logger.info(`Starting Worker for Clarion Store: ${user.name || user.uid}`);

    const workerPath = path.join(process.cwd(), 'src', 'bot', 'ProxyWorker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        user,
        baileysVersion: this.baileysVersion,
        sessionsDir: this.sessionsDir,
        pairingMode: false,
        isPairingCode: false
      }
    });

    this._handleWorkerIPC(worker, user, sessionKey);
    this.sessions.set(sessionKey, worker);
    return worker;
  }

  async startQRPairingForUser(user, onQRReady) {
    logger.info(`[HUB-ACTIVATE] Starting QR worker activation for ${user.uid}`);

    const sessionKey = user.phoneJid || user.uid;
    const existing = this.pendingPairings.get(user.uid) || this.sessions.get(sessionKey);
    if (existing) {
      try { existing.terminate(); } catch (e) { }
      this.pendingPairings.delete(user.uid);
      this.sessions.delete(sessionKey);
    }

    const workerPath = path.join(process.cwd(), 'src', 'bot', 'ProxyWorker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        user,
        baileysVersion: this.baileysVersion,
        sessionsDir: this.sessionsDir,
        pairingMode: true,
        isPairingCode: false
      }
    });

    let qrFired = false;
    worker.on('message', async (msg) => {
      if (msg.type === 'qr' && !qrFired) {
        qrFired = true;
        logger.info('========================================');
        logger.info(`[CLARION-ACTIVATE] ACTIVATION CODE FOR: ${user.uid.split('@')[0]}`);
        qrcode.generate(msg.qr, { small: true });
        logger.info('========================================');
        try { await onQRReady(msg.qr); } catch (e) { }
      }
    });

    this._handleWorkerIPC(worker, user, sessionKey);
    this.pendingPairings.set(user.uid, worker);
    this.sessions.set(sessionKey, worker);
    return 'QR_SHOWN';
  }

  async requestPairingCodeForUser(user) {
    logger.info(`Requesting pairing code (via Worker) for ${user.uid}`);

    const sessionKey = user.phoneJid || user.uid;
    const existing = this.pendingPairings.get(user.uid) || this.sessions.get(sessionKey);
    if (existing) {
      try { existing.terminate(); } catch (e) { }
      this.pendingPairings.delete(user.uid);
      this.sessions.delete(sessionKey);
    }

    const workerPath = path.join(process.cwd(), 'src', 'bot', 'ProxyWorker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        user,
        baileysVersion: this.baileysVersion,
        sessionsDir: this.sessionsDir,
        pairingMode: true,
        isPairingCode: true
      }
    });

    this._handleWorkerIPC(worker, user, sessionKey);
    this.pendingPairings.set(user.uid, worker);
    this.sessions.set(sessionKey, worker);

    return new Promise((resolve, reject) => {
      worker.on('message', (msg) => {
        if (msg.type === 'pairing_code') resolve(msg.code);
        if (msg.type === 'error') reject(new Error(msg.message));
      });
      setTimeout(() => reject(new Error("Timeout waiting for pairing code from worker")), 30000);
    });
  }

  getContacts(userId) {
    return [];
  }

import { getFreeGrantDays } from '../services/WalletService.js';

function resolvePartnerInfo(fullUser, phoneJid) {
  let rawPhone = fullUser.phoneNumber || fullUser.phone || '';
  if (!rawPhone || rawPhone.includes('lid')) {
    if (fullUser.uid && !fullUser.uid.includes('lid')) rawPhone = fullUser.uid.split('@')[0];
    else if (phoneJid && !phoneJid.includes('lid')) rawPhone = phoneJid.split('@')[0];
  }
  let cleanPhoneDigits = String(rawPhone).replace(/[^0-9]/g, '');
  if (cleanPhoneDigits.startsWith('234') && cleanPhoneDigits.length === 13) {
    cleanPhoneDigits = '0' + cleanPhoneDigits.slice(3);
  } else if (cleanPhoneDigits.length === 10) {
    cleanPhoneDigits = '0' + cleanPhoneDigits;
  }
  const formattedStoreNumber = cleanPhoneDigits ? (cleanPhoneDigits.startsWith('0') ? cleanPhoneDigits : `+${cleanPhoneDigits}`) : (fullUser.stateCode || 'Your Store Line');
  const botTenDigits = cleanPhoneDigits.length >= 10 ? cleanPhoneDigits.slice(-10) : '';
  const partnerName = fullUser.verifiedName || fullUser.name || 'Partner';
  const partnerDigits = String(phoneJid || '').replace(/[^0-9]/g, '');
  const isSameNumber = botTenDigits.length >= 10 && partnerDigits.length >= 10 && botTenDigits === partnerDigits.slice(-10);
  const virtualAcct = fullUser.virtualAccount || CENTRAL_HUB_ACCOUNT;
  const storeName = fullUser.brandName || ('Clarion AI - ' + partnerName);

  return {
    formattedStoreNumber,
    botTenDigits,
    partnerName,
    isSameNumber,
    virtualAcct,
    storeName
  };
}

export async function handleOnboardingWizardInput(sock, from, user, rawText) {
  if (!sock || !user) return false;

  let fullUser = user;
  if (db.users && user?.uid) {
    try {
      const uDoc = await db.users.doc(user.uid).get();
      if (uDoc.exists) fullUser = { uid: user.uid, ...uDoc.data() };
    } catch (e) { }
  }

  if (fullUser.onboardingStep === null || fullUser.onboardingStep === undefined) {
    return false;
  }

  const step = Number(fullUser.onboardingStep);
  const text = String(rawText || '').trim().toLowerCase();
  const info = resolvePartnerInfo(fullUser, from);
  const isAutonomous = fullUser.botMode === 'autonomous';

  // STEP 0: Expects READY
  if (step === 0) {
    if (['ready', 'next', 'start', 'go', '1', 'ok', 'yes'].includes(text)) {
      try {
        const cardBuffer = await mediaGen.generateProfileCard(fullUser);
        await sock.sendMessage(from, {
          image: cardBuffer,
          caption: `🪪 *STEP 1 OF 4 — YOUR OFFICIAL FRANCHISE CERTIFICATE*\n\n` +
            `This is your proof of ownership as a licensed Clarion Digital Storefront operator under the NYSC SAED Initiative.\n\n` +
            `*Save this image* — you'll need it to verify your status in the Clarion Partner network.\n\n` +
            `──────────────\n` +
            `Reply *NEXT* to view your live storefront details 🏪`
        });
      } catch (cardErr) {
        logger.error('Failed to generate activation profile card:', cardErr.message);
        await sock.sendMessage(from, {
          text: `🪪 *STEP 1 OF 4 — YOUR OFFICIAL FRANCHISE CERTIFICATE*\n\n` +
            `Congratulations, *${info.partnerName}*! Your digital enterprise is officially licensed and active under the NYSC SAED Initiative.\n\n` +
            `──────────────\n` +
            `Reply *NEXT* to view your live storefront details 🏪`
        });
      }
      await db.users.doc(fullUser.uid).set({ onboardingStep: 1 }, { merge: true });
      return true;
    }

    if (text === 'skip') {
      await finishWizard(sock, from, fullUser, info, isAutonomous, false);
      return true;
    }

    await sock.sendMessage(from, {
      text: `👆 Reply *READY* when you're ready to receive your official Franchise Certificate, or *SKIP* to finish setup.`
    });
    return true;
  }

  // STEP 1: Expects NEXT
  if (step === 1) {
    if (['next', 'continue', '2', 'ok', 'yes'].includes(text)) {
      const modeLine = isAutonomous
        ? `🤖 *Mode:* Autonomous (AI handles customer chats & orders 24/7 automatically)`
        : `📱 *Mode:* Manual (You process orders with quick text commands)`;

      const controlDeckMsg = `🏪 *STEP 2 OF 4 — YOUR STOREFRONT IS LIVE*\n\n` +
        `Your Clarion Digital Store is active on:\n` +
        `📲 *${info.formattedStoreNumber}*\n\n` +
        `${modeLine}\n\n` +
        `──────────────\n` +
        `*How to process a sale:*\n\n` +
        `1️⃣ Customer asks for data? Text me:\n` +
        `   👉 *CHECK 0801 1GB*\n` +
        `   _(Network auto-detected! Shows retail prices)_\n\n` +
        `2️⃣ Customer picks a plan? Text me:\n` +
        `   👉 *ORDER 1GB 08012345678*\n` +
        `   _(Creates order & gives payment invoice to forward)_\n\n` +
        `3️⃣ Customer transfers payment → Data delivers AUTOMATICALLY! ⚡\n` +
        `   You receive a confirmation & customer receipt. Done! 💰\n\n` +
        `──────────────\n` +
        `*Store Commands (text me anytime):*\n` +
        `📋 *ORDERS* · 💰 *BALANCE* · 💸 *WITHDRAW [amt]* · 🤖 *MODE*\n\n` +
        `──────────────\n` +
        `Reply *NEXT* to get your WhatsApp Status Launch Kit 📣`;

      await sock.sendMessage(from, { text: controlDeckMsg });
      await db.users.doc(fullUser.uid).set({ onboardingStep: 2 }, { merge: true });
      return true;
    }

    if (text === 'skip') {
      await finishWizard(sock, from, fullUser, info, isAutonomous, false);
      return true;
    }

    await sock.sendMessage(from, {
      text: `👆 Reply *NEXT* to view your live storefront details, or *SKIP* to finish setup.`
    });
    return true;
  }

  // STEP 2: Expects NEXT or SKIP
  if (step === 2) {
    if (['next', 'continue', '3', 'ok', 'yes'].includes(text)) {
      const statusKitHeader = `📣 *STEP 3 OF 4 — YOUR LAUNCH STATUS TEMPLATE*\n\n` +
        `Tap & hold the *next message* below to copy it, then post it directly to your WhatsApp Status without editing! 👇`;

      const statusKitCopy = info.isSameNumber
        ? `Big news! 🚀 My line is now powered by *${info.storeName}*!\n\n` +
          `Get instant, affordable MTN, Airtel, Glo & 9mobile data delivered automatically. ⚡\n\n` +
          `👉 Just reply *DATA* or *DATA 500* to this chat to see the best plans for your budget!\n\n` +
          `💚 _A percentage of every purchase supports NYSC Community Development projects._ 🇳🇬`
        : `Big news! 🚀 I just launched *${info.storeName}*!\n\n` +
          `Get instant, affordable MTN, Airtel, Glo & 9mobile data delivered automatically. ⚡\n\n` +
          `👉 Message my store line to order:\n` +
          `https://wa.me/234${info.botTenDigits}\n\n` +
          `Or text ${info.formattedStoreNumber}!\n\n` +
          `💚 _A percentage of every purchase supports NYSC Community Development projects._ 🇳🇬`;

      const statusKitGate = `──────────────\n` +
        `Reply *NEXT* to configure your Launch Promo Giveaway 🎁\n` +
        `Or reply *SKIP* to go straight to your final checklist.`;

      await sock.sendMessage(from, { text: statusKitHeader });
      await new Promise(r => setTimeout(r, 1000));
      await sock.sendMessage(from, { text: statusKitCopy });
      await new Promise(r => setTimeout(r, 1200));
      await sock.sendMessage(from, { text: statusKitGate });

      await db.users.doc(fullUser.uid).set({ onboardingStep: 3 }, { merge: true });
      return true;
    }

    if (text === 'skip') {
      await finishWizard(sock, from, fullUser, info, isAutonomous, false);
      return true;
    }

    await sock.sendMessage(from, {
      text: `👆 Reply *NEXT* to configure your Launch Promo Giveaway, or *SKIP* to jump to the final checklist.`
    });
    return true;
  }

  // STEP 3: Expects NEXT or SKIP
  if (step === 3) {
    if (['next', 'continue', '4', 'fuel', 'promo'].includes(text)) {
      const promoFuelPitch = `🎁 *STEP 4 OF 4 — LAUNCH GIVEAWAY ENGINE*\n` +
        `_Turn your contacts into paying data customers._\n` +
        `──────────────\n\n` +
        `👋 *${info.partnerName}*, vendors who gift free data on Day 1 see *4x higher repeat orders*!\n\n` +
        `💡 *TRY ON CREDIT (₦0 UPFRONT)*:\n` +
        `We’ve unlocked a *Kickstart Micro-Credit* for your store! You can gift *500MB to 3 friends* on credit today (value: ₦420).\n\n` +
        `When your friends order data, customer sales auto-clear the ₦420 balance!\n\n` +
        `──────────────\n` +
        `👉 Reply *PROMO 500 3* to launch your 3-person giveaway on credit right now!\n\n` +
        `*Or Fund a Custom Giveaway Budget:*\n` +
        `🏦 *Bank:* ${info.virtualAcct.bankName}\n` +
        `🔢 *Account:* \`${info.virtualAcct.accountNumber}\`\n` +
        `👤 *Name:* ${info.virtualAcct.accountName || info.partnerName}\n\n` +
        `──────────────\n` +
        `👉 Reply *FUNDED* once transferred to set up a larger promo.\n` +
        `👉 Reply *SKIP* to finish setup (you can launch promos anytime).`;

      await sock.sendMessage(from, { text: promoFuelPitch });
      await db.users.doc(fullUser.uid).set({ onboardingStep: 4 }, { merge: true });
      return true;
    }

    if (text === 'skip') {
      await sock.sendMessage(from, {
        text: `👌 *No problem at all!*\n──────────────\n\nYour franchise is 100% operational with ₦0 capital. You can top up and launch customer promos anytime by replying *PROMO*.`
      });
      await new Promise(r => setTimeout(r, 1000));
      await finishWizard(sock, from, fullUser, info, isAutonomous, false);
      return true;
    }

    await sock.sendMessage(from, {
      text: `👆 Reply *NEXT* to configure your Launch Promo Giveaway, or *SKIP* to finish setup.`
    });
    return true;
  }

  // STEP 4: Expects FUNDED or SKIP
  if (step === 4) {
    const isFunded = ['funded', 'done', 'paid', 'sent', 'transferred'].includes(text);
    if (isFunded) {
      await sock.sendMessage(from, {
        text: `⚡ *PROMO ENGINE UNLOCKED!*\n──────────────\n\n` +
          `Your store account is linked.\n\n` +
          `*To launch your first giveaway campaign:*\n` +
          `👉 Reply *PROMO* to choose data size (e.g. 500MB) & recipient count.\n` +
          `👉 Or simply share any contact card or phone number to this chat, and your ProxyBot will gift them instantly! 🎁`
      });
    } else {
      await sock.sendMessage(from, {
        text: `👌 *No problem at all!*\n──────────────\n\n` +
          `Your franchise is 100% operational with ₦0 capital. You can top up and launch customer promos anytime by replying *PROMO*.`
      });
    }

    await new Promise(r => setTimeout(r, 1000));
    await finishWizard(sock, from, fullUser, info, isAutonomous, isFunded);
    return true;
  }

  return false;
}

async function finishWizard(sock, from, fullUser, info, isAutonomous, isFunded) {
  const sub = fullUser.subscription;
  const daysLeft = sub?.expiresAt ? Math.max(0, Math.ceil((new Date(sub.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))) : 0;

  const autoLine = isAutonomous
    ? `🤖 *Autonomous AI Mode is Active!*\nYour complimentary free automation is running (${daysLeft} days remaining).\nWhen it expires, text *UPGRADE* to extend for *₦950/month*.`
    : `💡 *Want 24/7 full automation?*\nText *UPGRADE* to activate autonomous mode for *₦950/month*!`;

  const finalChecklist = `✅ *YOU'RE FULLY OPERATIONAL, ${info.partnerName}!*\n──────────────\n\n` +
    `Your digital telecom franchise is officially active:\n\n` +
    `· 📋 *ORDERS* — Live order feed & delivery status\n` +
    `· 💰 *BALANCE* — Real-time earnings & wallet balance\n` +
    `· 🎁 *PROMO* — Launch & manage customer giveaways\n` +
    `· 🤖 *MODE* — Autopilot controls & renew status\n` +
    `· 📢 *KIT* — Launch graphics & status templates\n` +
    `· 💬 *ANNOUNCE* — Toggle first-contact welcome banner\n` +
    `· 💸 *WITHDRAW [amount]* — Payout to your verified bank\n` +
    `· ❓ *HELP* — Command directory\n\n` +
    `──────────────\n` +
    `${autoLine}\n\n` +
    `──────────────\n` +
    `_The Clarion team is with you. Build something great! 🚀🇳🇬_`;

  await sock.sendMessage(from, { text: finalChecklist });
  await db.users.doc(fullUser.uid).set({
    onboardingStep: null,
    onboardingComplete: true
  }, { merge: true });
}

  async _sendActivationSuccessMessages(phoneJid, user) {
    if (!this.motherSock) return;

    let fullUser = user;
    if (db.users && user?.uid) {
      try {
        const uDoc = await db.users.doc(user.uid).get();
        if (uDoc.exists) fullUser = { uid: user.uid, ...uDoc.data() };
      } catch (e) { }
    }

    const info = resolvePartnerInfo(fullUser, phoneJid);

    // 1. Approval Gate: Unapproved terminals receive review notice
    if (!fullUser.terminalApproved) {
      const pendingNotice = `⏳ *TERMINAL APPLICATION UNDER REVIEW*\n\n` +
        `🏢 *Franchise Brand:* ${fullUser.brandName || fullUser.franchiseName || 'Clarion AI Store'}\n` +
        `👤 *Operator:* ${info.partnerName} (\`${fullUser.stateCode || 'NYSC'}\`)\n` +
        `🔖 *Terminal Status:* PENDING ADMINISTRATIVE APPROVAL\n\n` +
        `*What happens next?*\n` +
        `To ensure telecom reliability and security, our administrative board reviews and approves terminal licenses within 24 hours.\n\n` +
        `Once approved by admin:\n` +
        `1. You will receive an official notification right here on WhatsApp.\n` +
        `2. Your official Clarion Franchise License Card will be dispatched.\n` +
        `3. Your proxy bot will activate automated vending!\n\n` +
        `💡 _Note: While awaiting approval, any manual data purchases on MotherBot route through the Clarion Central Hub Account._`;

      await this.motherSock.sendMessage(phoneJid, { text: pendingNotice });
      return;
    }

    // 2. Approved! Apply donation tier free grant and prepare Stage 0 Onboarding Briefing
    const tier = fullUser.partnershipTier || fullUser.donationTier;
    const grantDays = getFreeGrantDays(tier);
    const now = new Date();
    const updates = {
      onboardingStep: 0,
      announceNewContacts: true
    };

    if (grantDays > 0) {
      const expiresAt = new Date(now.getTime() + grantDays * 24 * 60 * 60 * 1000);
      updates.botMode = 'autonomous';
      updates.subscription = {
        plan: 'FREE_GRANT',
        price: 0,
        durationDays: grantDays,
        startedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        autoRenew: false
      };
      fullUser.botMode = 'autonomous';
      fullUser.subscription = updates.subscription;
    } else {
      updates.botMode = 'manual';
      fullUser.botMode = 'manual';
    }

    if (db.users && (user?.uid || fullUser?.uid)) {
      try {
        await db.users.doc(user?.uid || fullUser.uid).set(updates, { merge: true });
      } catch (e) {
        logger.error('Failed to set onboarding step in DB:', e.message);
      }
    }

    // 3. Stage 0 — Tier-Aware Welcome Briefing
    let tierHeader = '';
    const tierUpper = String(tier || '').toUpperCase();
    if (tierUpper === 'LORD') {
      tierHeader = `🔱 *CLARION LORD — PIONEER BENEFIT ACTIVATED*\n\n` +
        `As an 80% CDS contributor, you've been granted *2 months of free Autonomous AI Mode* (60 days). ⚡\n\n` +
        `Your store runs 24/7 — completely automated — with no subscription fees required.`;
    } else if (['MASTER', 'PIONEER', 'MEMBER'].includes(tierUpper)) {
      tierHeader = `⭐ *PARTNER BENEFIT ACTIVATED*\n\n` +
        `As a Clarion Partner (${tierUpper}), you've been granted *2 weeks of free Autonomous AI Mode* (14 days). ⚡\n\n` +
        `Your store will answer customer messages and deliver orders automatically.`;
    } else {
      tierHeader = `🎊 *Welcome to the Clarion Network, ${info.partnerName}!*\n\n` +
        `Your digital franchise has been officially licensed. 🪪\n\n` +
        `Before your store goes live to the world, we'll walk you through everything — one step at a time.`;
    }

    const stage0Msg = `${tierHeader}\n\n` +
      `──────────────\n` +
      `📋 *Your 4-Step Onboarding Kit:*\n` +
      `1️⃣  Official Franchise Certificate\n` +
      `2️⃣  Storefront Control Deck\n` +
      `3️⃣  Safe Launch Status Template\n` +
      `4️⃣  Launch Giveaway Engine\n\n` +
      `──────────────\n` +
      `Reply *READY* to receive your official Franchise Certificate 👇`;

    try {
      await this.motherSock.sendMessage(phoneJid, { text: stage0Msg });
    } catch (err) {
      logger.error('Failed to send Stage 0 activation briefing:', err.message);
    }
  }

  async sendProxyCustomerMessage(userOrUid, targetJid, messageText) {
    const uid = typeof userOrUid === 'string' ? userOrUid : (userOrUid?.uid || userOrUid?.phoneJid);
    const sessionKey = (typeof userOrUid === 'object' && userOrUid?.phoneJid) ? userOrUid.phoneJid : uid;
    const worker = this.sessions.get(sessionKey) || this.sessions.get(uid);

    if (worker && typeof worker.postMessage === 'function') {
      try {
        worker.postMessage({ type: 'notify_customer', targetJid, message: messageText });
        return true;
      } catch (e) {
        logger.warn(`Failed to dispatch message via worker IPC for ${uid}: ${e.message}`);
      }
    }

    if (this.motherSock) {
      try {
        await this.motherSock.sendMessage(targetJid, { text: messageText });
        return true;
      } catch (err) {
        logger.error(`Fallback message failed to ${targetJid}: ${err.message}`);
      }
    }
    return false;
  }
}

export default new SessionManager();

