import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

const sharePlans = raw['mtn_data_share'] || [];
const giftingPlans = raw['mtn_gifting_data'] || [];

function isRestrictedOrSocial(label) {
  const lbl = label.toLowerCase();
  return lbl.includes('social') || lbl.includes('youtube') || lbl.includes('buffer') || lbl.includes('tik tok') || lbl.includes('instagram');
}

function extractDetails(p, type) {
  const lbl = p.label;
  let dur = '30 Days';
  if (lbl.includes('1 Day') || lbl.includes('1Day')) dur = '1 Day';
  else if (lbl.includes('2 Day') || lbl.includes('2Day') || lbl.includes('2days')) dur = '2 Days';
  else if (lbl.includes('3 Day') || lbl.includes('3Day')) dur = '3 Days';
  else if (lbl.includes('7 Day') || lbl.includes('7Day') || lbl.includes('Weekly') || lbl.includes('7Days')) dur = '7 Days';
  else if (lbl.includes('14 Day') || lbl.includes('14Day')) dur = '14 Days';
  else if (lbl.includes('2 Month') || lbl.includes('2Month') || lbl.includes('2 Months')) dur = '60 Days';
  else if (lbl.includes('1 Year') || lbl.includes('1Year')) dur = '365 Days';

  let size = '';
  const m = lbl.match(/(\d+(?:\.\d+)?\s*(?:MB|GB))/i);
  if (m) size = m[1].toUpperCase().replace(/\s+/, '');

  return {
    type,
    network: type === 'SME (Share)' ? 'mtn_data_share' : 'mtn_gifting_data',
    code: p.plan_code,
    size,
    duration: dur,
    label: p.label,
    cost: p.amount,
    isSocial: isRestrictedOrSocial(lbl)
  };
}

// 1. Filter out all social/YouTube restricted plans
const cleanShare = sharePlans.map(p => extractDetails(p, 'SME (Share)')).filter(p => !p.isSocial);
const cleanGifting = giftingPlans.map(p => extractDetails(p, 'Gifting')).filter(p => !p.isSocial);

const allMtn = [...cleanShare, ...cleanGifting];

// Official Telco benchmark lookup
const officialBenchmarks = {
  'M500MBS': 500, 'M1GBS': 800, 'M2GBS': 1000, 'M3GBS': 1500,
  'M1GBS2': 1000, 'M2GBS2': 1500, 'M3GBS2': 2000, 'M5GBS': 3000,
  'M110MBS': 100, 'M2m5GBS': 1000, 'M2GBS': 1000,
  'M3m2GBS': 1200, 'M2m5GBS1': 2500, 'M2m7GBS': 2000, 'M3m5GBS': 2500,
  'M6GBS': 2500, 'M7GBS': 3500, 'M11GBS': 4000, 'M12m5GBS': 5500,
  'M14m5GBS': 5000, 'M20GBS': 7500, 'M25GBS': 9000, 'M36GBS': 11000,
  'M65GBS': 16000, 'M75GBS': 18000, 'M90GBS': 25000, 'M150GBS': 40000,
  'M165GBS': 35000, 'M200GBS': 50000, 'M250GBS': 55000, 'M800GBS': 125000,
};

function getRecommendedPrice(cost, official) {
  let margin = 50;
  if (cost < 300) margin = 30;
  else if (cost < 600) margin = 80;
  else if (cost < 1500) margin = 100;
  else if (cost < 3000) margin = 150;
  else if (cost < 10000) margin = 200;
  else margin = 350;

  let rec = cost + margin;
  rec = Math.ceil(rec / 5) * 5;

  if (official && rec > official) {
    rec = official;
  }
  if (official && rec === official && official - cost >= 40) {
    rec = official - 10;
  }
  return rec;
}

const grouped = {};
for (const item of allMtn) {
  const key = item.size + '_' + item.duration;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(item);
}

const winners = [];
const collisions = [];

for (const [key, items] of Object.entries(grouped)) {
  if (items.length > 1) {
    // Pick the most profitable all-purpose plan (lowest wholesale cost)
    items.sort((a, b) => a.cost - b.cost);
    collisions.push({
      key,
      picked: items[0],
      dropped: items.slice(1)
    });
    winners.push(items[0]);
  } else {
    winners.push(items[0]);
  }
}

console.log('=== COLLISIONS DETECTED & RESOLVED (ALL-PURPOSE BROWSING ONLY) ===');
for (const c of collisions) {
  console.log(`\nConflict: ${c.key}`);
  console.log(`  -> KEPT:    [${c.picked.type}] ${c.picked.code} Cost: ₦${c.picked.cost} (${c.picked.label})`);
  for (const d of c.dropped) {
    console.log(`  -> DROPPED: [${d.type}] ${d.code} Cost: ₦${d.cost} (${d.label})`);
  }
}

// Map final priced list
const finalList = winners.map(p => {
  const official = officialBenchmarks[p.code] || Math.ceil((p.cost * 1.25) / 50) * 50;
  const rec = getRecommendedPrice(p.cost, official);
  const margin = rec - p.cost;
  const pct = ((margin / p.cost) * 100).toFixed(1);
  const savings = official - rec;

  return {
    ...p,
    official,
    recommended: rec,
    margin,
    pct,
    savings
  };
});

const durOrder = { '1 Day': 1, '2 Days': 2, '3 Days': 3, '7 Days': 7, '14 Days': 14, '30 Days': 30, '60 Days': 60, '365 Days': 365 };
finalList.sort((a, b) => {
  const da = durOrder[a.duration] || 99;
  const db = durOrder[b.duration] || 99;
  if (da !== db) return da - db;
  return a.cost - b.cost;
});

fs.writeFileSync('tmp_final_mtn_pure_browsing.json', JSON.stringify(finalList, null, 2));
console.log(`\nDone! Curated ${finalList.length} pure all-purpose browsing MTN plans.`);
