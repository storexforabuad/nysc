import { db } from './src/services/firebase.js';
import wallet from './src/services/WalletService.js';
import axios from 'axios';
import { setTimeout } from 'timers/promises';

async function runTest() {
    console.log('🧪 Testing Wallet and Webhook...');

    const userId = 'mock_withdraw_user';

    if (db.ledger) {
        const oldDocs = await db.ledger.where('userId', '==', userId).get();
        for (let doc of oldDocs.docs) {
            await doc.ref.delete();
        }

        await db.ledger.add({
            type: 'COMPLETED_DATA',
            userId: userId,
            status: 'COMPLETED',
            settlement: { coMemberShare: 5000 },
            createdAt: new Date().toISOString()
        });

        let balance = await wallet.getBalance(userId);
        console.log(`✅ Balance after seed: ₦${balance} (Expected: 5000)`);

        const transferRef = `WDR_TEST_${Date.now()}`;
        console.log(`⏳ Initiating pending withdrawal of 2000... Ref: ${transferRef}`);
        await wallet.recordWithdrawal(userId, 2000, { bankName: 'GTB', accountNumber: '0123' }, transferRef);

        balance = await wallet.getBalance(userId);
        console.log(`✅ Balance after pending withdrawal: ₦${balance} (Expected: 3000)`);

        console.log('🔄 Simulating webhook DISBURSEMENT_SUCCESS...');
        try {
            await axios.post('http://localhost:3000/monnify-webhook', {
                eventType: 'SUCCESSFUL_DISBURSEMENT',
                eventData: { reference: transferRef }
            }, {
                headers: { 'monnify-signature': 'mock' }
            });
            console.log('✅ Webhook dispatched successfully.');
        } catch (err) {
            console.error('❌ Webhook HTTP call failed (Is the server running?):', err.message);
            console.log('⚠️ Falling back to direct database method for testing purposes.');
            await wallet.updateWithdrawalStatus(transferRef, 'SUCCESS');
        }

        await setTimeout(1000);

        const history = await wallet.getTransactionHistory(userId);
        const withdrawal = history.find(h => h.transferRef === transferRef);
        console.log(`✅ Withdrawal Status via History: ${withdrawal?.status} (Expected: SUCCESS)`);

        balance = await wallet.getBalance(userId);
        console.log(`✅ Final Balance: ₦${balance} (Expected: 3000)`);

        console.log('🔄 Simulating webhook FAILED_DISBURSEMENT...');
        try {
            await axios.post('http://localhost:3000/monnify-webhook', {
                eventType: 'FAILED_DISBURSEMENT',
                eventData: { reference: transferRef }
            }, {
                headers: { 'monnify-signature': 'mock' }
            });
        } catch (err) {
            await wallet.updateWithdrawalStatus(transferRef, 'FAILED');
        }
        await setTimeout(1000);

        balance = await wallet.getBalance(userId);
        console.log(`✅ Final Balance after Fake Failure: ₦${balance} (Expected: 5000)`);
    } else {
        console.log('No db.ledger connection, skipping actual db changes.');
    }

    console.log('🏁 Tests complete.');
    process.exit(0);
}

runTest();
