import fs from 'fs';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));
const peyflexDoc = fs.readFileSync('PEYFLEX_LIVE_DATA_PLANS.md', 'utf8');

// Parse official price notes in PEYFLEX_LIVE_DATA_PLANS.md
const planPriceMap = {};
const lines = peyflexDoc.split('\n');
for (const line of lines) {
  const match = line.match(/`([^`]+)`\s*\|\s*([^|]+)\|\s*(\*\*[^*]+\*\*)\s*\|\s*([^|]+)\|\s*(?:₦|NGN)?([\d,]+)\s*\|\s*(.*)$/i);
  if (match) {
    const code = match[1].trim();
    const label = match[2].trim();
    const wholesale = Number(match[5].replace(/,/g, ''));
    const note = match[6].trim();

    let sellPrice = null;
    let officialPrice = null;

    const sellMatch = note.match(/we sell at\s*(\d+)/i);
    if (sellMatch) sellPrice = Number(sellMatch[1]);

    const offMatch = note.match(/official price\s*N?(\d+)/i);
    if (offMatch) officialPrice = Number(offMatch[1]);

    if (!sellPrice && officialPrice) sellPrice = officialPrice;

    planPriceMap[code] = { code, label, wholesale, sellPrice, officialPrice, note };
  }
}

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

function cleanDuration(str) {
  return str.replace(/^[-—\s]+/, '').trim();
}

// Flatten all Peyflex
const pfAll = [];
for (const [netKey, list] of Object.entries(peyflex)) {
  for (const item of list) {
    let raw = item.label;
    let capMatch = raw.match(/^([\d\.]+(?:MB|GB))/i);
    let cap = capMatch ? normCap(capMatch[1]) : '';
    let dur = normDur(raw);
    const pInfo = planPriceMap[item.plan_code] || {};
    pfAll.push({
      netKey,
      code: item.plan_code,
      label: raw,
      wholesale: Number(item.amount),
      sellPrice: pInfo.sellPrice || null,
      officialPrice: pInfo.officialPrice || null,
      cap,
      dur
    });
  }
}

const netMap = {
  MTN_PLAN: ['mtn_data_share', 'mtn_gifting_data'],
  GLO_PLAN: ['glo_data'],
  AIRTEL_PLAN: ['airtel_data'],
  '9MOBILE_PLAN': ['9mobile_data']
};

const pilotCodes = [
  'M500MBS', 'M1GBS', 'M2GBS', 'M3GBS', 'M1GBS2', 'M2GBS2', 'M3GBS2', 'M5GBS',
  'G1GB1', 'G3GB1', 'G5GB1', 'G1GB2', 'G3GB2', 'G5GB2', 'G1GB4', 'G2GB4', 'G3GB4', 'G5GB4'
];

function findPeyflexMatch(husmoNetKey, hPlan) {
  const hCap = normCap(hPlan.plan);
  const hDur = normDur(hPlan.month_validate);
  const allowedPfNets = netMap[husmoNetKey] || [];
  const candidates = pfAll.filter(p => allowedPfNets.includes(p.netKey));

  let pool = candidates;
  if (hPlan.plan_type.includes('SHARE') || hPlan.plan_type.includes('SME')) {
    const shareOnly = candidates.filter(p => p.netKey === 'mtn_data_share' || p.netKey === '9mobile_data');
    if (shareOnly.length > 0) pool = shareOnly;
  } else if (hPlan.plan_type.includes('GIFTING')) {
    const giftOnly = candidates.filter(p => p.netKey === 'mtn_gifting_data' || p.netKey === 'airtel_data' || p.netKey === 'glo_data' || p.netKey === '9mobile_data');
    if (giftOnly.length > 0) pool = giftOnly;
  }

  let m = pool.filter(p => p.cap === hCap && p.dur === hDur);
  if (m.length > 0) return m[0];

  m = candidates.filter(p => p.cap === hCap && p.dur === hDur);
  if (m.length > 0) return m[0];

  m = pool.filter(p => p.cap === hCap);
  if (m.length === 1) return m[0];

  return null;
}

function deduceSellPrice(hPlan, pfMatch) {
  if (pfMatch && pfMatch.sellPrice) return pfMatch.sellPrice;
  if (pfMatch && pfMatch.officialPrice) return pfMatch.officialPrice;

  const cap = normCap(hPlan.plan);
  const dur = normDur(hPlan.month_validate);
  const cost = Number(hPlan.plan_amount);

  if (cap === '25MB' || cap === '50MB' || cap === '75MB' || cap === '100MB' || cap === '110MB') return 100;
  if (cap === '150MB' || cap === '200MB' || cap === '230MB' || cap === '250MB') return 200;
  if (cap === '300MB' || cap === '350MB') return 300;
  if (cap === '500MB' || cap === '600MB' || cap === '650MB' || cap === '750MB') {
    if (dur === '1 Day' || dur === '2 Days') return 350;
    return 500;
  }
  if (cap === '1GB') {
    if (dur === '1 Day') return 350;
    if (dur === '2 Days' || dur === '3 Days') return 500;
    if (dur === '7 Days') return 800;
    return 1000;
  }
  if (cap === '1.1GB' || cap === '1.2GB' || cap === '1.5GB' || cap === '1.8GB') {
    if (dur === '1 Day') return 450;
    if (dur === '2 Days' || dur === '3 Days') return 600;
    if (dur === '7 Days') return 1000;
    return 1200;
  }
  if (cap === '2GB') {
    if (dur === '1 Day' || dur === '2 Days') return 800;
    if (dur === '7 Days') return 1200;
    return 1500;
  }
  if (cap === '2.5GB' || cap === '2.6GB' || cap === '2.7GB') {
    if (dur === '1 Day' || dur === '2 Days') return 900;
    if (dur === '7 Days') return 1500;
    return 2000;
  }
  if (cap === '3GB' || cap === '3.2GB' || cap === '3.5GB' || cap === '3.7GB') {
    if (dur === '1 Day' || dur === '2 Days') return 1000;
    if (dur === '7 Days') return 1500;
    return 2000;
  }
  if (cap === '4GB' || cap === '4.5GB') {
    if (dur === '2 Days' || dur === '3 Days') return 1500;
    return 2500;
  }
  if (cap === '5GB' || cap === '5.2GB' || cap === '5.5GB') {
    if (dur === '2 Days' || dur === '3 Days') return 1500;
    if (dur === '7 Days') return 2000;
    return 2500;
  }
  if (cap === '6GB' || cap === '6.25GB' || cap === '6.75GB' || cap === '7GB' || cap === '7.25GB' || cap === '7.5GB') {
    if (dur === '1 Day' || dur === '2 Days') return 2000;
    if (dur === '7 Days') return 2500;
    return 3500;
  }
  if (cap === '8GB' || cap === '9GB') return 3000;
  if (cap === '10GB' || cap === '11GB') {
    if (dur === '7 Days' || dur === '14 Days') return 3500;
    return 4500;
  }
  if (cap === '12GB' || cap === '12.5GB' || cap === '13GB') return 5000;
  if (cap === '14GB' || cap === '14.5GB' || cap === '15GB') return 5500;
  if (cap === '16.5GB' || cap === '18GB') return 6000;
  if (cap === '20GB' || cap === '20.5GB') return 7500;
  if (cap === '25GB' || cap === '28GB') return 9000;
  if (cap === '30GB' || cap === '35GB' || cap === '36GB' || cap === '38GB' || cap === '40GB') return 11000;
  if (cap === '60GB' || cap === '64GB' || cap === '65GB') return 16000;
  if (cap === '75GB') return 18000;
  if (cap === '90GB' || cap === '100GB' || cap === '107GB') return 25000;
  if (cap === '150GB' || cap === '160GB' || cap === '165GB') return 35000;
  if (cap === '200GB' || cap === '250GB') return 50000;
  if (cap === '800GB') return 125000;

  return Math.ceil((cost * 1.15) / 50) * 50;
}

const nwf = (num) => '₦' + Number(num).toLocaleString('en-NG');

// Build Master Data
const allEvaluated = [];

for (const [netKey, plans] of Object.entries(husmoNet)) {
  for (const hPlan of plans) {
    if (Number(hPlan.plan_amount) > 1000000) continue; // skip bogus plan

    const pfMatch = findPeyflexMatch(netKey, hPlan);
    const cost = Number(hPlan.plan_amount);
    const sellPrice = deduceSellPrice(hPlan, pfMatch);
    const paystackFee = calculatePaystackFee(sellPrice);
    const netProfit = sellPrice - cost - paystackFee;
    const isPilot = pfMatch && pilotCodes.includes(pfMatch.code);

    let status = '';
    if (netProfit >= 1) {
      status = 'PROFITABLE';
    } else if (netProfit >= 0) {
      status = 'BREAK_EVEN';
    } else if (netProfit >= -10) {
      status = 'TOLERABLE_LOSS';
    } else {
      status = 'HIGH_LOSS';
    }

    allEvaluated.push({
      netKey,
      hPlan,
      pfMatch,
      cost,
      sellPrice,
      paystackFee,
      netProfit,
      isPilot,
      hasEquivalent: !!pfMatch,
      status
    });
  }
}

// Find Peyflex plans with NO Husmodata equivalent
const peyflexNoMatch = pfAll.filter(pf => {
  const matched = allEvaluated.some(e => e.pfMatch && e.pfMatch.code === pf.code);
  return !matched;
});

console.log('Total Husmodata evaluated:', allEvaluated.length);
console.log('Husmo with equivalent:', allEvaluated.filter(e => e.hasEquivalent).length);
console.log('Husmo with NO equivalent:', allEvaluated.filter(e => !e.hasEquivalent).length);
console.log('Peyflex plans with NO Husmo equivalent:', peyflexNoMatch.length);
peyflexNoMatch.forEach(p => console.log('Peyflex unique:', p.netKey, p.code, p.label, p.wholesale));

