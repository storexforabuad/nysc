import fs from 'fs';
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

function calculatePaystackFee(amount) {
  const num = Number(amount) || 0;
  if (num < 2500) {
    return Math.round(num * 0.015 * 100) / 100; // 1.5%
  }
  const fee = (num * 0.015) + 100;
  return Math.min(2000, Math.round(fee * 100) / 100);
}

// Load Husmo comparison data from earlier
const husmoData = JSON.parse(fs.readFileSync('storage/husmo_comparison.json', 'utf8'));
const husmoMap = {};
for (const h of husmoData) {
  if (h.husmoMatches && h.husmoMatches.length > 0) {
    let best = h.husmoMatches[0];
    if (h.network.includes('share') || h.network.includes('sme')) {
      const sme = h.husmoMatches.find(m => m.planType.includes('sme') || m.planType.includes('share'));
      if (sme) best = sme;
    } else if (h.network.includes('gifting')) {
      const gift = h.husmoMatches.find(m => m.planType.includes('gifting') && !m.planType.includes('corporate'));
      if (gift) best = gift;
    }
    husmoMap[h.key] = best.amount;
  }
}

const peyflexAudit = [];
const husmoAudit = [];

for (const [key, plan] of Object.entries(ACTIVE_APPROVED_PLANS)) {
  const [network, code] = key.split(':');
  const sellPrice = plan.sellPrice;
  const paystackFee = calculatePaystackFee(sellPrice);

  // Peyflex
  const peyflexBase = plan.basePrice;
  const peyflexGross = sellPrice - peyflexBase;
  const peyflexNet = Math.round((peyflexGross - paystackFee) * 100) / 100;
  const peyflexViable = peyflexNet >= 1.0;

  peyflexAudit.push({
    network,
    code,
    name: plan.name,
    sellPrice,
    basePrice: peyflexBase,
    grossMargin: peyflexGross,
    paystackFee,
    netProfit: peyflexNet,
    viable: peyflexViable
  });

  // Husmo
  const husmoBase = husmoMap[key] !== undefined ? husmoMap[key] : peyflexBase;
  const husmoGross = sellPrice - husmoBase;
  const husmoNet = Math.round((husmoGross - paystackFee) * 100) / 100;
  const husmoViable = husmoNet >= 1.0;

  husmoAudit.push({
    network,
    code,
    name: plan.name,
    sellPrice,
    basePrice: husmoBase,
    grossMargin: husmoGross,
    paystackFee,
    netProfit: husmoNet,
    viable: husmoViable
  });
}

const peyflexViableCount = peyflexAudit.filter(p => p.viable).length;
const peyflexLossCount = peyflexAudit.filter(p => !p.viable).length;

const husmoViableCount = husmoAudit.filter(p => p.viable).length;
const husmoLossCount = husmoAudit.filter(p => !p.viable).length;

console.log('================================================================================');
console.log('📊 PAYSTACK FEE ABSORPTION AUDIT (Target: Net Profit >= ₦1.00)');
console.log('================================================================================\n');

console.log(`TOTAL ACTIVE PLANS: 54\n`);

console.log(`--- [1] UNDER CURRENT PEYFLEX WHOLESALE ---`);
console.log(`✅ Profitable (Net >= ₦1.00):  ${peyflexViableCount} / 54 plans (${Math.round(peyflexViableCount/54*100)}%)`);
console.log(`❌ Loss or < ₦1 (Cannot absorb): ${peyflexLossCount} / 54 plans (${Math.round(peyflexLossCount/54*100)}%)\n`);

console.log(`--- [2] UNDER HUSMODATA WHOLESALE ---`);
console.log(`✅ Profitable (Net >= ₦1.00):  ${husmoViableCount} / 54 plans (${Math.round(husmoViableCount/54*100)}%)`);
console.log(`❌ Loss or < ₦1 (Cannot absorb): ${husmoLossCount} / 54 plans (${Math.round(husmoLossCount/54*100)}%)\n`);

console.log('================================================================================');
console.log('❌ PLANS THAT FAIL / CAUSE LOSS UNDER PEYFLEX IF WE ABSORB PAYSTACK FEE:');
console.log('================================================================================');
peyflexAudit.filter(p => !p.viable).forEach(p => {
  console.log(`• [${p.network}] ${p.name} (Sell: ₦${p.sellPrice}) | Wholesale: ₦${p.basePrice} | Gross: ₦${p.grossMargin} | Paystack Fee: ₦${p.paystackFee} | Net Profit: ₦${p.netProfit}`);
});

console.log('\n================================================================================');
console.log('✅ PLANS THAT ARE COMFORTABLY PROFITABLE UNDER PEYFLEX:');
console.log('================================================================================');
peyflexAudit.filter(p => p.viable).forEach(p => {
  console.log(`• [${p.network}] ${p.name} (Sell: ₦${p.sellPrice}) | Gross: ₦${p.grossMargin} | Paystack Fee: ₦${p.paystackFee} | Net Profit: +₦${p.netProfit}`);
});
