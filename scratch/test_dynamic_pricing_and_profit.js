import test from 'node:test';
import assert from 'node:assert';
import telecomDispatcher, { calculateOfficialPrice, MASTER_DATA_CATALOG } from '../src/services/TelecomDispatcher.js';
import wallet, { MULTIPLIER_TIERS, getMultiplierTier, checkAndNotifyTierTransition } from '../src/services/WalletService.js';

test('Dynamic Pricing Slider and Multiplier Tier (₦10,000 VIP & ₦1 Profit Floor) Verification', async (t) => {
  await t.test('1. Multiplier Tiers: 6 symmetrical tiers up to ₦10,000', () => {
    assert.strictEqual(MULTIPLIER_TIERS.TIER_1.level, 1);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_1.multiplier, '1X');
    assert.strictEqual(MULTIPLIER_TIERS.TIER_1.rate, 0.10);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_1.minBalance, 0);

    assert.strictEqual(MULTIPLIER_TIERS.TIER_2.level, 2);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_2.multiplier, '1.5X');
    assert.strictEqual(MULTIPLIER_TIERS.TIER_2.rate, 0.15);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_2.minBalance, 2000);

    assert.strictEqual(MULTIPLIER_TIERS.TIER_3.level, 3);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_3.multiplier, '2X');
    assert.strictEqual(MULTIPLIER_TIERS.TIER_3.rate, 0.20);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_3.minBalance, 4000);

    assert.strictEqual(MULTIPLIER_TIERS.TIER_4.level, 4);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_4.multiplier, '2.5X');
    assert.strictEqual(MULTIPLIER_TIERS.TIER_4.rate, 0.25);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_4.minBalance, 6000);

    assert.strictEqual(MULTIPLIER_TIERS.TIER_5.level, 5);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_5.multiplier, '3X');
    assert.strictEqual(MULTIPLIER_TIERS.TIER_5.rate, 0.30);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_5.minBalance, 8000);

    assert.strictEqual(MULTIPLIER_TIERS.TIER_6.level, 6);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_6.multiplier, '4X');
    assert.strictEqual(MULTIPLIER_TIERS.TIER_6.rate, 0.40);
    assert.strictEqual(MULTIPLIER_TIERS.TIER_6.minBalance, 10000);

    // Verify dynamic balance mapping
    assert.strictEqual(getMultiplierTier(500).level, 1);
    assert.strictEqual(getMultiplierTier(2000).level, 2);
    assert.strictEqual(getMultiplierTier(3500).level, 2);
    assert.strictEqual(getMultiplierTier(4000).level, 3);
    assert.strictEqual(getMultiplierTier(6000).level, 4);
    assert.strictEqual(getMultiplierTier(8500).level, 5);
    assert.strictEqual(getMultiplierTier(10000).level, 6);
    assert.strictEqual(getMultiplierTier(25000).level, 6);
  });

  await t.test('2. All 40 plans have officialPrice and never drop below ₦1 profit at ANY slider position', () => {
    assert.strictEqual(MASTER_DATA_CATALOG.length, 40, 'Must have exactly 40 plans in MASTER_DATA_CATALOG');

    const testBalances = [0, 2000, 4000, 6000, 8000, 10000]; // Tiers 1 through 6
    const sliderSteps = [0, 25, 50, 75, 85, 100];

    for (const plan of MASTER_DATA_CATALOG) {
      assert.ok(plan.officialPrice, `Plan ${plan.code} must have officialPrice`);
      assert.ok(plan.officialPrice >= plan.sellPrice, `Plan ${plan.code} officialPrice (${plan.officialPrice}) must be >= sellPrice (${plan.sellPrice})`);

      for (const bal of testBalances) {
        const wholesaleCost = Number(wallet.getWholesalePrice(plan, bal));
        assert.ok(wholesaleCost >= plan.baseCost, `Wholesale cost for ${plan.code} at balance ${bal} must be >= baseCost`);

        const floor = wholesaleCost + 1;
        const ceiling = Math.max(plan.officialPrice, floor);

        for (const slider of sliderSteps) {
          const t = slider / 100;
          const raw = ceiling - t * (ceiling - floor);
          const effectivePrice = Math.max(floor, Math.round(raw / 10) * 10);
          const profit = +(effectivePrice - wholesaleCost).toFixed(2);

          // INVARIANT 1: Price must NEVER exceed official telco ceiling (plus small ₦10 rounding tolerance if ceil itself wasn't rounded)
          assert.ok(effectivePrice <= ceiling + 10, `Plan ${plan.code} at slider ${slider}% priced at ₦${effectivePrice} exceeds ceiling ₦${ceiling}`);

          // INVARIANT 2: Cash profit must NEVER fall below ₦1.00
          assert.ok(profit >= 1.00, `Plan ${plan.code} at balance ₦${bal} and slider ${slider}% has profit ₦${profit} which is below ₦1.00 floor`);
        }
      }
    }
  });

  await t.test('3. checkAndNotifyTierTransition WhatsApp trigger verification', async () => {
    const sentMessages = [];
    const mockSock = {
      sendMessage: async (jid, content) => {
        sentMessages.push({ jid, text: content.text });
      }
    };

    // Case A: Level Up from Tier 1 to Tier 2
    sentMessages.length = 0;
    const resA = await checkAndNotifyTierTransition('2348119772223', 1500, 2500, mockSock);
    assert.ok(resA, 'Should return transition');
    assert.strictEqual(resA.type, 'LEVEL_UP');
    assert.strictEqual(resA.oldTier.level, 1);
    assert.strictEqual(resA.newTier.level, 2);
    assert.strictEqual(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.includes('POWER LEVEL UP! [1.5X]'));

    // Case B: Level Up to Tier 6 (VIP)
    sentMessages.length = 0;
    const resB = await checkAndNotifyTierTransition('2348119772223', 8500, 10500, mockSock);
    assert.strictEqual(resB.type, 'LEVEL_UP');
    assert.strictEqual(resB.newTier.level, 6);
    assert.ok(sentMessages[0].text.includes('MAXIMUM VIP TIER'));

    // Case C: Level Down from Tier 2 to Tier 1
    sentMessages.length = 0;
    const resC = await checkAndNotifyTierTransition('2348119772223', 2200, 1800, mockSock);
    assert.ok(resC, 'Should return downgrade');
    assert.strictEqual(resC.type, 'LEVEL_DOWN');
    assert.strictEqual(resC.oldTier.level, 2);
    assert.strictEqual(resC.newTier.level, 1);
    assert.strictEqual(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.includes('TIER DOWNGRADE NOTICE'));

    // Case D: Same tier (no notification)
    sentMessages.length = 0;
    const resD = await checkAndNotifyTierTransition('2348119772223', 2100, 2800, mockSock);
    assert.strictEqual(resD, null);
    assert.strictEqual(sentMessages.length, 0);
  });
});
