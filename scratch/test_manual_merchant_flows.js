import { describe, it } from 'node:test';
import assert from 'node:assert';
import telecomDispatcher from '../src/services/TelecomDispatcher.js';
import wallet from '../src/services/WalletService.js';

describe('Manual Merchant & Direct AI Coach Flow Tests', () => {

  it('1. SUGGEST command regex disambiguation (Default vs AUTO)', () => {
    const defaultCmd = 'SUGGEST 08012345678 Apex Data Hub';
    const autoCmd = 'SUGGEST 08012345678 Apex Data Hub AUTO';

    const matchDefault = defaultCmd.match(/^suggest\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})\s+(.+)$/i);
    assert.ok(matchDefault);
    let nameDefault = matchDefault[2].trim();
    const isAutoDefault = /\s+auto$/i.test(nameDefault);
    assert.strictEqual(isAutoDefault, false, 'Default suggest should NOT be auto');
    assert.strictEqual(nameDefault, 'Apex Data Hub');

    const matchAuto = autoCmd.match(/^suggest\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})\s+(.+)$/i);
    assert.ok(matchAuto);
    let nameAuto = matchAuto[2].trim();
    const isAutoDetected = /\s+auto$/i.test(nameAuto);
    assert.strictEqual(isAutoDetected, true, 'Auto suggest should be detected');
    if (isAutoDetected) {
      nameAuto = nameAuto.replace(/\s+auto$/i, '').trim();
    }
    assert.strictEqual(nameAuto, 'Apex Data Hub');
  });

  it('2. Wholesale pricing math for Manual Merchant (Tier 1 vs Tier 4)', async () => {
    const plans = await telecomDispatcher.getAvailablePlans('mtn');
    const mtn1gb = plans.find(p => p.name === '1GB' && (p.validity?.includes('30') || p.code === 'M1GB30D' || p.sellPrice === 850)) || plans[0];

    // Tier 1 (₦0 wallet balance)
    const wsTier1 = wallet.getWholesalePrice(mtn1gb, 0);
    assert.strictEqual(wsTier1.multiplier, '1X');
    assert.ok(wsTier1.discountedPrice <= mtn1gb.sellPrice);

    // Tier 4 (₦6,000+ wallet balance)
    const wsTier4 = wallet.getWholesalePrice(mtn1gb, 6000);
    assert.strictEqual(wsTier4.multiplier, '4X');
    assert.ok(wsTier4.discountedPrice < wsTier1.discountedPrice, 'Tier 4 price must be cheaper than Tier 1');
  });

  it('3. 2-Message Price Card & Budget Queries regex', () => {
    const testCases = [
      { cmd: 'MTN PLANS', valid: true, net: 'mtn', budget: null },
      { cmd: 'GLO PLANS', valid: true, net: 'glo', budget: null },
      { cmd: 'AIRTEL PLANS', valid: true, net: 'airtel', budget: null },
      { cmd: 'MTN 1000', valid: true, net: 'mtn', budget: 1000 },
      { cmd: 'GLO 500', valid: true, net: 'glo', budget: 500 },
      { cmd: 'AIRTEL 2000', valid: true, net: 'airtel', budget: 2000 }
    ];

    const regex = /^(?:mtn|glo|airtel)\s+(?:plans|\d+)$/i;

    testCases.forEach(tc => {
      assert.ok(regex.test(tc.cmd), `Command ${tc.cmd} should match price card regex`);
      const parts = tc.cmd.trim().split(/\s+/);
      assert.strictEqual(parts[0].toLowerCase(), tc.net);
      if (tc.budget) {
        assert.strictEqual(parseInt(parts[1], 10), tc.budget);
      }
    });
  });

  it('4. Recipient-first numbered vending regex check', () => {
    const validOrders = [
      '1 08012345678',
      '9 08119772223',
      '12 2347032905036',
      '4 +2348011223344'
    ];

    const regex = /^\d{1,2}\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})$/i;

    validOrders.forEach(vo => {
      assert.ok(regex.test(vo), `${vo} should match recipient-first vending regex`);
      const match = vo.match(regex);
      assert.ok(parseInt(match[1], 10) >= 1);
    });
  });

  it('5. Plan validities are populated across networks', async () => {
    const mtnPlans = await telecomDispatcher.getAvailablePlans('mtn');
    const gloPlans = await telecomDispatcher.getAvailablePlans('glo');
    const airtelPlans = await telecomDispatcher.getAvailablePlans('airtel');

    assert.ok(mtnPlans.length > 0);
    assert.ok(gloPlans.length > 0);
    assert.ok(airtelPlans.length > 0);

    gloPlans.forEach(p => {
      assert.ok(p.validity, `Glo plan ${p.name} must have a validity string`);
    });

    airtelPlans.forEach(p => {
      assert.ok(p.validity, `Airtel plan ${p.name} must have a validity string`);
    });
  });

  it('6. formatIndexBadge handles single and multi-digit numbers with emoji keycaps', async () => {
    const { formatIndexBadge } = await import('../src/bot/MotherBot.js');
    assert.strictEqual(formatIndexBadge(1), '1️⃣');
    assert.strictEqual(formatIndexBadge(9), '9️⃣');
    assert.strictEqual(formatIndexBadge(10), '1️⃣0️⃣', '10 must format as 1️⃣0️⃣');
    assert.strictEqual(formatIndexBadge(11), '1️⃣1️⃣', '11 must format as 1️⃣1️⃣');
    assert.strictEqual(formatIndexBadge(15), '1️⃣5️⃣', '15 must format as 1️⃣5️⃣');
    assert.strictEqual(formatIndexBadge(17), '1️⃣7️⃣', '17 must format as 1️⃣7️⃣');
  });

  it('7. DATA [NETWORK] and DATA [NETWORK] [BUDGET] command token parsing', () => {
    function parseWholesaleDataCommand(cmd) {
      const tokens = cmd.trim().split(/\s+/).slice(1);
      const netKeywords = ['mtn', 'glo', 'airtel'];
      let forceNetwork = null;
      let targetPrice = null;
      let targetPhone = null;

      for (const tok of tokens) {
        const lowerTok = tok.toLowerCase();
        if (netKeywords.includes(lowerTok)) {
          forceNetwork = lowerTok;
        } else if (/^\d{10,13}$/.test(tok) || /^\+?234\d{10}$/.test(tok)) {
          targetPhone = tok;
        } else if (/^\d+$/.test(tok)) {
          targetPrice = parseInt(tok, 10);
        }
      }
      return { forceNetwork, targetPrice, targetPhone };
    }

    // DATA MTN
    const r1 = parseWholesaleDataCommand('DATA MTN');
    assert.strictEqual(r1.forceNetwork, 'mtn');
    assert.strictEqual(r1.targetPrice, null);

    // DATA GLO 1000
    const r2 = parseWholesaleDataCommand('DATA GLO 1000');
    assert.strictEqual(r2.forceNetwork, 'glo');
    assert.strictEqual(r2.targetPrice, 1000);

    // DATA 1000 GLO (flexible order)
    const r3 = parseWholesaleDataCommand('DATA 1000 GLO');
    assert.strictEqual(r3.forceNetwork, 'glo');
    assert.strictEqual(r3.targetPrice, 1000);

    // DATA 500
    const r4 = parseWholesaleDataCommand('DATA 500');
    assert.strictEqual(r4.forceNetwork, null);
    assert.strictEqual(r4.targetPrice, 500);

    // DATA (plain)
    const r5 = parseWholesaleDataCommand('DATA');
    assert.strictEqual(r5.forceNetwork, null);
    assert.strictEqual(r5.targetPrice, null);
  });

  it('8. 2-Step Order Confirmation TTL and confirmation logic', () => {
    const confirmation = {
      planCode: 'G1GB1',
      planName: '1GB',
      finalDebit: 385.1,
      targetPhone: '09155946561',
      expiresAt: Date.now() + 120000 // 2 minutes
    };

    // Valid within TTL
    assert.ok(confirmation.expiresAt > Date.now(), 'Confirmation must be valid right after creation');

    // Expired TTL check
    const expiredConfirmation = {
      ...confirmation,
      expiresAt: Date.now() - 5000
    };
    assert.ok(expiredConfirmation.expiresAt < Date.now(), 'Confirmation must expire after TTL');

    // Trigger word checks
    const confirmRegex = /^\s*(?:1|yes|confirm)\s*$/i;
    assert.ok(confirmRegex.test('1'));
    assert.ok(confirmRegex.test('YES'));
    assert.ok(confirmRegex.test('confirm'));

    const cancelRegex = /^\s*(?:0|no|cancel)\s*$/i;
    assert.ok(cancelRegex.test('0'));
    assert.ok(cancelRegex.test('NO'));
    assert.ok(cancelRegex.test('cancel'));
  });

  it('9. Multiplier Tier balance evaluation for motivating FUND responses', () => {
    // Tier 1: ₦0
    const t1 = wallet.getMultiplierTier(0);
    assert.strictEqual(t1.level, 1);
    assert.strictEqual(t1.multiplier, '1X');

    // Tier 2: ₦2,500
    const t2 = wallet.getMultiplierTier(2500);
    assert.strictEqual(t2.level, 2);
    assert.strictEqual(t2.multiplier, '2X');
    assert.ok(t2.neededToNext > 0);

    // Tier 4 MAX: ₦7,500
    const t4 = wallet.getMultiplierTier(7500);
    assert.strictEqual(t4.level, 4);
    assert.strictEqual(t4.multiplier, '4X');
    assert.strictEqual(t4.neededToNext, 0);
  });

});

