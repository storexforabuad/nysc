import { parentPort, workerData } from 'worker_threads';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { logger } from '../config/env.js';
import { db } from '../services/firebase.js';
import { handleProxyMessage } from './ProxyBot.js';
import contactBackupService from '../services/ContactBackupService.js';

const { user, baileysVersion, sessionsDir, pairingMode, isPairingCode, motherBotJid, motherBotLid } = workerData;
if (motherBotJid) user.motherBotJid = motherBotJid;
if (motherBotLid) user.motherBotLid = motherBotLid;

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
        printQRInTerminal: !!(pairingMode && !isPairingCode),
        syncFullHistory: true
    };

    if (isPairingCode) {
        config.browser = Browsers.macOS('Chrome');
    }

    const sock = socketFunction(config);
    let hasEverConnected = false;
    let hasRunHistorySync = false;

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
        const targetContactsUid = user.contactsUid || user.phoneJid || user.uid;
        for (const msg of m.messages) {
            const remoteJid = msg.key?.remoteJid;
            const isFromMe = !!msg.key?.fromMe;
            if (remoteJid && !remoteJid.endsWith('@g.us')) {
                logger.info(`[PROXY] Inbound message for ${user.uid} from ${remoteJid} (fromMe=${isFromMe})`);
            }
            // Passive contact harvester: capture incoming 1-on-1 contact
            if (msg.key && msg.key.remoteJid && msg.key.remoteJid.endsWith('@s.whatsapp.net') && !msg.key.fromMe && db.users && targetContactsUid) {
                const senderJid = msg.key.remoteJid;
                const cleanPhone = senderJid.split('@')[0];
                if (!senderJid.startsWith('120363') && cleanPhone.length >= 10 && cleanPhone.length <= 14) {
                    const pushName = msg.pushName || 'Customer';
                    try {
                        db.users.doc(targetContactsUid).collection('contacts').doc(senderJid).set({
                            phone: cleanPhone,
                            pushName,
                            lastSeen: new Date().toISOString()
                        }, { merge: true }).catch(() => {});
                    } catch (e) {}
                }
            }
            await handleProxyMessage(sock, msg, user);
        }
    });

    // Ingest historical contacts and 1-on-1 chats on connection sync
    sock.ev.on('messaging-history.set', async ({ chats, contacts }) => {
        if (!db.users || !user.uid) return;
        if (hasRunHistorySync) return;
        hasRunHistorySync = true;
        const targetContactsUid = user.contactsUid || user.phoneJid || user.uid;
        try {
            const BATCH_SIZE = 450;
            let batch = db.users.firestore.batch();
            let count = 0;
            const seen = new Set();

            if (Array.isArray(contacts)) {
                for (const c of contacts) {
                    const jid = c.id;
                    if (!jid || !jid.endsWith('@s.whatsapp.net') || jid.startsWith('120363')) continue;
                    const cleanPhone = jid.split('@')[0];
                    if (cleanPhone.length < 10 || cleanPhone.length > 14) continue;
                    if (seen.has(jid)) continue;
                    seen.add(jid);
                    const docRef = db.users.doc(targetContactsUid).collection('contacts').doc(jid);
                    batch.set(docRef, {
                        phone: cleanPhone,
                        pushName: c.notify || c.name || c.verifiedName || 'Customer',
                        syncedFromWhatsApp: true,
                        source: 'history_sync'
                    }, { merge: true });
                    count++;
                    if (count % BATCH_SIZE === 0) {
                        await batch.commit();
                        batch = db.users.firestore.batch();
                    }
                }
            }

            if (Array.isArray(chats)) {
                for (const ch of chats) {
                    const jid = ch.id;
                    if (!jid || !jid.endsWith('@s.whatsapp.net') || jid.startsWith('120363')) continue;
                    const cleanPhone = jid.split('@')[0];
                    if (cleanPhone.length < 10 || cleanPhone.length > 14) continue;
                    if (seen.has(jid)) continue;
                    seen.add(jid);
                    const docRef = db.users.doc(targetContactsUid).collection('contacts').doc(jid);
                    batch.set(docRef, {
                        phone: cleanPhone,
                        pushName: ch.name || 'Customer',
                        syncedFromWhatsApp: true,
                        source: 'chat_history'
                    }, { merge: true });
                    count++;
                    if (count % BATCH_SIZE === 0) {
                        await batch.commit();
                        batch = db.users.firestore.batch();
                    }
                }
            }

            if (count % BATCH_SIZE !== 0) {
                await batch.commit();
            }

            if (count > 0) {
                logger.info(`[WORKER] Ingested ${count} contacts/chats from WhatsApp history sync for ${user.uid} (target: ${targetContactsUid})`);
            }
            parentPort.postMessage({ type: 'contacts_synced', count });
        } catch (e) {
            logger.warn(`Failed to process history sync for ${user.uid}: ${e.message}`);
            parentPort.postMessage({ type: 'contacts_synced', count: 0 });
        }
    });

    // Auto-sync contacts from WhatsApp into Firestore
    sock.ev.on('contacts.upsert', async (contacts) => {
        if (!contacts || !Array.isArray(contacts) || !db.users || !user.uid) return;
        const targetContactsUid = user.contactsUid || user.phoneJid || user.uid;
        try {
            const BATCH_SIZE = 450;
            let batch = db.users.firestore.batch();
            let count = 0;
            for (const c of contacts) {
                const jid = c.id;
                if (!jid || !jid.endsWith('@s.whatsapp.net') || jid.startsWith('120363')) continue;
                const cleanPhone = jid.split('@')[0];
                if (cleanPhone.length < 10 || cleanPhone.length > 14) continue;
                const docRef = db.users.doc(targetContactsUid).collection('contacts').doc(jid);
                batch.set(docRef, {
                    phone: cleanPhone,
                    pushName: c.notify || c.name || c.verifiedName || 'Customer',
                    syncedFromWhatsApp: true
                }, { merge: true });
                count++;
                if (count % BATCH_SIZE === 0) {
                    await batch.commit();
                    batch = db.users.firestore.batch();
                }
            }
            if (count % BATCH_SIZE !== 0) await batch.commit();
            if (count > 0) {
                logger.info(`[WORKER] Live synced ${count} contacts for ${user.uid} (target: ${targetContactsUid})`);
            }
        } catch (e) {
            logger.warn(`Failed to sync WhatsApp contacts for ${user.uid}: ${e.message}`);
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
        } else if (msg.type === 'status') {
            const { imageItems, statusJidList } = msg;
            const statusJid = 'status@broadcast';
            const randomDelay = (minMs, maxMs) => new Promise(r => setTimeout(r, minMs + Math.floor(Math.random() * (maxMs - minMs))));
            try {
                let resolvedJids = statusJidList;
                if (!resolvedJids || resolvedJids.length === 0) {
                    resolvedJids = await getStatusRecipients(user);
                }
                resolvedJids = (resolvedJids || []).filter(j => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
                const sendOptions = resolvedJids && resolvedJids.length > 0 ? { statusJidList: resolvedJids } : {};

                for (const item of imageItems) {
                    const imgPath = item.imagePath || item.path;
                    const caption = item.caption || 'Clarion status update.';
                    if (fs.existsSync(imgPath)) {
                        await sock.sendPresenceUpdate('composing', statusJid);
                        await randomDelay(1200, 2500);
                        await sock.sendMessage(statusJid, {
                            image: fs.readFileSync(imgPath),
                            caption
                        }, sendOptions);
                        await randomDelay(2000, 4000);
                    }
                }
                await sock.sendPresenceUpdate('paused', statusJid);
            } catch (e) {
                logger.error(`[WORKER] Status post failed:`, e.message);
            }
        } else if (msg.type === 'notify_customer') {
            const { targetJid, message } = msg;
            try {
                await sock.sendPresenceUpdate('composing', targetJid);
                await new Promise(r => setTimeout(r, 1000));
                await sock.sendMessage(targetJid, { text: message });
            } catch (e) {
                logger.error(`[WORKER] Failed to send customer notification: ${e.message}`);
            }
        } else if (msg.type === 'notify_owner') {
            const { message } = msg;
            const ownerJid = user.phoneJid || user.uid;
            try {
                await sock.sendMessage(ownerJid, { text: message });
            } catch (e) {
                logger.error(`[WORKER] Failed to send owner alert: ${e.message}`);
            }
        } else if (msg.type === 'text_status') {
            const { text, statusJidList, requestId } = msg;
            const statusJid = 'status@broadcast';
            try {
                // If socket is not yet open, wait up to 6 seconds for connection
                let waitAttempts = 0;
                while ((!sock || sock.ws?.readyState !== 1) && waitAttempts < 12) {
                    await new Promise(r => setTimeout(r, 500));
                    waitAttempts++;
                }

                let resolvedJids = statusJidList;
                if (!resolvedJids || resolvedJids.length === 0) {
                    resolvedJids = await getStatusRecipients(user, sock);
                }
                resolvedJids = (resolvedJids || []).filter(j => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));

                // Never broadcast without populated statusJidList to avoid silent Baileys dropping
                if (!resolvedJids || resolvedJids.length === 0) {
                    const fallback = user.ownerJid || user.motherBotJid || '2347032905036@s.whatsapp.net';
                    resolvedJids = [fallback];
                }

                await sock.sendMessage(statusJid, { text }, { statusJidList: resolvedJids });
                logger.info(`[WORKER] Posted text status for ${user.uid} (${resolvedJids.length} recipients)`);
                parentPort.postMessage({ type: 'status_post_result', requestId, success: true, count: resolvedJids.length });
            } catch (e) {
                logger.error(`[WORKER] Text status post failed for ${user.uid}: ${e.message}`);
                parentPort.postMessage({ type: 'status_post_result', requestId, success: false, error: e.message, count: 0 });
            }
        } else if (msg.type === 'backup_contacts') {
            const { requesterJid, requestId } = msg;
            try {
                const storeName = user.brandName || user.franchiseName || ('Clarion - ' + (user.verifiedName || user.name || 'Store'));
                const result = await contactBackupService.executeBackup(user.uid, sock, storeName);
                
                // If requesterJid provided, dispatch .vcf document on WhatsApp
                if (requesterJid && result.vcf) {
                    const cleanPhone = (user.phoneNumber || user.uid).replace(/\D/g, '');
                    await sock.sendMessage(requesterJid, {
                        document: Buffer.from(result.vcf, 'utf-8'),
                        fileName: `Clarion_Contacts_Backup_${cleanPhone}.vcf`,
                        mimetype: 'text/vcard',
                        caption: `✅ *WhatsApp Contacts Backup Completed!*\n\n` +
                            `📱 *Total Contacts Backed Up:* ${result.count}\n` +
                            `📁 *Format:* Standard vCard (.vcf)\n\n` +
                            `💡 *Tip:* Tap the attached file above to import/restore these contacts into your phone address book or Google Contacts.\n\n` +
                            `🎯 *Status Reach:* Your WhatsApp Status updates will now reach all ${result.count} contacts!`
                    });
                }
                parentPort.postMessage({ type: 'backup_result', requestId, success: true, count: result.count });
            } catch (err) {
                logger.error(`[WORKER] Backup contacts failed for ${user.uid}: ${err.message}`);
                parentPort.postMessage({ type: 'backup_result', requestId, success: false, error: err.message, count: 0 });
            }
        } else if (msg.type === 'update_user') {
            if (msg.updates) {
                Object.assign(user, msg.updates);
                logger.info(`[WORKER] User state hot-reloaded for ${user.uid}: botMode=${user.botMode}, approved=${user.terminalApproved}`);
            }
        }
    });
}

