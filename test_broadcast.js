import { db } from './src/services/firebase.js';
import broadcastQueue from './src/services/BroadcastQueue.js';

async function testBroadcast() {
    console.log('🧪 Testing Broadcast Queue...');
    const userId = 'broadcast_test_user@s.whatsapp.net';

    const oldDocs = await db.ledger.where('userId', '==', userId).get();
    for (const doc of oldDocs.docs) {
        await doc.ref.delete();
    }

    console.log('Queuing 3 test contacts...');
    await broadcastQueue.queueBroadcast(userId, 'Mock Template', ['test1@s.whatsapp.net', 'test2@s.whatsapp.net', 'test3@s.whatsapp.net']);

    console.log('Running processQueue() - Cycle 1');
    await broadcastQueue.processQueue();

    let snaps = await db.ledger.where('userId', '==', userId).get();
    if (snaps.empty) {
        console.log('❌ Failed: document missing'); process.exit(1);
    }
    let id = snaps.docs[0].id;
    await db.ledger.doc(id).update({ lastSentAt: 0 }); // Skip 5sec jitter

    console.log('Running processQueue() - Cycle 2');
    await broadcastQueue.processQueue();

    await db.ledger.doc(id).update({ lastSentAt: 0 });

    console.log('Running processQueue() - Cycle 3');
    await broadcastQueue.processQueue();

    await db.ledger.doc(id).update({ lastSentAt: 0 });

    console.log('Running processQueue() - Cleanup Cycle 4');
    await broadcastQueue.processQueue();

    snaps = await db.ledger.where('userId', '==', userId).get();
    const finalData = snaps.docs[0].data();

    if (finalData.status === 'COMPLETED' && finalData.sentCount === 3 && finalData.targetJids.length === 0) {
        console.log('✅ Success! Broadcast queue iterated perfectly and marked batch COMPLETED.');
    } else {
        console.log('❌ Failed', finalData);
    }
    process.exit(0);
}

testBroadcast();
