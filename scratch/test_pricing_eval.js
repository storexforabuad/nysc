import fs from 'fs';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

// Read official / selling price mappings from PEYFLEX_LIVE_DATA_PLANS.md and master_pricing_strategy_dashboard.html
// Also read ACTIVE_APPROVED_PLANS from payflex.js
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

function calculatePaystackFee(amount) {
  const num = Number(amount) || 0;
  if (num < 2500) {
    return Math.round(num * 0.015);
  }
  return Math.min(2000, Math.round(num * 0.015 + 100));
}

console.log('Testing calculatePaystackFee:');
console.log('₦100 fee:', calculatePaystackFee(100));
console.log('₦500 fee:', calculatePaystackFee(500));
console.log('₦1,000 fee:', calculatePaystackFee(1000));
console.log('₦2,500 fee:', calculatePaystackFee(2500));
console.log('₦5,000 fee:', calculatePaystackFee(5000));

