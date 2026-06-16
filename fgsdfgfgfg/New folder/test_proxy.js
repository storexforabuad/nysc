import { handleProxyMessage } from './src/bot/ProxyBot.js';

async function testProxy() {
    const dummySock = {
        sendMessage: async (to, content) => {
            console.log('Sending message to', to);
            console.log(content.text);
        }
    };

    const dummyMsg = {
        key: { remoteJid: '12345@s.whatsapp.net' },
        message: { conversation: 'data' },
        pushName: 'Debug User'
    };

    const dummyUser = { uid: 'user_123', name: 'Store Owner' };

    console.log("Starting mock proxy invocation...");
    try {
        await handleProxyMessage(dummySock, dummyMsg, dummyUser);
        console.log("Finished successfully!");
    } catch (err) {
        console.error("FATAL ERROR CAUGHT IN SCRIPT:", err);
    }
}

testProxy();
