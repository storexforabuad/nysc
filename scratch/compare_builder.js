import fs from 'fs';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

// Helper to normalize capacity
function normCap(str) {
  if (!str) return '';
  const m = str.match(/([\d\.]+)\s*(MB|GB)/i);
  if (!m) return str.trim().toUpperCase();
  const num = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'MB' && num >= 1000) {
    return `${num / 1000}GB`;
  }
  if (unit === 'GB' && num % 1 === 0) {
    return `${Math.round(num)}GB`;
  }
  if (unit === 'MB' && num % 1 === 0) {
    return `${Math.round(num)}MB`;
  }
  return `${num}${unit}`;
}

// Helper to normalize duration
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

// Parse Peyflex items
function parsePeyflexAll() {
  const all = [];
  for (const [netKey, list] of Object.entries(peyflex)) {
    for (const item of list) {
      let raw = item.label;
      let capMatch = raw.match(/^([\d\.]+(?:MB|GB))/i);
      let cap = capMatch ? normCap(capMatch[1]) : '';
      let dur = normDur(raw);
      all.push({
        netKey,
        code: item.plan_code,
        label: raw,
        amount: Number(item.amount),
        cap,
        dur
      });
    }
  }
  return all;
}

const pfAll = parsePeyflexAll();

// Mapping networks between Husmodata and Peyflex
const netMap = {
  MTN_PLAN: ['mtn_data_share', 'mtn_gifting_data'],
  GLO_PLAN: ['glo_data'],
  AIRTEL_PLAN: ['airtel_data'],
  '9MOBILE_PLAN': ['9mobile_data']
};

function findPeyflexMatches(husmoNetKey, hPlan) {
  const hCap = normCap(hPlan.plan);
  const hDur = normDur(hPlan.month_validate);
  const allowedPfNets = netMap[husmoNetKey] || [];

  // Candidate matches in the same network
  const candidates = pfAll.filter(p => allowedPfNets.includes(p.netKey));

  // Match by exact capacity and exact duration
  let matches = candidates.filter(p => p.cap === hCap && p.dur === hDur);

  // If Husmo is Data Share / SME, prefer mtn_data_share
  if (hPlan.plan_type.includes('SHARE') || hPlan.plan_type.includes('SME')) {
    const shareMatch = matches.filter(p => p.netKey === 'mtn_data_share');
    if (shareMatch.length > 0) matches = shareMatch;
  } else if (hPlan.plan_type.includes('GIFTING')) {
    const giftMatch = matches.filter(p => p.netKey === 'mtn_gifting_data');
    if (giftMatch.length > 0) matches = giftMatch;
  }

  // Fallback: match by capacity if duration is close or single match
  if (matches.length === 0) {
    matches = candidates.filter(p => p.cap === hCap);
  }

  return matches;
}

console.log('Comparison engine ready.');

