import fs from 'fs';
import path from 'path';
import makeWASocket, { useMultiFileAuthState, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';

async function runTest() {
    const authPath = 'sessions/test_proxy';
    if (fs.existsSync(authPath)) {
        console.log("Clearing stale auth state...");
        fs.rmSync(authPath, { recursive: true, force: true });
    }

    console.log("Setting up auth state...");
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    console.log("Creating socket...");
    const socketFunction = makeWASocket.default || makeWASocket;
    const sock = socketFunction({
        version: [2, 3000, 1035194821], // same as MotherBot
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome')
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        if (update.connection) console.log("Connection state:", update.connection);
        if (update.lastDisconnect) console.error("Disconnected:", update.lastDisconnect.error?.message || "Unknown error");
    });

    console.log("Starting aggressive polling for pairing code...");
    let attemptCount = 0;
    const pollCode = async () => {
        while (true) {
            try {
                attemptCount++;
                const code = await sock.requestPairingCode("2348119772223");
                console.log(`\n✅ SUCCESS on attempt ${attemptCount}! Code:`, code);
                break;
            } catch (e) {
                if (e.message.includes('Closed') || e.message.includes('Connection')) {
                    process.stdout.write('.');
                    await new Promise(r => setTimeout(r, 250)); // poll ultra fast 4x a sec
                    continue;
                }
                console.error("\n❌ FAILED NON-CLOSE:", e.message);
                break;
            }
        }
    };

    pollCode();

    setTimeout(() => process.exit(0), 15000);
}

runTest().catch(e => console.error(e));
