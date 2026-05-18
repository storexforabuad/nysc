import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleMotherMessage } from './MotherBot.js';
import { handleProxyMessage } from './ProxyBot.js';
import path from 'path';
import fs from 'fs';

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir);
  }

  async initMotherBot() {
    logger.info('Initializing Mother Bot...');
    const authPath = path.join(this.sessionsDir, 'mother_bot');
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket.default({
      version,
      printQRInTerminal: true,
      auth: state,
      logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) this.initMotherBot();
      } else if (connection === 'open') {
        logger.info('Mother Bot connected!');
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
  }

  async initProxyBots() {
    logger.info('Initializing existing Proxy Bots...');
    const usersSnapshot = await db.users.where('state', '==', 'COMPLETED').get();
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      await this.startProxyBot(userData);
    }
  }

  async startProxyBot(user) {
    if (this.sessions.has(user.uid)) return;

    logger.info(`Starting Proxy Bot for ${user.name} (${user.uid})`);
    const authPath = path.join(this.sessionsDir, `proxy_${user.uid}`);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const sock = makeWASocket.default({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) this.startProxyBot(user);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        await handleProxyMessage(sock, msg, user);
      }
    });

    this.sessions.set(user.uid, sock);
  }
}

export default new SessionManager();
