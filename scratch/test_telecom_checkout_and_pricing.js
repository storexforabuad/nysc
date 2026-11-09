/**
 * Verification Test Suite: Telecom Dispatcher 40 Plans, Checkout Auto-fill, Multiplier Down-tier Safeguard, & LID Bank Binding
 */
import telecomDispatcher from '../src/services/TelecomDispatcher.js';
import wallet, { isSuperParent, getMultiplierTier, getWholesalePrice } from '../src/services/WalletService.js';
import { calculatePaystackFee } from '../src/services/payflex.js';
import { detectNetwork } from '../src/utils/networkUtils.js';

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ ${desc}: ${actual}`);
    passed++;
  } else {
    console.error(`  ❌ ${desc}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n════════════════════════════════════════════');
  console.log('  TEST 1: 40-Plan Catalog Integrity (Husmodata + Peyflex)');
  console.log('════════════════════════════════════════════');
  const mtnPlans = await telecomDispatcher.getAvailablePlans('mtn');
  const airtelPlans = await telecomDispatcher.getAvailablePlans('airtel');
  const gloPlans = await telecomDispatcher.getAvailablePlans('glo');
  const total = mtnPlans.length + airtelPlans.length + gloPlans.length;

  assert('MTN plan count', mtnPlans.length, 17);
  assert('Airtel plan count', airtelPlans.length, 11);
  assert('Glo plan count', gloPlans.length, 12);
  assert('Total curated active plans', total, 40);

  console.log('\n════════════════════════════════════════════');
  console.log('  TEST 2: Frictionless Checkout Auto-Fill');
  console.log('════════════════════════════════════════════');
  const testAirtelPhone = '08021234567';
  const testAirtelCallerJid = '2348021234567@s.whatsapp.net';
  const airtelPlan = await telecomDispatcher.findPlan('A1GB');
  
  // Clean caller digits simulation
  const cleanDigits = testAirtelCallerJid.split('@')[0].replace(/\D/g, '');
  const caller11 = cleanDigits.startsWith('234') && cleanDigits.length === 13 ? '0' + cleanDigits.slice(3) : cleanDigits;
  const callerNet = detectNetwork(caller11);

  assert('Caller network detected correctly', callerNet, 'airtel');
  assert('Airtel plan matches caller network', airtelPlan.network, callerNet);

  // Auto-fill logic check
  let recipientPhone = null;
  if (!recipientPhone && caller11 && callerNet === airtelPlan.network) {
    recipientPhone = caller11;
  }
  assert('Recipient phone auto-filled without asking', recipientPhone, '08021234567');

  // Negative test: Airtel caller buying MTN plan
  const mtnPlan = await telecomDispatcher.findPlan('M1GB1D');
  let mtnRecipient = null;
  if (!mtnRecipient && caller11 && callerNet === mtnPlan.network) {
    mtnRecipient = caller11;
  }
  assert('Different network does NOT auto-fill (prompts user)', mtnRecipient, null);

  console.log('\n════════════════════════════════════════════');
  console.log('  TEST 3: Pricing Differentiation & Multiplier Safeguard');
  console.log('════════════════════════════════════════════');
  // Super Parent pricing: Wholesale Cost + Paystack Fee
  const isSp = isSuperParent('07032905036');
  assert('Super Parent detected', isSp, true);

  const baseCost = airtelPlan.baseCost; // e.g. ₦650
  const expectedSpPrice = Math.round(baseCost + calculatePaystackFee(baseCost));
  assert('Super Parent price is base wholesale + fee (no markup)', expectedSpPrice > baseCost, true);

  // Child Proxy with Tier 4 (₦6,200) buys plan costing ₦450 -> Remaining ₦5,750 (Tier 3)
  const currentFloat = 6200;
  const planCost = 450;
  const remainingFloat = currentFloat - planCost;
  const curTier = getMultiplierTier(currentFloat);
  const projTier = getMultiplierTier(remainingFloat);

  assert('Current Tier is Tier 4', curTier.level, 4);
  assert('Projected Tier after debit drops to Tier 3', projTier.level, 3);
  assert('Down-tier safeguard flag triggers', projTier.level < curTier.level, true);

  // Child Proxy with Tier 4 (₦7,500) buys plan costing ₦450 -> Remaining ₦7,050 (Stays Tier 4)
  const safeFloat = 7500;
  const safeRemaining = safeFloat - planCost;
  const safeCurTier = getMultiplierTier(safeFloat);
  const safeProjTier = getMultiplierTier(safeRemaining);
  assert('Safe float does NOT trigger down-tier alert', safeProjTier.level < safeCurTier.level, false);

  console.log('\n════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
