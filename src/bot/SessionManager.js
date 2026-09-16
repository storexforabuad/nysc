import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleMotherMessage } from './MotherBot.js';
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
        if (db.users) {
          db.users.doc(user.uid).set({
            state: 'AWAITING_BROADCAST_CONTACTS',
            phoneJid,
            phoneNumber,
            pairedAt: new Date().toISOString()
          }, { merge: true }).catch(e => logger.error(`DB Update failed:`, e.message));
        }
        if (this.motherSock) {
          this._sendActivationSuccessMessages(phoneJid, user);
        }
      }

      if (msg.type === 'open') {
        hasEverConnected = true;
        logger.info(`✅ Clarion Digital Store for ${user.uid} fully operational (Worker).`);
        this.pendingPairings.delete(user.uid);
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
      logger.error(`[WORKER ERROR] ${user.uid}:`, err);
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

  async _sendActivationSuccessMessages(phoneJid, user) {
    if (!this.motherSock) return;

    let fullUser = user;
    if (db.users && user?.uid) {
      try {
        const uDoc = await db.users.doc(user.uid).get();
        if (uDoc.exists) fullUser = { uid: user.uid, ...uDoc.data() };
      } catch (e) { }
    }

    const botNumber = (fullUser.phoneNumber || phoneJid.split('@')[0]);
    const partnerName = fullUser.verifiedName || fullUser.name || 'Partner';
    const botDigits = String(fullUser.phoneNumber || '').replace(/[^0-9]/g, '');
    const partnerDigits = String(phoneJid).replace(/[^0-9]/g, '');
    const isSameNumber = botDigits.length >= 10 && partnerDigits.length >= 10 && botDigits.slice(-10) === partnerDigits.slice(-10);
    const virtualAcct = fullUser.virtualAccount || { bankName: 'HabariPay (GTCO)', accountNumber: '0123456789' };

    // 1. Dispatch Clarion Franchise ID Card
    try {
      const cardBuffer = await mediaGen.generateProfileCard(fullUser);
      await this.motherSock.sendMessage(phoneJid, {
        image: cardBuffer,
        caption: `🪪 *OFFICIAL CLARION FRANCHISE LICENSE*\n\nCongratulations, *${partnerName}*! Your digital enterprise is officially licensed and active under the NYSC SAED Initiative.`
      });
    } catch (cardErr) {
      logger.error('Failed to generate activation profile card:', cardErr.message);
    }

    // 2. Operational Control Deck
    const controlDeckMsg = `🥳 *STOREFRONT FULLY OPERATIONAL!*\n\n` +
      `Your automated 24/7 data bot is live on *+${botNumber}*.\n\n` +
      `*Enterprise Commands (text me anytime):*\n` +
      `💰 *BALANCE* — View available wallet balance & earnings\n` +
      `🎖️ *RANK* — Check your partnership tier & CDS donation impact\n` +
      `💸 *WITHDRAW [amount]* — Cash out profits to your locked bank (₦90 fee)\n` +
      `🏦 *UPDATE BANK* — Change payout account (₦100 security fee)\n` +
      `📜 *HISTORY* — View recent transactions and payout logs\n` +
      `📢 *KIT* — Download your promotional status kit & share card\n` +
      `⛽ *PROMO* — View Launch Giveaway Poster & Promo Fuel details\n` +
      `🎁 *GIFT [phone] [plan]* — Gift promotional data to your friends\n` +
      `🪪 *CARD* — Re-download your Franchise License Card`;

    // 3. Safe Launch Copy-Paste Forwarding Kit (Context-Aware)
    const safeLaunchMsg = isSameNumber
      ? `🚀 *SAFE LAUNCH STATUS KIT*\n\n` +
        `*Copy and post the text below to your WhatsApp Status:*\n\n` +
        `────────────────────────\n` +
        `Big news! 🚀 I just launched my automated 24/7 Data Store powered by Clarion A.I (NYSC SAED Project).\n\n` +
        `Get MTN, Airtel, Glo & 9mobile data delivered instantly in 20 seconds!\n\n` +
        `👉 *To order right now, just reply to ME with:*\n` +
        `*DATA*\n\n` +
        `_My automated bot replies and vends your data immediately! Every purchase helps fund NYSC community projects._ 🇳🇬\n` +
        `────────────────────────`
      : `🚀 *SAFE LAUNCH STATUS KIT*\n\n` +
        `*Copy and forward the text below to your WhatsApp Status & contacts:*\n\n` +
        `────────────────────────\n` +
        `Big news! 🚀 I just launched my automated 24/7 Data Store powered by Clarion A.I (NYSC SAED Project).\n\n` +
        `Get MTN, Airtel, Glo & 9mobile data delivered instantly in 20 seconds!\n\n` +
        `👉 *Click here to order from my store bot instantly:*\n` +
        `https://wa.me/234${botDigits.slice(-10)}?text=Data%20500\n\n` +
        `Or text *DATA* to 0${botDigits.slice(-10)}!\n\n` +
        `_Every purchase helps fund NYSC community development projects._ 🇳🇬\n` +
        `────────────────────────`;

    // 4. Optional Promo Fuel Invitation
    const promoFuelPitch = `⛽ *OPTIONAL: KICKSTART ENGAGEMENT WITH PROMO FUEL*\n\n` +
      `💡 *Pro-Partner Secret:*\n` +
      `Clarion requires *₦0 startup capital*. But vendors who add *₦500 – ₦1,000* to their wallet on Day 1 to gift free 500MB to 3 close friends or host a launch giveaway see *4x more sales*!\n\n` +
      `🏦 *Bank:* ${virtualAcct.bankName}\n` +
      `🔢 *Account:* ${virtualAcct.accountNumber}\n` +
      `👤 *Name:* ${virtualAcct.accountName || partnerName}\n\n` +
      `_Transfer anytime to load Promo Fuel, then text *PROMO* to get your exclusive Giveaway Poster!_ 🎨`;

    try {
      await new Promise(r => setTimeout(r, 1200));
      await this.motherSock.sendMessage(phoneJid, { text: controlDeckMsg });
      await new Promise(r => setTimeout(r, 1500));
      await this.motherSock.sendMessage(phoneJid, { text: safeLaunchMsg });
      await new Promise(r => setTimeout(r, 1500));
      await this.motherSock.sendMessage(phoneJid, { text: promoFuelPitch });
    } catch (err) { }
  }
}

export default new SessionManager();
