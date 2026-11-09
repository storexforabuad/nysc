import fs from 'fs';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

// Extract official / selling price mappings from PEYFLEX_LIVE_DATA_PLANS.md
const peyflexDoc = fs.readFileSync('PEYFLEX_LIVE_DATA_PLANS.md', 'utf8');

// Parse official price notes in PEYFLEX_LIVE_DATA_PLANS.md
// e.g. "official price N500, we sell at 500" or "official price 2500, we sell at 2500"
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

console.log('Parsed plan price map from PEYFLEX_LIVE_DATA_PLANS.md, count:', Object.keys(planPriceMap).length);
console.log('Sample M500MBS:', planPriceMap['M500MBS']);
console.log('Sample A4GBS:', planPriceMap['A4GBS']);
console.log('Sample G1GB1:', planPriceMap['G1GB1']);

