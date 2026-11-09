import fs from 'fs';
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

function calculatePaystackFee(amount) {
  const num = Number(amount) || 0;
  if (num <= 0) return 0;
  if (num < 2500) {
    return Math.round(num * 0.015);
  }
  return Math.min(2000, Math.round(num * 0.015 + 100));
}

function normCap(str) {
  if (!str) return '';
  const m = str.match(/([\d\.]+)\s*(MB|GB)/i);
  if (!m) return str.trim().toUpperCase();
  const num = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'MB' && num >= 1000) return `${num / 1000}GB`;
  if (unit === 'GB' && num % 1 === 0) return `${Math.round(num)}GB`;
  if (unit === 'MB' && num % 1 === 0) return `${Math.round(num)}MB`;
  return `${num}${unit}`;
}

function normDur(str) {
  if (!str) return 'Unknown';
  const s = str.toLowerCase();
  if (s.includes('1 year') || s.includes('365 day')) return '1 Year';
  if (s.includes('2 month') || s.includes('60 day') || s.includes('60day') || s.includes('2months')) return '60 Days';
  if (s.includes('30 day') || s.includes('30day') || s.includes('1 month') || s.includes('1month')) return '30 Days';
  if (s.includes('14 day') || s.includes('14day')) return '14 Days';
  if (s.includes('7 day') || s.includes('7day') || s.includes('weekly')) return '7 Days';
  if (s.includes('3 day') || s.includes('3day')) return '3 Days';
  if (s.includes('2 day') || s.includes('2day') || s.includes('2,day')) return '2 Days';
  if (s.includes('1 day') || s.includes('1day')) return '1 Day';
  return str.replace(/[-]/g, '').trim();
}

// Map from Peyflex to Husmodata
const replacements = [];
const keepPeyflex = [];

for (const [key, pfPlan] of Object.entries(ACTIVE_APPROVED_PLANS)) {
  const [net, code] = key.split(':');
  let hNetKey = '';
  if (net.startsWith('mtn')) hNetKey = 'MTN_PLAN';
  else if (net.startsWith('glo')) hNetKey = 'GLO_PLAN';
  else if (net.startsWith('airtel')) hNetKey = 'AIRTEL_PLAN';
  else if (net.startsWith('9mobile')) hNetKey = '9MOBILE_PLAN';

  const husmoCandidates = husmoNet[hNetKey] || [];
  
  // Find raw peyflex label to get capacity and duration
  const rawPfList = peyflex[net] || [];
  const rawPf = rawPfList.find(p => p.plan_code === code);
  const cap = rawPf ? normCap(rawPf.label) : normCap(pfPlan.name);
  const dur = rawPf ? normDur(rawPf.label) : normDur(pfPlan.durationCategory);

  // Match in Husmodata
  let matched = husmoCandidates.filter(h => normCap(h.plan) === cap && normDur(h.month_validate) === dur);
  if (net === 'mtn_data_share') {
    const shareOnly = matched.filter(h => h.plan_type === 'DATA SHARE' || h.plan_type === 'SME');
    if (shareOnly.length > 0) matched = shareOnly;
  }

  const bestMatch = matched[0];
  if (!bestMatch) {
    keepPeyflex.push({ key, pfPlan, reason: 'No Husmodata Equivalent' });
  } else {
    const hCost = Number(bestMatch.plan_amount);
    const diff = hCost - pfPlan.basePrice;
    if (diff < 0) {
      replacements.push({
        key,
        net,
        code,
        name: pfPlan.name,
        cap,
        dur,
        sellPrice: pfPlan.sellPrice,
        pfCost: pfPlan.basePrice,
        hId: bestMatch.id,
        hType: bestMatch.plan_type,
        hCost,
        savings: Math.abs(diff),
        pfProfit: pfPlan.sellPrice - pfPlan.basePrice - calculatePaystackFee(pfPlan.sellPrice),
        hProfit: pfPlan.sellPrice - hCost - calculatePaystackFee(pfPlan.sellPrice)
      });
    } else if (diff === 0) {
      replacements.push({
        key,
        net,
        code,
        name: pfPlan.name,
        cap,
        dur,
        sellPrice: pfPlan.sellPrice,
        pfCost: pfPlan.basePrice,
        hId: bestMatch.id,
        hType: bestMatch.plan_type,
        hCost,
        savings: 0,
        pfProfit: pfPlan.sellPrice - pfPlan.basePrice - calculatePaystackFee(pfPlan.sellPrice),
        hProfit: pfPlan.sellPrice - hCost - calculatePaystackFee(pfPlan.sellPrice),
        note: 'Equal price / dual route'
      });
    } else {
      keepPeyflex.push({
        key,
        net,
        code,
        name: pfPlan.name,
        cap,
        dur,
        pfCost: pfPlan.basePrice,
        hCost,
        reason: `Peyflex is ₦${diff} cheaper`
      });
    }
  }
}

console.log('--- REPLACEMENTS FOUND IN ACTIVE_APPROVED_PLANS ---');
console.table(replacements.map(r => ({
  Code: r.code,
  Name: r.name,
  Dur: r.dur,
  'PF Cost': r.pfCost,
  'Husmo Cost': r.hCost,
  Savings: r.savings,
  'PF Net': r.pfProfit,
  'Husmo Net': r.hProfit
})));

console.log('--- KEEP PEYFLEX IN ACTIVE_APPROVED_PLANS ---');
console.table(keepPeyflex.map(k => ({
  Code: k.code || k.key,
  Name: k.name || k.key,
  'PF Cost': k.pfCost,
  'Husmo Cost': k.hCost,
  Reason: k.reason
})));
