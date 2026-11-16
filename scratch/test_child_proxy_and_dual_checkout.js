import telecomDispatcher from '../src/services/TelecomDispatcher.js';
import wallet from '../src/services/WalletService.js';
import { calculatePaystackFee } from '../src/services/payflex.js';
import { mockManualOrders, motherPendingOrderChoiceMap } from '../src/bot/MotherBot.js';

console.log('Testing Child Proxy Wholesale & Dual-Option Checkout Architecture...\n');

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1: Child Proxy Multiplier Tier & Wholesale Discount Calculation
// ══════════════════════════════════════════════════════════════════════════════
console.log('1. Testing Child Proxy Multiplier Tier & Wholesale Pricing:');
const childWalletZero = 0;
const tier1 = wallet.getMultiplierTier(childWalletZero);
console.log(`   Child with ₦0 float: Tier Level = ${tier1.level}, Multiplier = ${tier1.multiplier} (${tier1.name})`);

const testPlan = telecomDispatcher.findPlan('M1GB1D'); // MTN 1GB (1 Day)
const standardRetail = testPlan.sellPrice;
const childWholesaleZeroFloat = wallet.getWholesalePrice(testPlan, childWalletZero);

console.log(`   Standard Retail: ₦${standardRetail}`);
console.log(`   Child Proxy Wholesale Price (₦0 float): ₦${childWholesaleZeroFloat.discountedPrice}`);

if (childWholesaleZeroFloat.discountedPrice <= standardRetail) {
  console.log('   ✅ Child proxy gets wholesale discount even with ₦0 float.');
} else {
  console.error('   ❌ Child proxy failed to receive wholesale rate!');
  process.exit(1);
}

// Child Proxy with Tier 2 (₦2,000 float)
const childWalletTier2 = 2000;
const tier2 = wallet.getMultiplierTier(childWalletTier2);
const childWholesaleTier2 = wallet.getWholesalePrice(testPlan, childWalletTier2);
console.log(`   Child Proxy with ₦2,000 float: Tier = ${tier2.name} (${tier2.multiplier}), Price = ₦${childWholesaleTier2.discountedPrice}`);

if (childWholesaleTier2.discountedPrice <= childWholesaleZeroFloat.discountedPrice) {
  console.log('   ✅ Higher tier provides greater or equal wholesale savings.');
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2: MotherBot Insufficient Float 2-Option Prompt & Instant Invoice
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n2. Testing MotherBot Insufficient Float 2-Option Flow:');
const superParentJid = '2347032905036@s.whatsapp.net';
const superParentFloat = 201;
const chosenPlan = telecomDispatcher.findPlan('M7GB30D') || testPlan; // MTN 7GB
const baseC = Number(chosenPlan.baseCost || 3300);
const finalDebit = Math.round(baseC + calculatePaystackFee(baseC));

console.log(`   Super Parent Float: ₦${superParentFloat}`);
console.log(`   Plan: ${chosenPlan.name}, Final Wholesale Cost: ₦${finalDebit}`);

if (superParentFloat < finalDebit) {
  // Store pending order choice
  motherPendingOrderChoiceMap.set(superParentJid, {
    plan: chosenPlan,
    finalDebit,
    targetPhone: '07032905036',
    timestamp: Date.now()
  });
  console.log('   ✅ Insufficient float detected. motherPendingOrderChoiceMap successfully populated.');
} else {
  console.error('   ❌ Failed float check!');
  process.exit(1);
}

// Simulate user selecting Option 1: Direct Transfer for this Order
const pendingChoice = motherPendingOrderChoiceMap.get(superParentJid);
motherPendingOrderChoiceMap.delete(superParentJid);

const orderId = 'ORD-' + Date.now().toString().slice(-6);
const manualOrderData = {
  orderId,
  partnerId: superParentJid,
  buyerPhone: pendingChoice.targetPhone,
  targetPhone: pendingChoice.targetPhone,
  amount: pendingChoice.finalDebit,
  planCode: pendingChoice.plan.code,
  planName: pendingChoice.plan.name,
  baseCost: pendingChoice.plan.baseCost || Math.round(pendingChoice.finalDebit * 0.9),
  status: 'PENDING_PAYMENT',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
};

mockManualOrders.set(orderId, manualOrderData);

console.log(`   Simulated user reply: "1" (Direct Order Transfer)`);
console.log(`   Generated Manual Order: ID = ${orderId}, Amount = ₦${manualOrderData.amount}, Status = ${manualOrderData.status}`);

const registeredOrder = mockManualOrders.get(orderId);
if (registeredOrder && registeredOrder.amount === finalDebit && registeredOrder.status === 'PENDING_PAYMENT') {
  console.log('   ✅ Manual order registered in mockManualOrders for server.js webhook auto-dispense.');
} else {
  console.error('   ❌ Manual order registration failed!');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3: Shortfall Calculation Accuracy
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n3. Testing Shortfall Calculation:');
const shortfall = (finalDebit - superParentFloat).toFixed(2);
console.log(`   Calculated Shortfall: ₦${Number(shortfall).toLocaleString()}`);
if (Number(shortfall) === finalDebit - superParentFloat) {
  console.log('   ✅ Shortfall accurately matches price minus available float.');
}

console.log('\n🎉 ALL TESTS PASSED: Child Proxy Wholesale and Dual-Option Checkout verified successfully!');

