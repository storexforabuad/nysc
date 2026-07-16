import { parentPort, workerData } from 'worker_threads';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleProxyMessage } from './ProxyBot.js';

const { user, baileysVersion, sessionsDir, pairingMode, isPairingCode } = workerData;

async function startWorker(isInitialBoot = true) {
    const sessionKey = user.phoneJid || user.uid;
    const authPath = path.join(sessionsDir, `proxy_${sessionKey}`);

    // Only clear stale sessions on the very first boot of a pairing worker.
    // If Baileys forces a standard reconnect (e.g. status 515), we MUST preserve the keys.
    if (pairingMode && isInitialBoot) {
        if (fs.existsSync(authPath)) {
            try { fs.rmSync(authPath, { recursive: true, force: true }); } catch (e) { }
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const socketFunction = makeWASocket.default || makeWASocket;

    const config = {
        version: baileysVersion || [6, 33, 0],
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !!(pairingMode && !isPairingCode)
    };

    if (isPairingCode) {
        config.browser = Browsers.macOS('Chrome');
    }

    const sock = socketFunction(config);
    let hasEverConnected = false;

    // ── Outbound Response Deduplication Cache ──
    const originalSendMessage = sock.sendMessage.bind(sock);
    const outboundDebounce = new Map();
    sock.sendMessage = async (jid, content, options) => {
        if (content && content.text) {
            // Hash the text + JID, retaining 6 seconds in memory memory
            const hash = `${jid}_${Buffer.from(content.text.substring(0, 35)).toString('base64')}`;
            const lastSent = outboundDebounce.get(hash) || 0;
            if (Date.now() - lastSent < 6000) {
                logger.info(`[DEDUPE] Dropped duplicate outgoing msg to ${jid}`);
                return {}; // safely return dummy object like Baileys
            }
            outboundDebounce.set(hash, Date.now());
        }
        return originalSendMessage(jid, content, options);
    };

    sock.ev.on('creds.update', saveCreds);

    if (pairingMode && isPairingCode) {
        // Pairing Code Flow (if needed)
        try {
            const phoneNumber = user.uid.split('@')[0];
            const code = await sock.requestPairingCode(phoneNumber);
            parentPort.postMessage({ type: 'pairing_code', code });
        } catch (e) {
            parentPort.postMessage({ type: 'error', message: e.message });
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, isNewLogin, qr } = update;

        if (qr && pairingMode && !isPairingCode) {
            // Forward QR to main thread so it can trigger MotherBot alerts
            parentPort.postMessage({ type: 'qr', qr });
        }

        if (isNewLogin) {
            parentPort.postMessage({ type: 'new_login' });
        }

        if (connection === 'open') {
            hasEverConnected = true;
            parentPort.postMessage({ type: 'open' });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            parentPort.postMessage({ type: 'close', shouldReconnect, hasEverConnected, statusCode });

            if (shouldReconnect) {
                setTimeout(() => startWorker(false), 2000);
            } else {
                process.exit(0);
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
            await handleProxyMessage(sock, msg, user);
        }
    });

    // Handle incoming IPC messages (like broadcast jobs)
    parentPort.on('message', async (msg) => {
        if (msg.type === 'broadcast') {
            const { targetJid, detectedNetwork, finalMessage, imagePaths } = msg;
            const randomDelay = (minMs, maxMs) => new Promise(r => setTimeout(r, minMs + Math.floor(Math.random() * (maxMs - minMs))));
            try {
                for (const imgPath of imagePaths) {
                    if (fs.existsSync(imgPath)) {
                        await sock.sendPresenceUpdate('composing', targetJid);
                        await randomDelay(1500, 3000);
                        await sock.sendMessage(targetJid, {
                            image: fs.readFileSync(imgPath),
                            caption: `📶 Beautiful discounts for your ${detectedNetwork?.toUpperCase() || ''} network!`
                        });
                        await randomDelay(3000, 6000);
                    }
                }

                await sock.sendPresenceUpdate('composing', targetJid);
                await randomDelay(2000, 4000);
                await sock.sendMessage(targetJid, { text: finalMessage });
                await sock.sendPresenceUpdate('paused', targetJid);
            } catch (e) {
                logger.error(`[WORKER] Broadcast send failed:`, e.message);
            }
        }
    });
}

startWorker().catch(e => {
    logger.error('[WORKER] Failed to start:', e.message);
    process.exit(1);
});
