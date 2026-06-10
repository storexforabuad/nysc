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
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          this.startProxyBot(user);
        } else {
          logger.info(`[PROXY] Session permanently closed for ${user.uid}. Cleaning up.`);
          this.sessions.delete(sessionKey);

          // Alert the user via Mother Bot (with basic 30-minute rate limiting)
          const lastAlertKey = `last_alert_${user.uid}`;
          const lastAlertTime = this.sessions.get(lastAlertKey) || 0;
          const now = Date.now();
          if (now - lastAlertTime > 30 * 60 * 1000) {
            this.sessions.set(lastAlertKey, now);

            if (this.motherSock) {
              const msg = `⚠️ *Critical Alert: Your Data Store is offline.*\n\nYour customers currently cannot place orders. Please reply *PAIR [your_phone_number]* to reconnect a fresh session immediately. (e.g., *PAIR 08012345678*)`;
              const phoneJid = user.phoneJid || user.uid;
              try {
                await this.motherSock.sendMessage(phoneJid, { text: msg });
                logger.info(`Successfully alerted ${user.uid} about proxy drop.`);
              } catch (e) {
                logger.error(`Failed to send offline alert to ${user.uid}:`, e.message);
              }
            }
          }

          // Wipe stale auth folder
          try {
            if (fs.existsSync(authPath)) {
              fs.rmSync(authPath, { recursive: true, force: true });
            }
          } catch (e) { }
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

  async requestPairingCodeForUser(user) {
    logger.info(`Requesting pairing code for ${user.uid}`);

    // Close any existing pairing socket for this user
    const existing = this.pendingPairings.get(user.uid);
    if (existing) {
      try {
        existing.sock.end();
      } catch (e) { }
      this.pendingPairings.delete(user.uid);
    }

    // Delete stale session files from previous failed attempts
    const authPath = path.join(this.sessionsDir, `proxy_${user.uid}`);
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      logger.info(`[PAIR] Cleared stale session at: ${authPath}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const socketFunction = makeWASocket.default || makeWASocket;
    const sock = socketFunction({
      version: this.baileysVersion || [6, 33, 0],
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    // Get phone number from JID (e.g. 234123456789@s.whatsapp.net -> 234123456789)
    const phoneNumber = user.uid.split('@')[0];

    try {
      // Wait for the socket to stabilize before requesting a code
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout waiting for socket stabilization')), 30000);
        sock.ev.on('connection.update', (update) => {
          if (update.qr || update.connection === 'connecting' || update.connection === 'open') {
            clearTimeout(timeout);
            // Wait 5 seconds to ensure Noise/WebSocket handshakes are complete
            setTimeout(resolve, 5000);
          } else if (update.connection === 'close') {
            clearTimeout(timeout);
            reject(new Error('Socket closed before ready'));
          }
        });
      });

      const requestWithRetry = async (retries = 3) => {
        try {
          return await sock.requestPairingCode(phoneNumber);
        } catch (err) {
          if (retries > 0 && err.message.includes('Closed')) {
            logger.warn(`Pairing code request failed (Connection Closed). Retrying... (${retries} left)`);
            await new Promise(r => setTimeout(r, 3000));
            return requestWithRetry(retries - 1);
          }
          throw err;
        }
      };

      const code = await requestWithRetry();

      // Store socket so it stays alive while user types code
      this.pendingPairings.set(user.uid, { sock, authPath });

      // Carry on with connection listeners so it actually links when user enters code
      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, isNewLogin } = update;
        const phoneJid = `${phoneNumber}@s.whatsapp.net`;

        if (isNewLogin) {
          logger.info(`✅ Pairing payload accepted for ${user.uid}! Socket will now restart.`);

          // Update database state with phoneJid
          if (db.users) {
            db.users.doc(user.uid).set({
              state: 'AWAITING_BROADCAST_PERMISSION',
              phoneJid,
              phoneNumber,
              pairedAt: new Date().toISOString()
            }, { merge: true })
              .then(() => logger.info(`Updated status to AWAITING_BROADCAST_PERMISSION for ${user.uid}`))
              .catch(e => logger.error(`DB Update failed for ${user.uid}:`, e.message));
          }

          // Notify user via Mother Bot that the link is successful (using phoneJid)
          if (this.motherSock) {
            const prompt = `✅ *LINK SUCCESSFUL!*\n\nYour Proxy Bot is now active and ready to sell data! 🚀\n\n*Final Configuration:*\nWould you like your Proxy Bot to safely announce your new automated store to your WhatsApp contacts?\n\nOur system will send the messages in slow, safe batches so your account is protected.\n\nReply *YES* to begin the safe rollout or *NO* to skip.`;
            this.motherSock.sendMessage(phoneJid, { text: prompt })
              .catch(e => logger.error('Failed to send success msg:', e.message));
          }
        }

        if (connection === 'open') {
          logger.info(`✅ Proxy Bot for ${user.name} (${user.uid}) pairing socket connected successfully!`);
          this.pendingPairings.delete(user.uid);
          this.sessions.set(user.uid, sock);
        } else if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          this.pendingPairings.delete(user.uid);

          if (statusCode === DisconnectReason.loggedOut) {
            logger.info(`[PAIR] Pairing was rejected or logged out for ${user.uid}`);
          } else {
            // Hand off the connection to the standard proxy bot starter
            // This is required because Baileys intentionally drops the connection after successful pairing
            logger.info(`[PAIR] Handing off to startProxyBot to complete Companion login for ${user.uid}...`);
            setTimeout(() => this.startProxyBot(user), 2000);
          }
        }
      });

      sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        logger.info(`[PROXY EVENT] ${user.uid} received ${m.messages.length} message(s)`);
        for (const msg of m.messages) {
          await handleProxyMessage(sock, msg, user);
        }
      });

      return code;
    } catch (err) {
      logger.error({ err, phoneNumber }, 'Baileys requestPairingCode failed');
      throw err;
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
