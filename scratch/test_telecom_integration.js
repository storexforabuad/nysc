import telecomDispatcher, { MASTER_DATA_CATALOG } from '../src/services/TelecomDispatcher.js';
import { detectNetwork } from '../src/utils/networkUtils.js';

console.log('--- RUNNING INTEGRATION TESTS ---');

// 1. Plan Counts
const allPlans = await telecomDispatcher.getAvailablePlans();
console.log(`Total plans in catalog: ${allPlans.length} (Expected: 40)`);
if (allPlans.length !== 40) throw new Error('Catalog plan count mismatch!');

const mtnPlans = await telecomDispatcher.getAvailablePlans('mtn');
console.log(`MTN plans: ${mtnPlans.length} (Expected: 17)`);
if (mtnPlans.length !== 17) throw new Error('MTN plan count mismatch!');

const gloPlans = await telecomDispatcher.getAvailablePlans('glo');
console.log(`Glo plans: ${gloPlans.length} (Expected: 12)`);
if (gloPlans.length !== 12) throw new Error('Glo plan count mismatch!');

const airtelPlans = await telecomDispatcher.getAvailablePlans('airtel');
console.log(`Airtel plans: ${airtelPlans.length} (Expected: 11)`);
if (airtelPlans.length !== 11) throw new Error('Airtel plan count mismatch!');

// 2. Clean Names Check (No SME, Share, Corporate Gifting, Awoof)
const forbiddenJargon = ['sme', 'share', 'corporate', 'gifting', 'awoof'];
for (const p of allPlans) {
  const lowerName = p.name.toLowerCase();
  for (const jargon of forbiddenJargon) {
    if (lowerName.includes(jargon) && !lowerName.includes('binge')) {
      throw new Error(`Forbidden jargon found in plan name: "${p.name}" (code: ${p.code})`);
    }
  }
}
console.log('✅ All plan names are clean and jargon-free!');

// 3. A25GB Price Check
const a25gb = telecomDispatcher.findPlan('A25GB');
console.log(`A25GB Sell Price: ₦${a25gb.sellPrice} (Expected: ₦8200)`);
if (a25gb.sellPrice !== 8200) throw new Error('A25GB price should be 8200!');

// 4. Lookups by Code and Serial
const m1 = telecomDispatcher.findPlan('M1GB1D');
const g1 = telecomDispatcher.findPlan('G2m5GB');
const s38 = telecomDispatcher.findPlan(38);
console.log(`Lookup M1GB1D: ${m1 ? m1.name : 'FAIL'}`);
console.log(`Lookup G2m5GB: ${g1 ? g1.name : 'FAIL'}`);
console.log(`Lookup Serial 38: ${s38 ? s38.code : 'FAIL'}`);

// 5. Network Detection Check
const testNumbers = [
  { phone: '08031234567', expected: 'mtn' },
  { phone: '08021234567', expected: 'airtel' },
  { phone: '08051234567', expected: 'glo' },
  { phone: '08091234567', expected: '9mobile' }
];

for (const t of testNumbers) {
  const detected = detectNetwork(t.phone);
  if (detected !== t.expected) {
    throw new Error(`detectNetwork failed for ${t.phone}: got ${detected}, expected ${t.expected}`);
  }
}
console.log('✅ Network prefix detection verified for all 4 networks!');

console.log('🎉 ALL INTEGRATION TESTS PASSED PERFECTLY!');

