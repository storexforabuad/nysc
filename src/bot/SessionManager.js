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
      logger.info('Initializing Clarion Hub...');
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
          logger.info('✅ Clarion Hub connected successfully!');
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
    logger.info('Initializing Clarion Digital Stores...');
    try {
      if (!db.users) {
        logger.warn('Firestore not available, skipping Proxy Bot initialization.');
        return;
      }
      const usersSnapshot = await db.users.where('state', 'in', ['COMPLETED', 'PAIRED']).get();
      logger.info(`Found ${usersSnapshot.size} potential Clarion Stores to initialize.`);

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

    logger.info(`Starting Clarion Store for ${user.name || 'Unknown'} (${user.uid || 'Unknown'})`);
    const authPath = path.join(this.sessionsDir, `proxy_${sessionKey}`);
    logger.info(`[CLARION] Loading session from: proxy_${sessionKey}`);
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
        logger.info(`✅ Activation payload accepted for ${user.uid}! Clarion Store will restart.`);
        if (db.users) {
          const phoneNumber = user.phoneJid ? user.phoneJid.split('@')[0] : user.uid.split('@')[0];
          const phoneJid = user.phoneJid || `${phoneNumber}@s.whatsapp.net`;
          db.users.doc(user.uid).set({
            state: 'AWAITING_BROADCAST_CONTACTS',
            phoneJid,
            phoneNumber,
            pairedAt: new Date().toISOString()
          }, { merge: true }).catch(e => logger.error(`DB Update failed:`, e.message));

          if (this.motherSock) {
            this._sendActivationSuccessMessages(phoneJid);
          }
        }
      }

      if (connection === 'open') {
        hasEverConnected = true;
        logger.info(`✅ Clarion Digital Store for ${user.uid} is fully operational.`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          this.startProxyBot(user);
        } else {
          logger.info(`[CLARION] Enterprise session permanently closed for ${user.uid}. Cleaning up.`);
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
                const msg = `⚠️ *Action Required: Your Digital Storefront is offline.*\n\nYour customers currently cannot place orders. Please reply *PAIR [your_phone_number]* to reactivate your Clarion Store — a fresh activation code will be prepared for you.`;
                const phoneJid = user.phoneJid || user.uid;
                try {
                  await this.motherSock.sendMessage(phoneJid, { text: msg });
                  logger.info(`Successfully alerted ${user.uid} about enterprise downtime.`);
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
            logger.info(`[CLARION] Session closed before fully connecting for ${user.uid}. Skipping alert — activation likely in progress.`);
          }
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      logger.info(`[CLARION EVENT] ${user.uid || 'Unknown'} received ${m.messages.length} communication(s)`);
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
        logger.info(`✅ Activation payload accepted for ${user.uid}! Enterprise link will restart.`);
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

      if (connection === 'open') {
        logger.info(`✅ Clarion Digital Store for ${user.uid} fully activated!`);
        this.pendingPairings.delete(user.uid);
        this.sessions.set(user.uid, sock);
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          logger.info(`[ACTIVATE] Activation was rejected or timed out for ${user.uid}`);
          this.pendingPairings.delete(user.uid);
        } else {
          logger.info(`[ACTIVATE] Connection closed (Reason: ${statusCode}). Re-engaging activation loop...`);
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
    logger.info(`[HUB-ACTIVATE] Starting activation for ${user.uid}`);

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
      logger.info(`[HUB-ACTIVATE] Cleared stale session at: ${authPath}`);
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
        logger.info(`[CLARION-ACTIVATE] ACTIVATION CODE FOR: ${user.uid.split('@')[0]}`);
        qrcode.generate(qr, { small: true });
        logger.info('Scan with WhatsApp > Settings > Linked Devices > Link a Device');
        logger.info('========================================');
        logger.info(`[CLARION-ACTIVATE] ✅ Activation QR prepared and rendered!`);
        if (typeof onQRReady === 'function') {
          try { await onQRReady(); } catch (e) { logger.warn('[ACTIVATE] onQRReady callback error:', e.message); }
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

  async _sendActivationSuccessMessages(phoneJid) {
    if (!this.motherSock) return;

    const msg1 = `🥳 *ACTIVATION SUCCESSFUL!*\n\nYour Clarion Digital Store is now live and ready to generate revenue! 🚀\n\n*How to manage your store:*\nSimply text me these keywords anytime:\n\n💰 *BALANCE* - Check your earnings\n📜 *HISTORY* - View recent orders & payouts\n💸 *WITHDRAW [amount]* - Cash out your profits`;

    const broadcastTemplate = `🚀 Great news! I've just launched my own automated 24/7 data enterprise powered by Clarion A.I (An NYSC SAED Inspired Project). You can now get high-speed data at affordable prices directly through my number!\n\nIf you ever need data, simply reply to my number with:\n\n*DATA* - See all plans for your network\n*DATA [price]* - Find plans around your budget\n*DATA [price] [number]* - Send to a friend\n\nFeel free to ignore this if you're not interested right now! 😊`;

    const msg2 = `📢 *Launch your automated store!*\n\nWould you like Clarion A.I. to announce your new enterprise to specific WhatsApp contacts?\n\n*Here is a preview of what they will see:*\n---\n${broadcastTemplate}\n---\n\n*How to broadcast:*\nSimply share the contact cards or type the phone numbers here (e.g. 08012345678) of the people you want to send this to.\n\nWhen you are ready, reply *DONE* to send the broadcast to them, or *SKIP* if you prefer not to broadcast.`;

    try {
      await this.motherSock.sendMessage(phoneJid, { text: msg1 });
      await new Promise(r => setTimeout(r, 1500)); // Brief delay for readability
      await this.motherSock.sendMessage(phoneJid, { text: msg2 });
    } catch (err) {
      logger.error(`Failed to send activation success messages to ${phoneJid}:`, err.message);
    }
  }
}

export default new SessionManager();
