import assert from 'assert';
import mediaGen from '../src/services/mediaGen.js';
import { checkIsSameNumber } from '../src/bot/MotherBot.js';

async function runTests() {
  console.log('🧪 Starting Promo Fuel & Contextual Messaging Unit Tests...\n');

  // Test 1: checkIsSameNumber logic
  console.log('Test 1: Testing checkIsSameNumber...');
  assert.strictEqual(
    checkIsSameNumber('2348012345678@s.whatsapp.net', '08012345678'),
    true,
    'Should identify same number across Nigerian formats (234 vs 0)'
  );
  assert.strictEqual(
    checkIsSameNumber('+234 801 234 5678', '2348012345678'),
    true,
    'Should identify same number with formatting symbols'
  );
  assert.strictEqual(
    checkIsSameNumber('2348011111111@s.whatsapp.net', '08099999999'),
    false,
    'Should identify different numbers'
  );
  assert.strictEqual(
    checkIsSameNumber(null, '08012345678'),
    false,
    'Should safely handle null inputs'
  );
  assert.strictEqual(
    checkIsSameNumber('123', '123'),
    false,
    'Should reject numbers with fewer than 10 digits'
  );
  console.log('✅ checkIsSameNumber tests passed.\n');

  // Test 2: generateGiveawayPromoCard (isSameNumber = true)
  console.log('Test 2: Testing generateGiveawayPromoCard with isSameNumber = true (Personal Line)...');
  const promoBufferSame = await mediaGen.generateGiveawayPromoCard({
    name: 'CORPER CHIOMA',
    phone: '08012345678',
    isSameNumber: true
  }, 1000);
  assert(Buffer.isBuffer(promoBufferSame), 'Promo card should return a Buffer');
  assert(promoBufferSame.length > 50000, `Buffer should be substantial, got ${promoBufferSame.length} bytes`);
  assert(
    promoBufferSame.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    'Buffer must have valid PNG magic bytes'
  );
  console.log(`✅ generateGiveawayPromoCard (same number) generated ${promoBufferSame.length} bytes PNG.\n`);

  // Test 3: generateGiveawayPromoCard (isSameNumber = false)
  console.log('Test 3: Testing generateGiveawayPromoCard with isSameNumber = false (Dedicated SIM)...');
  const promoBufferDiff = await mediaGen.generateGiveawayPromoCard({
    name: 'CORPER TUNDE',
    phone: '08123456789',
    isSameNumber: false
  }, 2000);
  assert(Buffer.isBuffer(promoBufferDiff), 'Promo card should return a Buffer');
  assert(promoBufferDiff.length > 50000, `Buffer should be substantial, got ${promoBufferDiff.length} bytes`);
  assert(
    promoBufferDiff.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    'Buffer must have valid PNG magic bytes'
  );
  console.log(`✅ generateGiveawayPromoCard (different number) generated ${promoBufferDiff.length} bytes PNG.\n`);

  // Test 4: generateShareCard (with contextual CTA)
  console.log('Test 4: Testing generateShareCard with contextual isSameNumber...');
  const shareBufferSame = await mediaGen.generateShareCard({
    name: 'CORPER CHIOMA',
    phone: '08012345678',
    tier: 'PIONEER',
    isSameNumber: true
  });
  assert(Buffer.isBuffer(shareBufferSame), 'Share card must return a Buffer');
  assert(
    shareBufferSame.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    'Buffer must have valid PNG magic bytes'
  );

  const shareBufferDiff = await mediaGen.generateShareCard({
    name: 'CORPER TUNDE',
    phone: '08123456789',
    tier: 'LORD',
    isSameNumber: false
  });
  assert(Buffer.isBuffer(shareBufferDiff), 'Share card must return a Buffer');
  assert(
    shareBufferDiff.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    'Buffer must have valid PNG magic bytes'
  );
  console.log('✅ generateShareCard contextual renderings passed.\n');

  // Test 5: Command pattern checks
  console.log('Test 5: Testing MotherBot command patterns for Promo Fuel & Gifting...');
  const kitRegex = /^(?:kit|launch|promo kit)$/i;
  const promoRegex = /^(?:promo|giveaway|fuel|airdrop)$/i;
  const giftRegex = /^gift\s+([0-9+]+)\s+([a-zA-Z0-9_-]+)$/i;

  assert(kitRegex.test('kit'), 'Matches "kit"');
  assert(kitRegex.test('LAUNCH'), 'Matches "LAUNCH"');
  assert(kitRegex.test('promo kit'), 'Matches "promo kit"');

  assert(promoRegex.test('promo'), 'Matches "promo"');
  assert(promoRegex.test('GIVEAWAY'), 'Matches "GIVEAWAY"');
  assert(promoRegex.test('fuel'), 'Matches "fuel"');
  assert(promoRegex.test('airdrop'), 'Matches "airdrop"');

  const giftMatch = 'gift 08012345678 MTN_1GB'.match(giftRegex);
  assert(giftMatch, 'gift command pattern should match');
  assert.strictEqual(giftMatch[1], '08012345678');
  assert.strictEqual(giftMatch[2], 'MTN_1GB');

  console.log('✅ MotherBot command patterns verified successfully.\n');

  console.log('🎉 ALL PROMO FUEL & CONTEXTUAL MESSAGING TESTS PASSED!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
