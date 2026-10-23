import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config, logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleMotherMessage, CENTRAL_HUB_ACCOUNT, mockUserStore } from './MotherBot.js';
import mediaGen from '../services/mediaGen.js';
import path from 'path';
import fs from 'fs';
import { Worker } from 'worker_threads';
import { getFreeGrantDays, BOT_MODES } from '../services/WalletService.js';

class SessionManager {
  constructor() {
    this.sessions = new Map(); // now holds worker instances
    this.pendingPairings = new Map();
    this.lastAlertTimes = new Map();
    this.sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir);
  }

  async initMotherBot() {
    // Guard against multiple concurrent reconnections racing each other
    if (this._motherReconnecting) {
      logger.info('Mother Bot reconnection already in progress, skipping duplicate call.');
      return;
    }
    this._motherReconnecting = true;

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
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          // Release the guard so the delayed reconnect can proceed
          this._motherReconnecting = false;

          if (shouldReconnect) {
            // Exponential backoff: 3s, 6s, 12s, 24s... capped at 60s
            this._motherReconnectAttempts = (this._motherReconnectAttempts || 0) + 1;
            const delay = Math.min(3000 * Math.pow(2, this._motherReconnectAttempts - 1), 60000);
            logger.info(`Mother Bot disconnected (status=${statusCode}). Reconnecting in ${delay / 1000}s (attempt ${this._motherReconnectAttempts})...`);
            setTimeout(() => this.initMotherBot(), delay);
          } else {
            logger.info('Mother Bot logged out permanently.');
            this._motherReconnectAttempts = 0;
          }
        } else if (connection === 'open') {
          logger.info('✅ Clarion Hub connected successfully!');
          this.motherSock = sock;
          this.baileysVersion = version;
          this._motherReconnecting = false;
          this._motherReconnectAttempts = 0; // Reset backoff on successful connection

          // Only initialize proxy bots once (workers persist across MotherBot reconnects)
          if (!this._proxyBotsInitialized) {
            this._proxyBotsInitialized = true;
            this.initProxyBots();
          }
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
      this._motherReconnecting = false;
      logger.error({ err }, 'Error in initMotherBot');
      // Auto-retry on crash with backoff
      this._motherReconnectAttempts = (this._motherReconnectAttempts || 0) + 1;
      const delay = Math.min(3000 * Math.pow(2, this._motherReconnectAttempts - 1), 60000);
      logger.info(`Retrying initMotherBot in ${delay / 1000}s...`);
      setTimeout(() => this.initMotherBot(), delay);
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
        const resolvedMode = user.botMode || BOT_MODES.AUTONOMOUS;
        const resolvedApproved = user.terminalApproved !== undefined ? user.terminalApproved : true;

        user.botMode = resolvedMode;
        user.terminalApproved = resolvedApproved;

        const activationData = {
          state: 'COMPLETED',
          botMode: resolvedMode,
          terminalApproved: resolvedApproved,
          phoneJid,
          phoneNumber,
          pairedAt: user.pairedAt || new Date().toISOString()
        };
        if (user.subscription) activationData.subscription = user.subscription;
        if (user.announceNewContacts !== undefined) activationData.announceNewContacts = user.announceNewContacts;
        if (user.brandName) activationData.brandName = user.brandName;
        if (user.verifiedName) activationData.verifiedName = user.verifiedName;

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
        const resolvedMode = user.botMode || BOT_MODES.AUTONOMOUS;
        const resolvedApproved = user.terminalApproved !== undefined ? user.terminalApproved : true;

        user.botMode = resolvedMode;
        user.terminalApproved = resolvedApproved;

        const activationData = {
          state: 'COMPLETED',
          botMode: resolvedMode,
          terminalApproved: resolvedApproved,
          phoneJid,
          phoneNumber,
          pairedAt: user.pairedAt || new Date().toISOString()
        };
        if (user.subscription) activationData.subscription = user.subscription;
        if (user.announceNewContacts !== undefined) activationData.announceNewContacts = user.announceNewContacts;
        if (user.brandName) activationData.brandName = user.brandName;
        if (user.verifiedName) activationData.verifiedName = user.verifiedName;

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
            const lastAlertTime = this.lastAlertTimes.get(lastAlertKey) || 0;
            const now = Date.now();
            if (now - lastAlertTime > 30 * 60 * 1000) {
              this.lastAlertTimes.set(lastAlertKey, now);
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
    if (user.terminalApproved === undefined) user.terminalApproved = true;
    if (!user.botMode) user.botMode = BOT_MODES.AUTONOMOUS;
    const sessionKey = user.phoneJid || user.uid;
    if (this.sessions.has(sessionKey)) return;

    logger.info(`Starting Worker for Clarion Store: ${user.name || user.uid}`);

    const motherBotJid = this.motherSock?.user?.id ? this.motherSock.user.id.split(':')[0] + '@s.whatsapp.net' : '2348119772223@s.whatsapp.net';
    const motherBotLid = this.motherSock?.user?.lid ? this.motherSock.user.lid.split(':')[0] + '@lid' : '161856060690464@lid';

    const workerPath = path.join(process.cwd(), 'src', 'bot', 'ProxyWorker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        user,
        baileysVersion: this.baileysVersion,
        sessionsDir: this.sessionsDir,
        pairingMode: false,
        isPairingCode: false,
        motherBotJid,
        motherBotLid
      }
    });

    this._handleWorkerIPC(worker, user, sessionKey);
    this.sessions.set(sessionKey, worker);
    return worker;
  }

  async startQRPairingForUser(user, onQRReady) {
    if (user.terminalApproved === undefined) user.terminalApproved = true;
    if (!user.botMode) user.botMode = BOT_MODES.AUTONOMOUS;
    logger.info(`[HUB-ACTIVATE] Starting QR worker activation for ${user.uid}`);

    const sessionKey = user.phoneJid || user.uid;
    const existing = this.pendingPairings.get(user.uid) || this.sessions.get(sessionKey);
    if (existing) {
      try { existing.terminate(); } catch (e) { }
      this.pendingPairings.delete(user.uid);
      this.sessions.delete(sessionKey);
    }

    const motherBotJid = this.motherSock?.user?.id ? this.motherSock.user.id.split(':')[0] + '@s.whatsapp.net' : '2348119772223@s.whatsapp.net';
    const motherBotLid = this.motherSock?.user?.lid ? this.motherSock.user.lid.split(':')[0] + '@lid' : '161856060690464@lid';

    const workerPath = path.join(process.cwd(), 'src', 'bot', 'ProxyWorker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        user,
        baileysVersion: this.baileysVersion,
        sessionsDir: this.sessionsDir,
        pairingMode: true,
        isPairingCode: false,
        motherBotJid,
        motherBotLid
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
    if (user.terminalApproved === undefined) user.terminalApproved = true;
    if (!user.botMode) user.botMode = BOT_MODES.AUTONOMOUS;
    logger.info(`Requesting pairing code (via Worker) for ${user.uid}`);

    const sessionKey = user.phoneJid || user.uid;
    const existing = this.pendingPairings.get(user.uid) || this.sessions.get(sessionKey);
    if (existing) {
      try { existing.terminate(); } catch (e) { }
      this.pendingPairings.delete(user.uid);
      this.sessions.delete(sessionKey);
    }

    const motherBotJid = this.motherSock?.user?.id ? this.motherSock.user.id.split(':')[0] + '@s.whatsapp.net' : '2348119772223@s.whatsapp.net';
    const motherBotLid = this.motherSock?.user?.lid ? this.motherSock.user.lid.split(':')[0] + '@lid' : '161856060690464@lid';

    const workerPath = path.join(process.cwd(), 'src', 'bot', 'ProxyWorker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        user,
        baileysVersion: this.baileysVersion,
        sessionsDir: this.sessionsDir,
        pairingMode: true,
        isPairingCode: true,
        motherBotJid,
        motherBotLid
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

  updateWorkerUser(identifier, updates) {
    if (!identifier || !updates) return false;
    const cleanId = String(identifier).trim();
    const cleanDigits = cleanId.replace(/[^0-9]/g, '');

    // 1. Search in active worker sessions by sessionKey or telephone digits
    let targetWorker = this.sessions.get(cleanId);
    if (!targetWorker) {
      for (const [key, worker] of this.sessions.entries()) {
        const keyDigits = String(key).replace(/[^0-9]/g, '');
        if (key === cleanId || (cleanDigits.length >= 10 && keyDigits.endsWith(cleanDigits.slice(-10)))) {
          targetWorker = worker;
          break;
        }
      }
    }

    if (targetWorker) {
      try {
        targetWorker.postMessage({ type: 'update_user', updates });
        logger.info(`[IPC] Dispatched update_user to worker for ${identifier}: botMode=${updates.botMode}`);
      } catch (err) {
        logger.error(`[IPC] Error posting update_user to worker for ${identifier}:`, err.message);
      }
    } else {
      logger.info(`[IPC] No active worker thread found for ${identifier} (will load on next worker start)`);
    }

    // 2. Synchronize in-memory fallback mockUserStore
    if (mockUserStore) {
      for (const [k, u] of mockUserStore.entries()) {
        const kDigits = String(k).replace(/[^0-9]/g, '');
        if (k === cleanId || (cleanDigits.length >= 10 && kDigits.endsWith(cleanDigits.slice(-10)))) {
          Object.assign(u, updates);
          mockUserStore.set(k, u);
          logger.info(`[MOCK] Synchronized mockUserStore for ${k}: botMode=${u.botMode}`);
        }
      }
    }

    return !!targetWorker;
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

    const targetUid = user?.uid || fullUser?.uid;
    if (db.users) {
      if (targetUid) {
        await db.users.doc(targetUid).set(updates, { merge: true }).catch(e => logger.warn('DB set updates failed for targetUid:', e.message));
      }
      if (phoneJid && phoneJid !== targetUid) {
        await db.users.doc(phoneJid).set(updates, { merge: true }).catch(e => logger.warn('DB set updates failed for phoneJid:', e.message));
      }
    }

    if (mockUserStore && typeof mockUserStore.has === 'function') {
      if (targetUid && mockUserStore.has(targetUid)) Object.assign(mockUserStore.get(targetUid), updates);
      if (phoneJid && mockUserStore.has(phoneJid)) Object.assign(mockUserStore.get(phoneJid), updates);
    }

    // Immediately push hot-reload to running ProxyWorker thread
    this.updateWorkerUser(phoneJid, {
      terminalApproved: true,
      botMode: updates.botMode,
      subscription: updates.subscription,
      announceNewContacts: true
    });

    // 3. Stage 0 — Tier-Aware Welcome Briefing
    let tierHeader = '';
    const tierUpper = String(tier || '').toUpperCase();
    if (tierUpper === 'LORD' || tierUpper === 'PIONEER') {
      tierHeader = `🔱 *CLARION LORD — PIONEER BENEFIT ACTIVATED*\n\n` +
        `As a founding CDS contributor, you've been granted *2 months of free Autonomous AI Mode* (60 days). ⚡\n\n` +
        `Your store runs 24/7 — completely automated — with no subscription fees required.`;
    } else if (['MASTER', 'MEMBER'].includes(tierUpper)) {
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
      `📋 *Your 5-Step Onboarding Kit:*\n` +
      `1️⃣  Official Franchise Certificate\n` +
      `2️⃣  Storefront Control Deck & Commands\n` +
      `3️⃣  Launch Giveaway Engine (₦0 Credit)\n` +
      `4️⃣  Auto-Status Launch Broadcast\n` +
      `5️⃣  7-Day Daily Auto-Status Schedule\n\n` +
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

  async dispatchDynamicPromoStatus(userOrUid, activePromo) {
    const uid = typeof userOrUid === 'string' ? userOrUid : (userOrUid?.uid || userOrUid?.phoneJid);
    const sessionKey = (typeof userOrUid === 'object' && userOrUid?.phoneJid) ? userOrUid.phoneJid : uid;
    const worker = this.sessions.get(sessionKey) || this.sessions.get(uid);
    if (!worker) return false;

    const brandName = (typeof userOrUid === 'object' && userOrUid.brandName)
      ? userOrUid.brandName
      : ('Clarion AI Store');
    const sizeMb = activePromo?.sizeMb || 500;
    const totalClaims = activePromo?.totalClaims || 5;
    const remainingClaims = Math.max(0, activePromo?.remainingClaims ?? 0);

    let text = '';
    if (remainingClaims === totalClaims) {
      text = `🎉 *LAUNCH GIVEAWAY IS LIVE!* ⚡\n──────────────\n\nMy 24/7 automated data storefront (*${brandName}*) is officially live!\n\n🎁 I'm gifting *${sizeMb}MB FREE DATA* to the first *${remainingClaims} people* who test my store right now!\n\n👉 *How to claim:*\nMessage this number & reply *PROMO* to claim your free data instantly!\n\n──────────────\n_⚡ ${remainingClaims} of ${totalClaims} free grants remaining_`;
    } else if (remainingClaims > 1) {
      text = `🚨 *GIVEAWAY COUNTDOWN!* ⏳\n──────────────\n\n*${brandName}* launch giveaway update:\n\n🔥 Only *${remainingClaims} FREE DATA GRANTS* left! (*${sizeMb}MB Instant Data*)\n\n👉 Message this number now & reply *PROMO* before it runs out!\n\n──────────────\n_⚡ ${remainingClaims} of ${totalClaims} grants remaining_`;
    } else if (remainingClaims === 1) {
      text = `⚡ *LAST FREE DATA GRANT!* 🏃‍♂️\n──────────────\n\nOnly *1 FREE GRANT LEFT* for *${sizeMb}MB Data* on *${brandName}*!\n\n👉 Message right now & reply *PROMO* to grab the final slot!`;
    } else {
      text = `🎉 *GIVEAWAY 100% CLAIMED!* 🏁\n──────────────\n\nAll *${totalClaims} free data grants* for *${brandName}* have been claimed and delivered in seconds! ⚡\n\nMissed out? Don't worry!\n\n👉 Reply *DATA* anytime to buy affordable MTN, Airtel, Glo & 9mobile data delivered automatically 24/7.\n👉 Reply *DATA 1000* to view ₦1,000 budget plans.`;
    }

    try {
      worker.postMessage({ type: 'text_status', text });
      logger.info(`[PROMO-STATUS] Dispatched dynamic status update for ${uid} (${remainingClaims} remaining)`);
      return true;
    } catch (e) {
      logger.error(`[PROMO-STATUS] Failed to dispatch promo status for ${uid}: ${e.message}`);
      return false;
    }
  }

  updateWorkerUser(userOrUid, updates) {
    const uid = typeof userOrUid === 'string' ? userOrUid : (userOrUid?.uid || userOrUid?.phoneJid);
    const sessionKey = (typeof userOrUid === 'object' && userOrUid?.phoneJid) ? userOrUid.phoneJid : uid;

    if (mockUserStore && typeof mockUserStore.has === 'function') {
      if (sessionKey && mockUserStore.has(sessionKey)) {
        Object.assign(mockUserStore.get(sessionKey), updates);
      }
      if (uid && mockUserStore.has(uid)) {
        Object.assign(mockUserStore.get(uid), updates);
      }
    }

    const worker = this.sessions.get(sessionKey) || this.sessions.get(uid);
    if (worker && typeof worker.postMessage === 'function') {
      try {
        worker.postMessage({ type: 'update_user', updates });
        logger.info(`[IPC] Dispatched update_user to worker for ${uid}`);
        return true;
      } catch (e) {
        logger.error(`[IPC] Failed to update worker user for ${uid}: ${e.message}`);
      }
    }
    return false;
  }
}

const sessionManager = new SessionManager();

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

  const text = String(rawText || '').trim().toLowerCase();

  const persistStep = async (newStep, extra = {}) => {
    const payload = { onboardingStep: newStep, ...extra };
    fullUser.onboardingStep = newStep;
    Object.assign(fullUser, extra);

    if (db.users) {
      if (fullUser.uid) await db.users.doc(fullUser.uid).set(payload, { merge: true }).catch(() => {});
      if (from && from !== fullUser.uid) await db.users.doc(from).set(payload, { merge: true }).catch(() => {});
      if (user?.uid && user.uid !== fullUser.uid && user.uid !== from) {
        await db.users.doc(user.uid).set(payload, { merge: true }).catch(() => {});
      }
    }
    if (mockUserStore && typeof mockUserStore.has === 'function') {
      if (fullUser.uid && mockUserStore.has(fullUser.uid)) Object.assign(mockUserStore.get(fullUser.uid), payload);
      if (from && mockUserStore.has(from)) Object.assign(mockUserStore.get(from), payload);
      if (user?.uid && mockUserStore.has(user.uid)) Object.assign(mockUserStore.get(user.uid), payload);
    }
  };

  let step = (fullUser.onboardingStep !== null && fullUser.onboardingStep !== undefined)
    ? Number(fullUser.onboardingStep)
    : (user.onboardingStep !== null && user.onboardingStep !== undefined)
      ? Number(user.onboardingStep)
      : null;

  // If the user says "ready", "start", "next" but step is missing/undefined, initialize to step 0!
  if (step === null) {
    if (['ready', 'start', 'go', '1'].includes(text)) {
      step = 0;
      await persistStep(0);
    } else {
      return false;
    }
  }

  const info = resolvePartnerInfo(fullUser, from);
  const isAutonomous = fullUser.botMode === 'autonomous';

  // STEP 0: Expects READY
  if (step === 0) {
    if (['ready', 'next', 'start', 'go', '1', 'ok', 'yes'].includes(text)) {
      try {
        const cardBuffer = await mediaGen.generateProfileCard(fullUser);
        await sock.sendMessage(from, {
          image: cardBuffer,
          caption: `🪪 *STEP 1 OF 5 — YOUR OFFICIAL FRANCHISE CERTIFICATE*\n\n` +
            `This is your proof of ownership as a licensed Clarion Digital Storefront operator under the NYSC SAED Initiative.\n\n` +
            `*Save this image* — you'll need it to verify your status in the Clarion Partner network.\n\n` +
            `──────────────\n` +
            `Reply *NEXT* to view your live storefront details 🏪`
        });
      } catch (cardErr) {
        logger.error('Failed to generate activation profile card:', cardErr.message);
        await sock.sendMessage(from, {
          text: `🪪 *STEP 1 OF 5 — YOUR OFFICIAL FRANCHISE CERTIFICATE*\n\n` +
            `Congratulations, *${info.partnerName}*! Your digital enterprise is officially licensed and active under the NYSC SAED Initiative.\n\n` +
            `──────────────\n` +
            `Reply *NEXT* to view your live storefront details 🏪`
        });
      }
      await persistStep(1);
      return true;
    }

    if (text === 'skip') {
      await finishWizard(sock, from, fullUser, info, isAutonomous, persistStep);
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

      const controlDeckMsg = `🏪 *STEP 2 OF 5 — YOUR STOREFRONT IS LIVE*\n\n` +
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
        `📦 Sales: *DATA* · *ORDERS* · *CHECK*\n` +
        `💰 Wallet: *BALANCE* · *WITHDRAW [amt]*\n` +
        `🤖 Operations: *MODE* · *PROMO* · *STATUS*\n\n` +
        `──────────────\n` +
        `Reply *NEXT* to configure your Launch Promo Giveaway 🎁`;

      await sock.sendMessage(from, { text: controlDeckMsg });
      await persistStep(2);
      return true;
    }

    if (text === 'skip') {
      await finishWizard(sock, from, fullUser, info, isAutonomous, persistStep);
      return true;
    }

    await sock.sendMessage(from, {
      text: `👆 Reply *NEXT* to view your live storefront details, or *SKIP* to finish setup.`
    });
    return true;
  }

  // STEP 2: Transition to Launch Promo Engine (Step 3)
  if (step === 2) {
    if (['next', 'continue', '3', 'ok', 'yes', 'promo'].includes(text)) {
      const promoFuelPitch = `🎁 *STEP 3 OF 5 — LAUNCH GIVEAWAY ENGINE*\n` +
        `_Turn your contacts into paying data customers._\n` +
        `──────────────\n\n` +
        `👋 *${info.partnerName}*, vendors who gift free data on Day 1 see *4x higher repeat orders*!\n\n` +
        `💡 *KICKSTART ON CREDIT (₦0 UPFRONT)*:\n` +
        `We've unlocked a kickstart gift of *500MB to 3 friends* on credit (₦0 upfront). This is auto-cleared from your future sales profits as customers buy data — you never pay out of pocket, and you can fund more giveaways later whenever you want!\n\n` +
        `──────────────\n` +
        `👉 Reply *PROMO 500 3* to activate your 3-person gift on credit!\n` +
        `👉 Or reply *SKIP* to proceed without a promo for now.`;

      await sock.sendMessage(from, { text: promoFuelPitch });
      await persistStep(3);
      return true;
    }

    if (text === 'skip') {
      await finishWizard(sock, from, fullUser, info, isAutonomous, persistStep);
      return true;
    }

    await sock.sendMessage(from, {
      text: `👆 Reply *NEXT* to configure your Launch Promo Giveaway, or *SKIP* to finish setup.`
    });
    return true;
  }

  // STEP 3: Promo decision -> Show Step 4 Auto-Status Launch Gate
  if (step === 3) {
    let promoActivated = false;
    if (text.includes('promo') || text.includes('500') || text === 'yes' || text === 'credit' || text === '1') {
      promoActivated = true;
      const activePromo = {
        sizeMb: 500,
        mbPerContact: 500,
        totalClaims: 3,
        claimsRemaining: 3,
        status: 'ACTIVE',
        claimedBy: [],
        createdAt: new Date().toISOString()
      };
      if (db.users) {
        if (fullUser.uid) await db.users.doc(fullUser.uid).set({ activePromo, promoActive: true }, { merge: true }).catch(() => {});
        if (from && from !== fullUser.uid) await db.users.doc(from).set({ activePromo, promoActive: true }, { merge: true }).catch(() => {});
      }
      fullUser.activePromo = activePromo;
      fullUser.promoActive = true;

      await sock.sendMessage(from, {
        text: `🎉 *3-Person 500MB Giveaway Activated on Credit!* ⚡\nYour contacts can message this number and reply *PROMO* to claim their 500MB free data grant.`
      });
      await new Promise(r => setTimeout(r, 1000));
    } else {
      if (db.users) {
        if (fullUser.uid) await db.users.doc(fullUser.uid).set({ promoActive: false }, { merge: true }).catch(() => {});
        if (from && from !== fullUser.uid) await db.users.doc(from).set({ promoActive: false }, { merge: true }).catch(() => {});
      }
      fullUser.promoActive = false;
    }

    // Step 4: Show context-aware status preview
    const statusPreview = promoActivated
      ? `🎉 *LAUNCH GIVEAWAY IS LIVE!* ⚡\n──────────────\n\n` +
        `My 24/7 automated data storefront (*${info.storeName}*) is officially live!\n\n` +
        `🎁 I'm gifting *500MB FREE DATA* to the first *3 people* who test my store right now!\n\n` +
        `👉 *How to claim:*\n` +
        `Message this number & reply *PROMO* to claim your free data instantly!\n\n` +
        `──────────────\n` +
        `_⚡ 3 of 3 free grants remaining_`
      : `🚀 *Big news!* My 24/7 automated data store (*${info.storeName}*) is officially live!\n\n` +
        `Get instant, affordable MTN, Airtel, Glo & 9mobile data delivered automatically 24/7. ⚡\n\n` +
        `👉 Just reply *DATA* or *DATA 1000* to this chat to view all available packages!\n\n` +
        `💚 _A percentage of every purchase supports NYSC Community Development projects._ 🇳🇬`;

    const statusGateMsg = `📢 *STEP 4 OF 5 — AUTO LAUNCH STATUS PREVIEW*\n\n` +
      `We are ready to automatically broadcast this announcement to your WhatsApp Status:\n` +
      `──────────────\n\n` +
      `${statusPreview}\n\n` +
      `──────────────\n` +
      `👉 Reply *APPROVE* to post this to your WhatsApp Status automatically! 🚀\n` +
      `👉 Or reply *SKIP* to skip status posting for now.`;

    await sock.sendMessage(from, { text: statusGateMsg });
    await persistStep(4, { pendingStatusText: statusPreview });
    return true;
  }

  // STEP 4: Auto-Status Approval -> Show Step 5 7-Day Schedule
  if (step === 4) {
    if (['approve', 'post', 'yes', 'ok', '1'].includes(text)) {
      const statusText = fullUser.pendingStatusText || (fullUser.promoActive
        ? `🎉 *LAUNCH GIVEAWAY IS LIVE!* ⚡\nMy 24/7 automated data store (*${info.storeName}*) is live! Reply *PROMO* to claim 500MB free data now!`
        : `🚀 *Big news!* My 24/7 automated data store (*${info.storeName}*) is live! Reply *DATA* to order.`);

      try {
        const cleanPhone = String(fullUser.phoneNumber || fullUser.phone || fullUser.uid || from || '').replace(/[^0-9]/g, '');
        const possibleKeys = [
          from,
          fullUser.uid,
          fullUser.phoneJid,
          cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null,
          cleanPhone ? `proxy_${cleanPhone}@s.whatsapp.net` : null,
          cleanPhone
        ].filter(Boolean);

        let worker = null;
        for (const key of possibleKeys) {
          if (sessionManager.sessions && sessionManager.sessions.has(key)) {
            worker = sessionManager.sessions.get(key);
            break;
          }
        }

        if (worker && typeof worker.postMessage === 'function') {
          worker.postMessage({ type: 'text_status', text: statusText });
          logger.info(`[AUTO-STATUS] Dispatched launch status to worker for ${fullUser.uid || from}`);
          await sock.sendMessage(from, { text: `✅ *Launch announcement posted to your WhatsApp Status!* 🚀` });
        } else {
          logger.warn(`[AUTO-STATUS] No active worker found for user ${fullUser.uid || from}. Posting will occur via daily schedule.`);
          await sock.sendMessage(from, { text: `✅ *Auto-status posting activated!* 🚀\nYour scheduled statuses will broadcast daily at 9:00 AM.` });
        }
      } catch (err) {
        logger.error(`Failed to post auto launch status: ${err.message}`);
        await sock.sendMessage(from, { text: `✅ *Auto-status posting activated!* 🚀` });
      }
      await new Promise(r => setTimeout(r, 1000));
    } else {
      await sock.sendMessage(from, { text: `👌 Status posting skipped for now.` });
      await new Promise(r => setTimeout(r, 800));
    }

    const scheduleMsg = `📅 *STEP 5 OF 5 — 7-DAY DAILY AUTO-STATUS SCHEDULE*\n` +
      `Your store automatically posts 1 high-converting status daily at 9:00 AM:\n\n` +
      `· Day 1 (Mon): ⚡ Cheap MTN, Airtel & Glo 24/7 (Reply *DATA*)\n` +
      `· Day 2 (Tue): 📱 Running low on data? (Reply *DATA 500*)\n` +
      `· Day 3 (Wed): 🇳🇬 Support NYSC CDS community projects (Reply *DATA*)\n` +
      `· Day 4 (Thu): 🎓 WAEC & NECO Result Checker PINs (Reply *PIN WAEC*)\n` +
      `· Day 5 (Fri): 💳 Instant Airtime Top-ups (Reply *CARD 500*)\n` +
      `· Day 6 (Sat): ⚡ Weekend High-Speed Bundles (Reply *DATA*)\n` +
      `· Day 7 (Sun): 🎉 Sunday Data Deals & Top-ups (Reply *DATA*)\n` +
      `──────────────\n` +
      `Auto-Posting is currently: *ACTIVE* 🟢\n` +
      `(You can toggle anytime by replying *STATUS ON* or *STATUS OFF*)\n\n` +
      `👉 Reply *NEXT* to view your final operational checklist!`;

    await sock.sendMessage(from, { text: scheduleMsg });
    await persistStep(5);
    return true;
  }

  // STEP 5: Finalization -> finishWizard
  if (step === 5) {
    await finishWizard(sock, from, fullUser, info, isAutonomous, persistStep);
    return true;
  }

  return false;
}

async function finishWizard(sock, from, fullUser, info, isAutonomous, persistStep = null) {
  const sub = fullUser.subscription;
  const daysLeft = sub?.expiresAt ? Math.max(0, Math.ceil((new Date(sub.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))) : 0;
  const tier = String(fullUser.partnershipTier || fullUser.donationTier || 'MEMBER').toUpperCase();
  const tierBadge = (tier === 'LORD' || tier === 'PIONEER') ? 'Pioneer Lord' : 'Clarion Partner';
  const expiryFormatted = sub?.expiresAt
    ? new Date(sub.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Active';

  const autoPledge = isAutonomous
    ? `⚡ *100% ₦0 CAPITAL COMMITMENT*\n` +
      `Your Autonomous AI Mode is active & running 100% free for *${daysLeft} days* (${tierBadge} Privilege).\n` +
      `AI answers your customers, calculates prices, and delivers data automatically 24/7 while you sleep or attend CDS.\n` +
      `Complimentary trial active until: *${expiryFormatted}*.`
    : `📱 *STORE MODE: MANUAL*\n` +
      `You can process customer orders manually with text commands anytime.`;

  const finalChecklist = `✅ *YOU'RE FULLY OPERATIONAL, ${info.partnerName}!*\n` +
    `──────────────\n\n` +
    `Your digital telecom franchise is officially active:\n\n` +
    `📦 *SALES COMMANDS*\n` +
    `· *DATA* — View full data catalog\n` +
    `· *CHECK [net] [size]* — Instant price check\n` +
    `· *ORDER [size] [phone]* — Manual customer order\n` +
    `· *ORDERS* — Live order feed & delivery status\n\n` +
    `💰 *WALLET & CASHOUT*\n` +
    `· *BALANCE* — Real-time earnings & wallet balance\n` +
    `· *WITHDRAW [amount]* — Payout to your verified bank\n\n` +
    `📢 *MARKETING & LAUNCH*\n` +
    `· *PROMO* — Launch & monitor customer giveaways\n` +
    `· *STATUS* — View & toggle daily WhatsApp status\n` +
    `· *KIT* — Store graphics & marketing assets\n` +
    `· *ANNOUNCE* — Toggle first-contact greeting banner\n\n` +
    `🤖 *AUTOMATION*\n` +
    `· *MODE* — View AI autopilot status\n\n` +
    `──────────────\n` +
    `${autoPledge}\n\n` +
    `──────────────\n` +
    `_The Clarion team is with you. Build something great! 🚀🇳🇬_`;

  await sock.sendMessage(from, { text: finalChecklist });
  if (persistStep) {
    await persistStep(null, { onboardingComplete: true });
  } else {
    const payload = { onboardingStep: null, onboardingComplete: true };
    if (db.users) {
      if (fullUser.uid) await db.users.doc(fullUser.uid).set(payload, { merge: true }).catch(() => {});
      if (from && from !== fullUser.uid) await db.users.doc(from).set(payload, { merge: true }).catch(() => {});
    }
    if (mockUserStore && typeof mockUserStore.has === 'function') {
      if (fullUser.uid && mockUserStore.has(fullUser.uid)) Object.assign(mockUserStore.get(fullUser.uid), payload);
      if (from && mockUserStore.has(from)) Object.assign(mockUserStore.get(from), payload);
    }
  }
}

export { sessionManager };
export default sessionManager;

