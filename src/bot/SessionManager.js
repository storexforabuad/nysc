import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleMotherMessage } from './MotherBot.js';
import { handleProxyMessage } from './ProxyBot.js';
import path from 'path';
import fs from 'fs';

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.pendingPairings = new Map();
    this.contactStores = new Map();
    this.sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir);
  }

  async initMotherBot() {
    try {
      logger.info('Initializing Mother Bot...');
      const authPath = path.join(this.sessionsDir, 'mother_bot');

      logger.info(`Using auth path: ${authPath}`);
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      logger.info('Fetching latest Baileys version...');
      let version;
      try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
        logger.info(`Using Baileys version: ${version.join('.')}`);
      } catch (vError) {
        logger.warn('Failed to fetch latest version, using fallback');
        version = [6, 33, 0]; // Fallback version
      }

      logger.info('Creating WhatsApp socket...');
      // Handle both ESM and CJS default export patterns
      const socketFunction = makeWASocket.default || makeWASocket;

      const sock = socketFunction({
        version,
        printQRInTerminal: true,
        auth: state,
        logger: pino({ level: 'silent' })
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          logger.info('========================================');
          logger.info('SCAN THIS QR CODE WITH WHATSAPP:');
          qrcode.generate(qr, { small: true });
          logger.info('Open WhatsApp > Settings > Linked Devices > Link a Device');
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
          logger.info('✅ Mother Bot connected successfully!');
          this.motherSock = sock;
          this.baileysVersion = version; // Store for use by proxy bots
          this.initProxyBots(); // Initialize proxy bots only after we have the version
        }
      });

      sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        logger.info(`Received ${m.messages.length} messages`);
        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;
          const content = msg.message?.ephemeralMessage?.message ||
            msg.message?.viewOnceMessage?.message ||
            msg.message?.viewOnceMessageV2?.message ||
            msg.message?.editedMessage?.message ||
            msg.message;
          const logText = content?.conversation ||
            content?.extendedTextMessage?.text ||
            content?.text ||
            content?.listResponseMessage?.title ||
            content?.buttonsResponseMessage?.selectedDisplayText ||
            'media/other';
          logger.info(`Processing message from ${msg.key.remoteJid}: "${logText}"`);
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
    logger.info('Initializing existing Proxy Bots...');
    try {
      if (!db.users) {
        logger.warn('Firestore not available, skipping Proxy Bot initialization.');
        return;
      }
      const usersSnapshot = await db.users.where('state', 'in', ['COMPLETED', 'PAIRED']).get();
      logger.info(`Found ${usersSnapshot.size} potential Proxy Bots to initialize.`);

      for (const doc of usersSnapshot.docs) {
        const userData = { uid: doc.id, ...doc.data() };
        await this.startProxyBot(userData);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Could not initialize Proxy Bots');
    }
  }

  async startProxyBot(user) {
    const sessionKey = user.phoneJid || user.uid;
    // Prevent booting multiple sockets for the same proxy folder
    if (this.sessions.has(sessionKey)) return;

    logger.info(`Starting Proxy Bot for ${user.name || 'Unknown'} (${user.uid || 'Unknown'})`);
    const authPath = path.join(this.sessionsDir, `proxy_${sessionKey}`);
    logger.info(`[PROXY] Loading session from: proxy_${sessionKey}`);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const socketFunction = makeWASocket.default || makeWASocket;
    const sock = socketFunction({
      version: this.baileysVersion || [6, 33, 0],
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false
    });

    if (!this.contactStores.has(sessionKey)) {
      this.contactStores.set(sessionKey, new Set());
    }
    const myContacts = this.contactStores.get(sessionKey);

    // Tracks whether this socket has ever reached "open" state.
    // Used to prevent false "offline" alerts during the normal Baileys pairing handoff.
    let hasEverConnected = false;

    sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
          myContacts.add(contact.id);
        }
      }
    });

    sock.ev.on('messaging-history.set', ({ chats, contacts }) => {
      if (contacts) {
        for (const contact of contacts) {
          if (contact.id && contact.id.endsWith('@s.whatsapp.net')) {
            myContacts.add(contact.id);
          }
        }
      }
      if (chats) {
        for (const chat of chats) {
          if (chat.id && chat.id.endsWith('@s.whatsapp.net')) {
            myContacts.add(chat.id);
          }
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, isNewLogin } = update;

      if (isNewLogin) {
        logger.info(`✅ Pairing payload accepted for ${user.uid} in Proxy Loop! Socket will restart.`);
        if (db.users) {
          const phoneNumber = user.phoneJid ? user.phoneJid.split('@')[0] : user.uid.split('@')[0];
          const phoneJid = user.phoneJid || `${phoneNumber}@s.whatsapp.net`;
          db.users.doc(user.uid).set({
            state: 'AWAITING_BROADCAST_PERMISSION',
            phoneJid,
            phoneNumber,
            pairedAt: new Date().toISOString()
          }, { merge: true }).catch(e => logger.error(`DB Update failed:`, e.message));

          if (this.motherSock) {
            const prompt = `✅ *LINK SUCCESSFUL!*\n\nYour Proxy Bot is now active and ready to sell data! 🚀\n\n*Final Configuration:*\nWould you like your Proxy Bot to safely announce your new automated store to your WhatsApp contacts?\n\nOur system will send the messages in slow, safe batches so your account is protected.\n\nReply *YES* to begin the safe rollout or *NO* to skip.`;
            this.motherSock.sendMessage(phoneJid, { text: prompt }).catch(() => { });
          }
        }
      }

      if (connection === 'open') {
        hasEverConnected = true;
        logger.info(`✅ Proxy Bot for ${user.uid} is fully connected.`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          this.startProxyBot(user);
        } else {
          logger.info(`[PROXY] Session permanently closed for ${user.uid}. Cleaning up.`);
          this.sessions.delete(sessionKey);

          // Only alert + wipe if this session had actually been alive before.
          // This prevents false "offline" alerts during the normal Baileys pairing handoff,
          // where the socket briefly closes before the companion link is established.
          if (hasEverConnected) {
            const lastAlertKey = `last_alert_${user.uid}`;
            const lastAlertTime = this.sessions.get(lastAlertKey) || 0;
            const now = Date.now();
            if (now - lastAlertTime > 30 * 60 * 1000) {
              this.sessions.set(lastAlertKey, now);

              if (this.motherSock) {
                const msg = `⚠️ *Critical Alert: Your Data Store is offline.*\n\nYour customers currently cannot place orders. Please reply *PAIR [your_phone_number]* to reconnect — a fresh QR code will appear for you to scan. (e.g., *PAIR 08012345678*)`;
                const phoneJid = user.phoneJid || user.uid;
                try {
                  await this.motherSock.sendMessage(phoneJid, { text: msg });
                  logger.info(`Successfully alerted ${user.uid} about proxy drop.`);
                } catch (e) {
                  logger.error(`Failed to send offline alert to ${user.uid}:`, e.message);
                }
              }
            }

            // Only wipe auth folder if it was a genuine established session dropout
            try {
              if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
              }
            } catch (e) { }
          } else {
            logger.info(`[PROXY] Socket closed before fully connecting for ${user.uid}. Skipping alert and cleanup — pairing likely in progress.`);
          }
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      logger.info(`[PROXY EVENT] ${user.uid || 'Unknown'} received ${m.messages.length} message(s)`);
      for (const msg of m.messages) {
        await handleProxyMessage(sock, msg, user);
      }
    });

    this.sessions.set(sessionKey, sock);
  }

  // ── Shared helper: wires the post-pairing lifecycle events onto any socket ──
  _applyPostPairingLifecycle(sock, user, authPath) {
    const phoneNumber = user.uid.split('@')[0];
    const phoneJid = `${phoneNumber}@s.whatsapp.net`;

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, isNewLogin } = update;

      if (isNewLogin) {
        logger.info(`✅ Pairing payload accepted for ${user.uid}! Socket will restart.`);
        if (db.users) {
          db.users.doc(user.uid).set({
            state: 'AWAITING_BROADCAST_PERMISSION',
            phoneJid,
            phoneNumber,
            pairedAt: new Date().toISOString()
          }, { merge: true }).catch(e => logger.error(`DB Update failed:`, e.message));
        }
        if (this.motherSock) {
          const prompt = `✅ *LINK SUCCESSFUL!*\n\nYour Proxy Bot is now active and ready to sell data! 🚀\n\n*Final Configuration:*\nWould you like your Proxy Bot to safely announce your new automated store to your WhatsApp contacts?\n\nOur system will send the messages in slow, safe batches so your account is protected.\n\nReply *YES* to begin the safe rollout or *NO* to skip.`;
          this.motherSock.sendMessage(phoneJid, { text: prompt }).catch(() => { });
        }
      }

      if (connection === 'open') {
        logger.info(`✅ Proxy Bot for ${user.uid} fully connected!`);
        this.pendingPairings.delete(user.uid);
        this.sessions.set(user.uid, sock);
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          logger.info(`[PAIR] Pairing was rejected or timed out for ${user.uid}`);
          this.pendingPairings.delete(user.uid);
        } else {
          logger.info(`[PAIR] Socket connection closed (Reason: ${statusCode}). Handing off to proxy reconnect loop...`);
          this.pendingPairings.delete(user.uid);
          setTimeout(() => this.startProxyBot(user), 2000);
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      for (const msg of m.messages) {
        await handleProxyMessage(sock, msg, user);
      }
    });
  }

  // ── QR-based pairing (beta / in-person) ──────────────────────────────────
  // Mirrors exactly how the Mother Bot pairs. The `onQRReady` callback is
  // invoked the moment the QR code is printed in the terminal so MotherBot
  // can send a WhatsApp "scan now" nudge to the co-member.
  async startQRPairingForUser(user, onQRReady) {
    logger.info(`[QR-PAIR] Starting QR pairing for ${user.uid}`);

    // Kill any in-progress pairing for this user
    const existing = this.pendingPairings.get(user.uid);
    if (existing) {
      try { existing.sock.end(); } catch (e) { }
      this.pendingPairings.delete(user.uid);
    }

    // Always start fresh — wipe any stale session folder
    const authPath = path.join(this.sessionsDir, `proxy_${user.uid}`);
    if (fs.existsSync(authPath)) {
      try { fs.rmSync(authPath, { recursive: true, force: true }); } catch (e) { }
      logger.info(`[QR-PAIR] Cleared stale session at: ${authPath}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const socketFunction = makeWASocket.default || makeWASocket;
    const sock = socketFunction({
      version: this.baileysVersion || [6, 33, 0],
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true   // ← prints QR to terminal, same as Mother Bot
    });

    sock.ev.on('creds.update', saveCreds);

    // Fire the "QR is live" callback exactly once
    let qrFired = false;
    sock.ev.on('connection.update', async (update) => {
      const { qr } = update;
      if (qr && !qrFired) {
        qrFired = true;
        // Manually render the QR — same as initMotherBot.
        // printQRInTerminal:true alone is silenced by pino({ level:'silent' }).
        logger.info('========================================');
        logger.info(`[QR-PAIR] QR CODE FOR: ${user.uid.split('@')[0]}`);
        qrcode.generate(qr, { small: true });
        logger.info('Scan with WhatsApp > Settings > Linked Devices > Link a Device');
        logger.info('========================================');
        logger.info(`[QR-PAIR] ✅ QR rendered in terminal — tilt the laptop!`);
        if (typeof onQRReady === 'function') {
          try { await onQRReady(); } catch (e) { logger.warn('[QR-PAIR] onQRReady callback error:', e.message); }
        }
      }
    });

    // Wire shared post-pairing lifecycle (isNewLogin, open, close)
    this._applyPostPairingLifecycle(sock, user, authPath);

    this.pendingPairings.set(user.uid, { sock, authPath });
    return 'QR_SHOWN';
  }

  // ── Pairing-code based pairing (kept intact for scale / future use) ───────
  async requestPairingCodeForUser(user) {
    logger.info(`Requesting pairing code for ${user.uid}`);

    const existing = this.pendingPairings.get(user.uid);
    if (existing) {
      try { existing.sock.end(); } catch (e) { }
      this.pendingPairings.delete(user.uid);
    }

    const authPath = path.join(this.sessionsDir, `proxy_${user.uid}`);
    if (fs.existsSync(authPath)) {
      try { fs.rmSync(authPath, { recursive: true, force: true }); } catch (e) { }
      logger.info(`[PAIR] Cleared stale session at: ${authPath}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const socketFunction = makeWASocket.default || makeWASocket;
    const sock = socketFunction({
      version: this.baileysVersion || [6, 33, 0],
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS('Chrome')
    });

    sock.ev.on('creds.update', saveCreds);

    // Wire shared post-pairing lifecycle
    this._applyPostPairingLifecycle(sock, user, authPath);

    // === ULTRA-FAST POLLING PATTERN ===
    if (!sock.authState.creds.registered) {
      let code;
      let attempt = 0;
      while (attempt < 25) {
        try {
          attempt++;
          const phoneNumber = user.uid.split('@')[0];
          logger.info(`[PAIR] Requesting pairing code for ${phoneNumber} (Attempt ${attempt})...`);
          code = await sock.requestPairingCode(phoneNumber);
          logger.info(`[PAIR] ✅ Pairing code generated for ${phoneNumber}: ${code}`);
          this.pendingPairings.set(user.uid, { sock, authPath });
          return code;
        } catch (e) {
          if (e.message && (e.message.includes('Closed') || e.message.includes('Connection'))) {
            await new Promise(r => setTimeout(r, 250));
            continue;
          }
          throw e;
        }
      }
      throw new Error('Timeout waiting for WhatsApp WebSocket to open. Please try again later.');
    } else {
      throw new Error('Device is already registered.');
    }
  }

  getContacts(userId) {
    const store = this.contactStores.get(userId);
    if (!store) {
      logger.warn(`No active store found for ${userId}. Cannot fetch contacts.`);
      return [];
    }
    return Array.from(store);
  }
}

export default new SessionManager();
