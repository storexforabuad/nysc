import wallet, {
    calculateNetProfit,
    getWholesalePrice,
    getMultiplierTier,
    MULTIPLIER_TIERS,
    isSuperParent,
    WITHDRAWAL_FEES
} from '../src/services/WalletService.js';
import telecomDispatcher from '../src/services/TelecomDispatcher.js';
import { calculatePaystackFee } from '../src/services/payflex.js';

console.log('================================================================');
console.log('🚀 TESTING CLARION DYNAMIC MULTIPLIER (1X–4X) SETTLEMENT ENGINE');
console.log('================================================================\n');

let failedTests = 0;

function assert(condition, testName, details = '') {
    if (condition) {
        console.log(`✅ PASS: ${testName}`);
    } else {
        console.error(`❌ FAIL: ${testName} - ${details}`);
        failedTests++;
    }
}

// ── Test 1: Identity of Super Parent (07032905036 / MGL) ──
console.log('--- TEST 1: Super Parent Identity ---');
assert(isSuperParent('07032905036'), '07032905036 recognized as Super Parent');
assert(isSuperParent('2347032905036@s.whatsapp.net'), 'Super Parent JID recognized');
assert(isSuperParent('08119772223'), '08119772223 recognized as Super Parent Alt');
assert(!isSuperParent('08012345678'), 'Regular proxy not recognized as Super Parent');

// ── Test 2: Net Profit & Paystack Fee Absorption ──
console.log('\n--- TEST 2: Net Profit & Paystack Fee Absorption ---');
// Scenario 1: MTN 2GB 7-Days (M2GBS) S = 1200, C = 735
const fee1 = calculatePaystackFee(1200);
const p1 = calculateNetProfit(1200, 735);
assert(fee1 === 18, `Paystack fee for ₦1,200 is ₦18 (got: ${fee1})`);
assert(p1 === 447, `Net profit for ₦1,200 - ₦735 - ₦18 is ₦447 (got: ${p1})`);

// Scenario 2: Airtel 10GB 30-Days (A10GB) S = 3900, C = 3020
const fee2 = calculatePaystackFee(3900);
const p2 = calculateNetProfit(3900, 3020);
assert(fee2 === 159, `Paystack fee for ₦3,900 is ₦159 (got: ${fee2})`);
assert(p2 === 721, `Net profit for ₦3,900 - ₦3,020 - ₦159 is ₦721 (got: ${p2})`);

// ── Test 3: Multiplier Tiers (1X, 2X, 3X, 4X at ₦2k/₦4k/₦6k) ──
console.log('\n--- TEST 3: Multiplier Tiers Evaluation (₦2k / ₦4k / ₦6k Thresholds) ---');
const t1 = getMultiplierTier(1500); // < 2,000
assert(t1.level === 1 && t1.multiplier === '1X' && t1.rate === 0.10, 'W=₦1,500 maps to Tier 1 (1X)');
assert(t1.nextThreshold === 2000 && t1.neededToNext === 500, 'Tier 1 needs ₦500 to reach Tier 2');

const t2 = getMultiplierTier(2800); // 2,000 - 3,999
assert(t2.level === 2 && t2.multiplier === '2X' && t2.rate === 0.20, 'W=₦2,800 maps to Tier 2 (2X)');
assert(t2.nextThreshold === 4000 && t2.neededToNext === 1200, 'Tier 2 needs ₦1,200 to reach Tier 3');

const t3 = getMultiplierTier(4500); // 4,000 - 5,999
assert(t3.level === 3 && t3.multiplier === '3X' && t3.rate === 0.30, 'W=₦4,500 maps to Tier 3 (3X)');
assert(t3.nextThreshold === 6000 && t3.neededToNext === 1500, 'Tier 3 needs ₦1,500 to reach Tier 4');

const t4 = getMultiplierTier(7000); // >= 6,000
assert(t4.level === 4 && t4.multiplier === '4X' && t4.rate === 0.40, 'W=₦7,000 maps to Tier 4 (4X Max Power)');
assert(t4.nextThreshold === null && t4.neededToNext === 0, 'Tier 4 has maximum multiplier unlocked');

