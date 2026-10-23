import paystack from '../src/services/PaystackService.js';
import { matchBank } from '../src/utils/bankUtils.js';
import crypto from 'crypto';
import { config } from '../src/config/env.js';

async function testIntegration() {
    console.log('====================================================');
    console.log('🧪 RUNNING COMPREHENSIVE PAYSTACK INTEGRATION TEST');
    console.log('====================================================\n');

    // 1. Bank matching test
    console.log('1️⃣ Testing Bank Resolution & Matching:');
    const banks = await paystack.getBanks();
    const testCases = ['gtb', 'gtbank', 'access', 'opay', 'palmpay', 'kuda', 'moniepoint', 'zenith', 'first bank', 'uba'];
    for (const input of testCases) {
        const matched = matchBank(banks, input);
        if (matched) {
            console.log(`   ✔️ "${input}" ➔ ${matched.name} (Code: ${matched.code})`);
        } else {
            console.log(`   ❌ "${input}" NOT matched!`);
        }
    }

    // 2. Real account validation test (using standard test or GTBank lookup)
    console.log('\n2️⃣ Testing Account Name Validation (validateBankAccount):');
    try {
        const gtbank = matchBank(banks, 'gtb');
        // Test account resolution endpoint
        const res = await paystack.validateBankAccount(gtbank.code, '0123456789').catch(e => ({ error: e.message }));
        console.log(`   Result for GTBank 0123456789:`, res);
    } catch (e) {
        console.log(`   Validation caught: ${e.message}`);
    }

    // 3. Checkout transaction initialization
    console.log('\n3️⃣ Testing Checkout Link Generation (initializeTransaction):');
    try {
        const init = await paystack.initializeTransaction({
            email: 'corpsmember@clarionhub.ng',
            amountNaira: 1000,
            reference: `test_checkout_${Date.now()}`,
            metadata: {
                userId: '2348012345678@s.whatsapp.net',
                purpose: 'WALLET_FUNDING'
            }
        });
        console.log(`   ✔️ Success:`, init.success);
        console.log(`   🔗 Checkout URL:`, init.authorizationUrl);
        console.log(`   🔑 Reference:`, init.reference);
    } catch (e) {
        console.log(`   ❌ Checkout link error:`, e.message);
    }

    // 4. Webhook signature test
    console.log('\n4️⃣ Testing Webhook Signature Verification:');
    const samplePayload = {
        event: 'charge.success',
        data: {
            reference: 'test_ref_123',
            amount: 50000,
            status: 'success'
        }
    };
    const rawPayloadString = JSON.stringify(samplePayload);
    const validSignature = crypto
        .createHmac('sha512', config.paystack.secretKey)
        .update(rawPayloadString)
        .digest('hex');

    const isValid = paystack.verifyWebhookSignature(validSignature, samplePayload);
    const isInvalid = paystack.verifyWebhookSignature('bad_signature', samplePayload);
    console.log(`   ✔️ Valid signature check:`, isValid ? 'PASSED' : 'FAILED');
    console.log(`   ✔️ Tampered signature rejection:`, !isInvalid ? 'PASSED' : 'FAILED');

    // 5. Virtual account test
    console.log('\n5️⃣ Testing Dedicated Virtual Account Generator:');
    try {
        const account = await paystack.createVirtualAccount(
            'Clarion AI - Apex Telecom',
            'partner@clarionhub.ng',
            '08012345678'
        );
        console.log(`   ✔️ Generated Virtual Account:`, account);
    } catch (e) {
        console.log(`   Virtual account result:`, e.message);
    }

    console.log('\n====================================================');
    console.log('🎉 ALL PAYSTACK INTEGRATION TESTS COMPLETED!');
    console.log('====================================================\n');
}

testIntegration().catch(err => console.error('Test run failed:', err));
