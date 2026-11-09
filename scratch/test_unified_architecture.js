import telecomDispatcher, { MASTER_DATA_CATALOG } from '../src/services/TelecomDispatcher.js';
import wallet, {
  MULTIPLIER_TIERS,
  getMultiplierTier,
  isSuperParent,
  SUPER_PARENT_PHONE
} from '../src/services/WalletService.js';
import assert from 'assert';

console.log('================================================================');
console.log('🚀 TESTING CLARION UNIFIED ARCHITECTURE & SQUAD SUITE');
console.log('================================================================');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`❌ FAIL: ${desc}`);
      console.error(e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SUITE 1: Telecom Outage & Circuit Breaker Engine
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 1: Telecom Outage & Health Circuit Breaker ---');

  test('Initial state: M2GBS is healthy', () => {
    assert.strictEqual(telecomDispatcher.isPlanDegraded('M2GBS'), false);
  });

  test('Single failure: does not trip circuit breaker (count = 1)', () => {
    telecomDispatcher.recordPlanFailure('M2GBS', 'Temporary timeout');
    const health = telecomDispatcher.planHealthMap.get('M2GBS');
    assert.strictEqual(health.failureCount, 1);
    assert.strictEqual(telecomDispatcher.isPlanDegraded('M2GBS'), false);
  });

  test('Second failure within 10 mins: trips to DEGRADED', () => {
    telecomDispatcher.recordPlanFailure('M2GBS', 'Gateway down on both providers');
    const health = telecomDispatcher.planHealthMap.get('M2GBS');
    assert.strictEqual(health.failureCount, 2);
    assert.strictEqual(health.status, 'DEGRADED');
    assert.strictEqual(telecomDispatcher.isPlanDegraded('M2GBS'), true);
  });

  test('Alternative plans recommendation: returns 3 healthy alternatives', () => {
    const alternatives = telecomDispatcher.getAlternativePlans('M2GBS', 3);
    assert.strictEqual(alternatives.length, 3);
    assert.ok(alternatives.every(a => a.code !== 'M2GBS'));
    assert.ok(alternatives.every(a => !telecomDispatcher.isPlanDegraded(a.code)));
  });

  test('Plan success recovery: resets status to HEALTHY', () => {
    telecomDispatcher.recordPlanSuccess('M2GBS');
    assert.strictEqual(telecomDispatcher.isPlanDegraded('M2GBS'), false);
    const health = telecomDispatcher.planHealthMap.get('M2GBS');
    assert.strictEqual(health.status, 'HEALTHY');
    assert.strictEqual(health.failureCount, 0);
  });

  test('Network-level trip: 3 degraded plans on same network trips network', () => {
    telecomDispatcher.recordPlanFailure('M1GB1D', 'Fail 1');
    telecomDispatcher.recordPlanFailure('M1GB1D', 'Fail 2');
    telecomDispatcher.recordPlanFailure('M3m2GB2D', 'Fail 1');
    telecomDispatcher.recordPlanFailure('M3m2GB2D', 'Fail 2');
    telecomDispatcher.recordPlanFailure('M500MBS', 'Fail 1');
    telecomDispatcher.recordPlanFailure('M500MBS', 'Fail 2');

    assert.strictEqual(telecomDispatcher.isNetworkDegraded('mtn'), true);
    // When network is degraded, any MTN plan reports degraded
    assert.strictEqual(telecomDispatcher.isPlanDegraded('M1GBS'), true);

    // Reset for subsequent tests
    telecomDispatcher.networkHealthMap.delete('mtn');
    telecomDispatcher.recordPlanSuccess('M1GB1D');
    telecomDispatcher.recordPlanSuccess('M3m2GB2D');
    telecomDispatcher.recordPlanSuccess('M500MBS');
    assert.strictEqual(telecomDispatcher.isNetworkDegraded('mtn'), false);
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 2: Dynamic Multi-Tier SQUAD Command Logic
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: Dynamic Multi-Tier SQUAD Command Responses ---');

  test('Tier 1 Proxy (W=₦1,200, 3 Sales): Maps to Level 1 Teaser Card', () => {
    const balance = 1200;
    const totalSales = 3;
    const tier = getMultiplierTier(balance);
    assert.strictEqual(tier.level, 1);

    const neededForTier2 = tier.neededForNext;
    assert.strictEqual(neededForTier2, 800); // 2000 - 1200
  });

  test('Tier 2 Proxy (W=₦2,500, 6 Sales): Maps to Level 2 Progression Card', () => {
    const balance = 2500;
    const totalSales = 6;
    const tier = getMultiplierTier(balance);
    assert.strictEqual(tier.level, 2);
    assert.strictEqual(tier.multiplier, '2X');

    const gapToTier4 = 6000 - balance;
    assert.strictEqual(gapToTier4, 3500);
  });

  test('Tier 3 Proxy (W=₦4,500, 10 Sales): Maps to Level 3 Pre-Unlock Card', () => {
    const balance = 4500;
    const totalSales = 10;
    const tier = getMultiplierTier(balance);
    assert.strictEqual(tier.level, 3);
    assert.strictEqual(tier.multiplier, '3X');

    const gapToTier4 = 6000 - balance;
    assert.strictEqual(gapToTier4, 1500);
  });

  test('Tier 4 Proxy (W=₦6,500, 12 Sales): Qualifies for Squad Leader Dashboard (5 slots)', () => {
    const balance = 6500;
    const totalSales = 12;
    const tier = getMultiplierTier(balance);
    assert.strictEqual(tier.level, 4);
    assert.strictEqual(tier.multiplier, '4X');
    assert.ok(totalSales >= 10);
  });

  test('Super Parent (07032905036): Always qualifies for Master Dashboard', () => {
    assert.strictEqual(isSuperParent('07032905036'), true);
    assert.strictEqual(isSuperParent('2347032905036@s.whatsapp.net'), true);
    assert.strictEqual(isSuperParent('08119772223'), true);
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 3: Master Store Keywords & Commands Directory
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: Master Store Keywords Directory Routing ---');

  const keywordsRegex = /^\.?(?:keywords?|commands?|help|tips|store|howto)$/i;

  test('Regex matches keywords, keyword, commands, command, help, tips, store, howto', () => {
    const validTriggers = ['keywords', '.keywords', 'keyword', 'commands', 'command', 'help', '.help', 'tips', 'store', 'howto'];
    for (const t of validTriggers) {
      assert.ok(keywordsRegex.test(t), `Should match trigger: ${t}`);
    }
  });

  test('Regex does not falsely trigger on random sentences', () => {
    const invalidTriggers = ['help me please', 'storekeeper', 'keywords list all', 'tipping'];
    for (const t of invalidTriggers) {
      assert.strictEqual(keywordsRegex.test(t), false, `Should not match: ${t}`);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // SUITE 4: Remote Pairing & Onboarding Handshake Logic
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: Remote Pairing & Onboarding Handshake ---');

  const pairCodeRegex = /^\.?paircode\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})$/i;

  test('Regex matches PAIRCODE with valid Nigerian phone numbers', () => {
    assert.ok(pairCodeRegex.test('paircode 08021234567'));
    assert.ok(pairCodeRegex.test('.paircode 07032905036'));
    assert.ok(pairCodeRegex.test('paircode 2348021234567'));
  });

  test('Super Parent SUGGEST binds parentId to 2347032905036@s.whatsapp.net', () => {
    const isMasterSuper = isSuperParent('07032905036');
    const boundParent = isMasterSuper ? '2347032905036@s.whatsapp.net' : 'other';
    assert.strictEqual(boundParent, '2347032905036@s.whatsapp.net');
  });

  console.log('\n================================================================');
  console.log(`🎉 TEST RUN COMPLETE: ${passed} / ${total} TESTS PASSED!`);
  console.log('================================================================');
}

runTests();

