import { calculatePaystackFee } from '../src/services/payflex.js';

const audits = [
  // MTN
  { code: 'M110MBS', name: 'MTN 110MB 1D', base: 98, newOfficial: 100 },
  { code: 'M1GB1D', name: 'MTN 1GB 1D', base: 260, newOfficial: 500 },
  { code: 'M3m2GB2D', name: 'MTN 3.2GB 2D', base: 970, newOfficial: 1000 },
  { code: 'M7GB2D', name: 'MTN 7GB 2D', base: 1745, newOfficial: 1800 },
  { code: 'M500MBS', name: 'MTN 500MB 7D', base: 300, newOfficial: 500 },
  { code: 'M1GBS', name: 'MTN 1GB 7D', base: 380, newOfficial: 800 },
  { code: 'M2GBS', name: 'MTN 2GB 7D', base: 735, newOfficial: 1350 },
  { code: 'M3GBS', name: 'MTN 3GB 7D', base: 1075, newOfficial: 1400 },
  { code: 'M1GBS2', name: 'MTN 1GB 30D', base: 392, newOfficial: 1000 },
  { code: 'M2GBS2', name: 'MTN 2GB 30D', base: 805, newOfficial: 2000 },
  { code: 'M3GBS2', name: 'MTN 3GB 30D', base: 1125, newOfficial: 2500 },
  { code: 'M5GBS', name: 'MTN 5GB 30D', base: 1610, newOfficial: 3000 },
  { code: 'M7GBS', name: 'MTN 7GB 30D', base: 3450, newOfficial: 3500 },
  { code: 'M14m5GBS', name: 'MTN 14.5GB 30D', base: 4850, newOfficial: 5000 },
  { code: 'M20GBS', name: 'MTN 20GB 30D', base: 7380, newOfficial: 7500 },
  { code: 'M25GBS', name: 'MTN 25GB 30D', base: 8850, newOfficial: 9000 },
  { code: 'M36GBS', name: 'MTN 36GB 30D', base: 10670, newOfficial: 11000 },

  // Glo
  { code: 'G2m5GB', name: 'Glo 2.5GB 2D', base: 475, newOfficial: 800 },
  { code: 'G1GB1', name: 'Glo 1GB 3D', base: 335, newOfficial: 400 },
  { code: 'G3GB1', name: 'Glo 3GB 3D', base: 850, newOfficial: 1000 },
  { code: 'G5GB1', name: 'Glo 5GB 3D', base: 1380, newOfficial: 1500 },
  { code: 'G1GB2', name: 'Glo 1GB 7D', base: 349, newOfficial: 500 },
  { code: 'G3GB2', name: 'Glo 3GB 7D', base: 990, newOfficial: 1000 },
  { code: 'G5GB2', name: 'Glo 5GB 7D', base: 1580, newOfficial: 1800 },
  { code: 'G500MB', name: 'Glo 500MB 30D', base: 200, newOfficial: 300 },
  { code: 'G1GB4', name: 'Glo 1GB 30D', base: 400, newOfficial: 500 },
  { code: 'G2GB4', name: 'Glo 2GB 30D', base: 800, newOfficial: 1000 },
  { code: 'G3GB4', name: 'Glo 3GB 30D', base: 1200, newOfficial: 1500 },
  { code: 'G5GB4', name: 'Glo 5GB 30D', base: 2000, newOfficial: 2200 }
];

console.log('='.repeat(95));
console.log(
  'Plan Name'.padEnd(20) + ' | ' +
  'Wholesale'.padEnd(10) + ' | ' +
  'Official'.padEnd(10) + ' | ' +
  'Gross Prof'.padEnd(12) + ' | ' +
  'Paystack Fee'.padEnd(14) + ' | ' +
  'Net Profit'.padEnd(12) + ' | ' +
  'Status'
);
console.log('='.repeat(95));

const problematicPlans = [];

for (const p of audits) {
  const gross = +(p.newOfficial - p.base).toFixed(2);
  const fee = calculatePaystackFee(p.newOfficial);
  const net = +(gross - fee).toFixed(2);
  
  let status = '✅ Healthy';
  if (gross <= 0) {
    status = '❌ LOSS (Gross <= 0)';
    problematicPlans.push({ ...p, reason: 'Wholesale base exceeds or equals official price' });
  } else if (net <= 0) {
    status = '⚠️ WIPED OUT by Paystack fee';
    problematicPlans.push({ ...p, reason: `Gross profit is ₦${gross}, but Paystack fee is ₦${fee}, leaving ₦${net}` });
  } else if (net < 10) {
    status = '⚡ Ultra-Thin (< ₦10)';
  }

  console.log(
    p.name.padEnd(20) + ' | ' +
    ('₦' + p.base).padEnd(10) + ' | ' +
    ('₦' + p.newOfficial).padEnd(10) + ' | ' +
    (('+₦' + gross)).padEnd(12) + ' | ' +
    (('₦' + fee)).padEnd(14) + ' | ' +
    (((net >= 0 ? '+₦' : '-₦') + Math.abs(net))).padEnd(12) + ' | ' +
    status
  );
}

console.log('='.repeat(95));
console.log('\n--- PROBLEMATIC PLANS SUMMARY ---');
console.log(JSON.stringify(problematicPlans, null, 2));

