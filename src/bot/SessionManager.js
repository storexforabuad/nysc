import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleMotherMessage } from './MotherBot.js';
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
          this._sendActivationSuccessMessages(phoneJid);
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
        try { await onQRReady(); } catch (e) { }
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

  async _sendActivationSuccessMessages(phoneJid) {
    if (!this.motherSock) return;
    const msg1 = `🥳 *ACTIVATION SUCCESSFUL!*\n\nYour Clarion Digital Store is now live and ready to generate revenue! 🚀\n\n*How to manage your store:*\nSimply text me these keywords anytime:\n\n💰 *BALANCE* - Check your earnings\n📜 *HISTORY* - View recent orders & payouts\n💸 *WITHDRAW [amount]* - Cash out your profits`;
    const broadcastTemplate = `🚀 Great news! I've just launched my own automated 24/7 data enterprise powered by Clarion A.I (An NYSC SAED Inspired Project). You can now get high-speed data at affordable prices directly through my number!\n\nIf you ever need data, simply reply to my number with:\n\n*DATA* - See all plans for your network\n*DATA [price]* - Find plans around your budget\n*DATA [price] [number]* - Send to a friend\n\nFeel free to ignore this if you're not interested right now! 😊`;
    const msg2 = `📢 *Launch your automated store!*\n\nWould you like Clarion A.I. to announce your new enterprise to specific WhatsApp contacts?\n\n*Here is a preview of what they will see:*\n---\n${broadcastTemplate}\n---\n\n*How to broadcast:*\nSimply share the contact cards or type the phone numbers here (e.g. 08012345678) of the people you want to send this to.\n\nWhen you are ready, reply *DONE* to send the broadcast to them, or *SKIP* if you prefer not to broadcast.`;

    try {
      await this.motherSock.sendMessage(phoneJid, { text: msg1 });
      await new Promise(r => setTimeout(r, 1500));
      await this.motherSock.sendMessage(phoneJid, { text: msg2 });
    } catch (err) { }
  }
}

export default new SessionManager();
