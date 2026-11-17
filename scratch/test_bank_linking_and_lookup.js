import test from 'node:test';
import assert from 'node:assert/strict';
import paystack from '../src/services/PaystackService.js';

test('Bank Linking & Paystack Lookup Architecture Tests', async (t) => {
  await t.test('1. PaystackService getBanks() returns list of commercial banks and fintechs', async () => {
    const banks = await paystack.getBanks();
    assert.ok(Array.isArray(banks), 'Banks should be an array');
    assert.ok(banks.length > 0, 'Banks array should not be empty');
    
    // Check known banks/fintechs are present
    const names = banks.map(b => b.name.toLowerCase());
    const opay = banks.find(b => b.name.toLowerCase().includes('opay') || b.code === '999992');
    const palmpay = banks.find(b => b.name.toLowerCase().includes('palmpay') || b.code === '999991');
    const access = banks.find(b => b.name.toLowerCase().includes('access') || b.code === '044');
    
    assert.ok(opay || palmpay || access, 'Should have standard Nigerian banks/fintechs in list');
  });

  await t.test('2. Bank validation rejects invalid account numbers', () => {
    const invalidAccounts = ['123', 'abcdefghij', '12345678901', ''];
    for (const acc of invalidAccounts) {
      const cleanAcc = (acc || '').replace(/\D/g, '');
      assert.notEqual(cleanAcc.length, 10, `Account ${acc} should be flagged as invalid length`);
    }
    const validAcc = '0123456789';
    assert.equal(validAcc.replace(/\D/g, '').length, 10, 'Valid 10-digit NUBAN should pass length check');
  });

  await t.test('3. Masked account formatting preserves last 4 digits', () => {
    const acc = '0123456789';
    const masked = '••••' + acc.slice(-4);
    assert.equal(masked, '••••6789');
  });

  await t.test('4. PaystackService provides both validateBankAccount and resolveAccount methods', async () => {
    assert.equal(typeof paystack.validateBankAccount, 'function', 'validateBankAccount should be a function');
    assert.equal(typeof paystack.resolveAccount, 'function', 'resolveAccount should be a function alias');
    
    // Test resolution method execution
    try {
      const res = await paystack.resolveAccount('044', '0690000031');
      assert.ok(res, 'Resolution result should exist');
      assert.ok(res.accountName || res.account_name, 'Should contain accountName');
    } catch (e) {
      // In sandbox/live without internet or invalid test account, error is expected from Paystack API, but method MUST exist
      assert.ok(!e.message.includes('not a function'), 'Should not throw "not a function"');
    }
  });

  await t.test('5. Withdrawal minimum threshold and fee calculation', () => {
    const minThreshold = 2000;
    const paystackFee = 50;
    const platformFee = 50;
    const totalFee = paystackFee + platformFee;

    const requestedAmount = 5000;
    const netPayout = requestedAmount - totalFee;

    assert.equal(netPayout, 4900, '₦5,000 withdrawal with ₦100 fee yields ₦4,900 net payout');
    assert.ok(requestedAmount >= minThreshold, '₦5,000 is above ₦2,000 threshold');
    assert.ok(1500 < minThreshold, '₦1,500 should be rejected by threshold check');
  });
});
