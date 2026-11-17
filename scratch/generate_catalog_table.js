import { MASTER_DATA_CATALOG } from '../src/services/TelecomDispatcher.js';
import { calculatePaystackFee } from '../src/services/payflex.js';

const officialMap = {
  M110MBS: 100,
  M1GB1D: 350,
  M3m2GB2D: 1000,
  M7GB2D: 2000,
  M500MBS: 500,
  M1GBS: 800,
  M2GBS: 1333,
  M3GBS: 1400,
  M1GBS2: 1000,
  M2GBS2: 2000,
  M3GBS2: 2500,
  M5GBS: 3000,
  M7GBS: 3500,
  M14m5GBS: 5000,
  M20GBS: 7500,
  M25GBS: 9000,
  M36GBS: 11000,
  G2m5GB: 800,
  G1GB1: 400,
  G3GB1: 1200,
  G5GB1: 2000,
  G1GB2: 400,
  G3GB2: 1250,
  G5GB2: 2100,
  G500MB: 300,
  G1GB4: 465,
  G2GB4: 900,
  G3GB4: 1500,
  G5GB4: 2400,
  A300MB: 250,
  A600MB: 350,
  A4GB: 1000,
  A6GB: 1500,
  A1GB: 800,
  A20GB: 5000,
  A2GB: 1500,
  A3GB: 2000,
  A10GB: 4000,
  A25GB: 8000,
  A100GB: 20000
};

console.log('| # | Net | Code | Plan Label | Validity | API Wholesale (₦) | Paystack Fee (₦) | Sell Price (₦) | Net Profit (₦) | Official Retail (₦) | Profit at Official (₦) |');
console.log('| :-: | :---: | :--- | :--- | :---: | --: | --: | --: | --: | --: | --: |');

MASTER_DATA_CATALOG.forEach(p => {
  const f_sell = calculatePaystackFee(p.sellPrice);
  const profit_sell = p.sellPrice - p.baseCost - f_sell;
  const off = officialMap[p.code] || p.sellPrice;
  const f_off = calculatePaystackFee(off);
  const profit_off = off - p.baseCost - f_off;
  console.log(`| ${p.serial} | ${p.network.toUpperCase()} | \`${p.code}\` | ${p.name} | ${p.validity} | ₦${p.baseCost.toLocaleString()} | ₦${f_sell.toLocaleString()} | ₦${p.sellPrice.toLocaleString()} | +₦${profit_sell.toLocaleString()} | ₦${off.toLocaleString()} | +₦${profit_off.toLocaleString()} |`);
});