// ── Test 4: Dynamic Co-Funding Split Across All 4 Tiers ──
console.log('\n--- TEST 4: Multiplier Profit Allocation (MTN 2GB: S=1200, C=735, P=447) ---');

// Tier 1 (1X): W = ₦1,000 -> Proxy 10% (₦44.70), Parent 80% (₦357.60), Platform 10% (₦44.70)
const splitT1 = wallet.calculateDynamicSettlement({ sellPrice: 1200, wholesaleCost: 735, walletBalance: 1000, proxyId: 'agent1' });
assert(splitT1.multiplier === '1X' && splitT1.proxyRate === 0.10, 'Tier 1 assigns 1X rate (10%)');
assert(splitT1.proxyShare === 44.70, `Tier 1 Proxy gets ₦44.70 (got: ${splitT1.proxyShare})`);
assert(splitT1.superParentShare === 357.60, `Tier 1 Parent gets ₦357.60 (got: ${splitT1.superParentShare})`);
assert(splitT1.platformShare === 44.70, `Platform gets ₦44.70 (got: ${splitT1.platformShare})`);
const sumT1 = +(splitT1.proxyShare + splitT1.superParentShare + splitT1.platformShare).toFixed(2);
assert(sumT1 === 447.00, `Zero leakage on Tier 1 (Sum: ${sumT1} === 447)`);

// Tier 2 (2X): W = ₦2,500 -> Proxy 20% (₦89.40), Parent 70% (₦312.90), Platform 10% (₦44.70)
const splitT2 = wallet.calculateDynamicSettlement({ sellPrice: 1200, wholesaleCost: 735, walletBalance: 2500, proxyId: 'agent2' });
assert(splitT2.multiplier === '2X' && splitT2.proxyRate === 0.20, 'Tier 2 assigns 2X rate (20%)');
assert(splitT2.proxyShare === 89.40, `Tier 2 Proxy gets ₦89.40 (got: ${splitT2.proxyShare})`);
assert(splitT2.superParentShare === 312.90, `Tier 2 Parent gets ₦312.90 (got: ${splitT2.superParentShare})`);
const sumT2 = +(splitT2.proxyShare + splitT2.superParentShare + splitT2.platformShare).toFixed(2);
assert(sumT2 === 447.00, `Zero leakage on Tier 2 (Sum: ${sumT2} === 447)`);

// Tier 3 (3X): W = ₦4,500 -> Proxy 30% (₦134.10), Parent 60% (₦268.20), Platform 10% (₦44.70)
const splitT3 = wallet.calculateDynamicSettlement({ sellPrice: 1200, wholesaleCost: 735, walletBalance: 4500, proxyId: 'agent3' });
assert(splitT3.multiplier === '3X' && splitT3.proxyRate === 0.30, 'Tier 3 assigns 3X rate (30%)');
assert(splitT3.proxyShare === 134.10, `Tier 3 Proxy gets ₦134.10 (got: ${splitT3.proxyShare})`);
assert(splitT3.superParentShare === 268.20, `Tier 3 Parent gets ₦268.20 (got: ${splitT3.superParentShare})`);
const sumT3 = +(splitT3.proxyShare + splitT3.superParentShare + splitT3.platformShare).toFixed(2);
assert(sumT3 === 447.00, `Zero leakage on Tier 3 (Sum: ${sumT3} === 447)`);

// Tier 4 (4X): W = ₦6,500 -> Proxy 40% (₦178.80), Parent 50% (₦223.50), Platform 10% (₦44.70)
const splitT4 = wallet.calculateDynamicSettlement({ sellPrice: 1200, wholesaleCost: 735, walletBalance: 6500, proxyId: 'agent4' });
assert(splitT4.multiplier === '4X' && splitT4.proxyRate === 0.40, 'Tier 4 assigns 4X rate (40%)');
assert(splitT4.proxyShare === 178.80, `Tier 4 Proxy gets ₦178.80 (got: ${splitT4.proxyShare})`);
assert(splitT4.superParentShare === 223.50, `Tier 4 Parent gets ₦223.50 (got: ${splitT4.superParentShare})`);
const sumT4 = +(splitT4.proxyShare + splitT4.superParentShare + splitT4.platformShare).toFixed(2);
assert(sumT4 === 447.00, `Zero leakage on Tier 4 (Sum: ${sumT4} === 447)`);