process.on('uncaughtException', (err) => {
    logger.error(err, '[WORKER UNCAUGHT EXCEPTION]');
});

process.on('unhandledRejection', (reason) => {
    logger.error(reason, '[WORKER UNHANDLED REJECTION]');
});

startWorker().catch(e => {
    logger.error(e, '[WORKER] Failed to start');
    process.exit(1);
});

async function getStatusRecipients(user, sock = null) {
    const recipients = new Set();
    const cleanDigits = (jid) => String(jid || '').replace(/[^0-9]/g, '');

    const myJid = sock?.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
    const userPhoneJid = user.phoneJid || (user.phoneNumber ? `${cleanDigits(user.phoneNumber)}@s.whatsapp.net` : null);

    // 1. Owner & MotherBot
    if (user.ownerJid && user.ownerJid.endsWith('@s.whatsapp.net')) recipients.add(user.ownerJid);
    if (user.motherBotJid && user.motherBotJid.endsWith('@s.whatsapp.net')) recipients.add(user.motherBotJid);

    // 2. If Child Bot: Always include Parent JID so Parent can view Child's status story
    if (user.parentId) {
        const parentPhone = cleanDigits(user.parentId);
        if (parentPhone.length >= 10 && parentPhone.length <= 14) {
            recipients.add(`${parentPhone}@s.whatsapp.net`);
        }
    }

    // 3. If Parent Bot: Query all active Child Proxies under this parent so Children can view Parent's status
    if (db.users && (!user.parentId || user.role === 'PARENT')) {
        try {
            const squadSnap = await db.users.where('parentId', '==', user.uid).get();
            squadSnap.forEach(doc => {
                const childData = doc.data() || {};
                const cPhone = cleanDigits(childData.phoneNumber || doc.id);
                if (cPhone.length >= 10 && cPhone.length <= 14 && !cPhone.startsWith('120363')) {
                    recipients.add(`${cPhone}@s.whatsapp.net`);
                }
            });
        } catch (e) {
            logger.warn(`Could not fetch squad children for parent status broadcast: ${e.message}`);
        }
    }

    // 4. Harvested contacts from Firestore (strictly validating valid mobile lengths)
    const targetContactsUid = user.contactsUid || user.phoneJid || user.uid;
    if (db.users && targetContactsUid) {
        try {
            const snap = await db.users.doc(targetContactsUid).collection('contacts').limit(500).get();
            snap.forEach(doc => {
                const rawId = doc.id;
                const d = doc.data() || {};
                const cPhone = cleanDigits(d.phone || rawId);
                // Exclude group IDs (120363...) and non-phones
                if (rawId.startsWith('120363') || cPhone.startsWith('120363') || cPhone.length > 14 || cPhone.length < 10) {
                    return;
                }
                if (rawId.endsWith('@s.whatsapp.net')) {
                    recipients.add(rawId);
                } else if (cPhone.length >= 10 && cPhone.length <= 14) {
                    recipients.add(`${cPhone}@s.whatsapp.net`);
                }
            });
        } catch (e) {
            logger.warn(`Could not fetch contacts for status broadcast: ${e.message}`);
        }
    }

    // Crucial: remove the bot's own self-JID from statusJidList to avoid encryption drop
    if (myJid) recipients.delete(myJid);
    if (userPhoneJid) recipients.delete(userPhoneJid);

    // Filter strictly to valid @s.whatsapp.net contacts that are NOT group IDs
    const finalRecipients = Array.from(recipients).filter(j => 
        typeof j === 'string' && 
        j.endsWith('@s.whatsapp.net') && 
        !j.startsWith('120363') && 
        j.split('@')[0].length >= 10 && 
        j.split('@')[0].length <= 14
    );

    // If still empty, add default admin fallback so encryption keys can be issued
    if (finalRecipients.length === 0) {
        finalRecipients.push('2347032905036@s.whatsapp.net');
    }

    return finalRecipients;
}
