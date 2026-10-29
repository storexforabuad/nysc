import fs from 'fs';
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

function calculatePaystackFee(amount) {
  const num = Number(amount) || 0;
  if (num < 2500) return Math.round(num * 0.015 * 100) / 100;
  return Math.min(2000, Math.round(((num * 0.015) + 100) * 100) / 100);
}

// Husmo exact wholesale prices from earlier breakdown
const husmoPrices = {
  // MTN SME / Data Share
  'mtn_data_share:M500MBS': 300,
  'mtn_data_share:M1GBS': 380,
  'mtn_data_share:M2GBS': 735,
  'mtn_data_share:M3GBS': 1075,
  'mtn_data_share:M1GBS2': 392,
  'mtn_data_share:M2GBS2': 805,
  'mtn_data_share:M3GBS2': 1125,
  'mtn_data_share:M5GBS': 1610,

  // Glo
  'glo_data:G1GB1': 335,
  'glo_data:G3GB1': 850, // keep peyflex if cheaper
  'glo_data:G5GB1': 1380, // keep peyflex if cheaper
  'glo_data:G1GB2': 349,
  'glo_data:G3GB2': 990, // keep peyflex if cheaper
  'glo_data:G5GB2': 1580, // keep peyflex if cheaper
  'glo_data:G1GB4': 400,
  'glo_data:G2GB4': 800,
  'glo_data:G3GB4': 1200,
  'glo_data:G5GB4': 2000,

  // Airtel
  'airtel_data:A4GBS': 975,
  'airtel_data:A6GBS': 1440,
  'airtel_data:A1GB': 780,
  'airtel_data:A1a5GBS': 980,
  'airtel_data:A6GB': 1920,
  'airtel_data:A8GBS': 2437,
  'airtel_data:A10GBS': 2925,
  'airtel_data:A20GB': 4800,
  'airtel_data:A35GB': 9900,
  'airtel_data:A2GB2': 1463,
  'airtel_data:A3GB': 1950,
  'airtel_data:A4GB': 2437,
  'airtel_data:A8GB': 2925,
  'airtel_data:A10GB': 3900,
  'airtel_data:A13GB': 4875,
  'airtel_data:A18GB': 5850,
  'airtel_data:A25GB': 7800,
  'airtel_data:A60GB': 14700,
  'airtel_data:A75GB': 14980,
  'airtel_data:A100GB': 19500,
  'airtel_data:A160GB': 29250,

  // MTN Direct Gifting
  'mtn_gifting_data:M110MBS': 98,
  'mtn_gifting_data:M6GBS': 2425,
  'mtn_gifting_data:M7GBS': 3450,
  'mtn_gifting_data:M14m5GBS': 4850,
  'mtn_gifting_data:M20GBS': 7260,
  'mtn_gifting_data:M25GBS': 8700,
  'mtn_gifting_data:M36GBS': 10670,
  'mtn_gifting_data:M65GBS': 15800,
  'mtn_gifting_data:M75GBS': 17460,
  'mtn_gifting_data:M90GBS': 24250,
  'mtn_gifting_data:M150GBS': 39500,
  'mtn_gifting_data:M165GBS': 34500,
  'mtn_gifting_data:M200GBS': 48500,
  'mtn_gifting_data:M250GBS': 53350,
  'mtn_gifting_data:M800GBS': 120625
};

const results = [];
for (const [key, plan] of Object.entries(ACTIVE_APPROVED_PLANS)) {
  const sellPrice = plan.sellPrice;
  const paystackFee = calculatePaystackFee(sellPrice);
  const wholesale = husmoPrices[key] || plan.basePrice;
  const gross = sellPrice - wholesale;
  const net = Math.round((gross - paystackFee) * 100) / 100;
  results.push({
    key,
    network: key.split(':')[0],
    code: key.split(':')[1],
    name: plan.name,
    sellPrice,
    wholesale,
    gross,
    paystackFee,
    net,
    viable: net >= 1.0
  });
}

console.log('VIABLE COUNT WITH HUSMO:', results.filter(r => r.viable).length);
console.log('\nNEW VIABLE PLANS UNDER HUSMO:');
results.filter(r => r.viable).forEach(r => {
  console.log(`• [${r.network}] ${r.name} (₦${r.sellPrice}) | Wholesale: ₦${r.wholesale} | Gross: ₦${r.gross} | Fee: ₦${r.paystackFee} | Net Profit: +₦${r.net}`);
});