// ── Test 5: Wholesale Personal & Gift Discount Scaling ──
console.log('\n--- TEST 5: Wholesale Personal & Gift Discount Scaling ---');
const samplePlan = { sellPrice: 1200, baseCost: 735 };

const w1 = getWholesalePrice(samplePlan, 1000); // Tier 1: 1X (10% off profit)
assert(w1.discountAmount === 44.70 && w1.discountedPrice === 1155.30, `Tier 1 (1X) saves ₦44.70 -> pays ₦1,155.30 (got: ${w1.discountedPrice})`);

const w2 = getWholesalePrice(samplePlan, 2500); // Tier 2: 2X (20% off profit)
assert(w2.discountAmount === 89.40 && w2.discountedPrice === 1110.60, `Tier 2 (2X) saves ₦89.40 -> pays ₦1,110.60 (got: ${w2.discountedPrice})`);

const w3 = getWholesalePrice(samplePlan, 4500); // Tier 3: 3X (30% off profit)
assert(w3.discountAmount === 134.10 && w3.discountedPrice === 1065.90, `Tier 3 (3X) saves ₦134.10 -> pays ₦1,065.90 (got: ${w3.discountedPrice})`);

const w4 = getWholesalePrice(samplePlan, 6500); // Tier 4: 4X (40% off profit)
assert(w4.discountAmount === 178.80 && w4.discountedPrice === 1021.20, `Tier 4 (4X) saves ₦178.80 -> pays ₦1,021.20 (got: ${w4.discountedPrice})`);

// ── Test 6: Thursday Withdrawal Fees & Minimum ──
console.log('\n--- TEST 6: Thursday Withdrawal Settings ---');
assert(WITHDRAWAL_FEES.PAYSTACK_FEE === 50.00, 'Paystack fee is ₦50.00');
assert(WITHDRAWAL_FEES.SERVICE_FEE === 50.00, 'Clarion fee is ₦50.00');
assert(WITHDRAWAL_FEES.TOTAL === 100.00, 'Total withdrawal fee is ₦100.00 flat');
assert(WITHDRAWAL_FEES.MIN_WITHDRAWAL === 2000, 'Minimum withdrawal is ₦2,000 (Tier 2 Unlock)');

// ── Test 7: Full Catalog Reconciliation Across All 40 Plans Across All 4 Multipliers ──
console.log('\n--- TEST 7: Zero-Leakage Reconciliation on All 40 Plans Across All 4 Tiers ---');
const allPlans = await telecomDispatcher.getAvailablePlans();
assert(allPlans.length === 40, `Catalog contains exactly 40 plans (got: ${allPlans.length})`);

let zeroLeakageFailures = 0;
const testBalances = [500, 2500, 4500, 7000]; // Tiers 1, 2, 3, 4

for (const plan of allPlans) {
    const s = plan.sellPrice;
    const c = plan.baseCost;
    const p = calculateNetProfit(s, c);

    if (p <= 0) continue;

    for (const bal of testBalances) {
        const res = wallet.calculateDynamicSettlement({ sellPrice: s, wholesaleCost: c, walletBalance: bal, proxyId: 'agent' });
        const sum = +(res.proxyShare + res.superParentShare + res.platformShare).toFixed(2);
        if (sum !== p) {
            zeroLeakageFailures++;
            console.error(`Leakage on plan ${plan.code} (W=${bal}): sum=${sum} vs P=${p}`);
        }
    }
}
assert(zeroLeakageFailures === 0, 'All 40 telecom plans reconcile with 100% zero-leakage precision across all 4 Multipliers');

console.log('\n================================================================');
if (failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 100% MULTIPLIER SPEC COMPLIANCE VERIFIED.');
} else {
    console.error(`⚠️ COMPLETED WITH ${failedTests} FAILED TEST(S).`);
}
console.log('================================================================');
