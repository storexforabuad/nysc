import fs from 'fs';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

// Parse Peyflex plans into clean structured items
function parsePeyflex(category, list) {
  return list.map(item => {
    // label format e.g. "500MB = N350 (7 Days)" or "1GB = N580 (30 Days)" or "7GB = N3450 (1 Month) +2GB All Night Streaming"
    const rawLabel = item.label;
    const code = item.plan_code;
    const amount = Number(item.amount);

    // Extract capacity
    let capMatch = rawLabel.match(/^([\d\.]+(?:MB|GB))/i);
    let cap = capMatch ? capMatch[1].toUpperCase() : '';

    // Extract duration
    let dur = '';
    const durMatch = rawLabel.match(/\(([^)]+)\)/);
    if (durMatch) {
      dur = durMatch[1].trim();
    } else if (rawLabel.toLowerCase().includes('weekly')) {
      dur = 'Weekly';
    } else if (rawLabel.toLowerCase().includes('1 month')) {
      dur = '1 Month';
    }

    return {
      category,
      code,
      label: rawLabel,
      amount,
      cap,
      dur
    };
  });
}

const pfParsed = {
  mtn_data_share: parsePeyflex('mtn_data_share', peyflex.mtn_data_share),
  mtn_gifting_data: parsePeyflex('mtn_gifting_data', peyflex.mtn_gifting_data),
  airtel_data: parsePeyflex('airtel_data', peyflex.airtel_data),
  glo_data: parsePeyflex('glo_data', peyflex.glo_data),
  '9mobile_data': parsePeyflex('9mobile_data', peyflex['9mobile_data'])
};

console.log('Parsed Peyflex categories.');

// Check 18 pilot plans matching
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

console.log('\n--- EVALUATING 18 PILOT PLANS WITH HUSMODATA ---');
const pilotKeys = Object.keys(ACTIVE_APPROVED_PLANS).filter(k => k.startsWith('mtn_data_share') || k.startsWith('glo_data'));

for (const k of pilotKeys) {
  const [net, code] = k.split(':');
  const pfPlan = ACTIVE_APPROVED_PLANS[k];
  console.log(`Plan: [${net}] ${code} - ${pfPlan.name} | Peyflex Wholesale: ₦${pfPlan.basePrice} | Sell: ₦${pfPlan.sellPrice}`);
}

