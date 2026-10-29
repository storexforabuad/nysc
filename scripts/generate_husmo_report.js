import fs from 'fs';

const data = JSON.parse(fs.readFileSync('storage/husmo_comparison.json', 'utf8'));

console.log('================================================================================================');
console.log('🔥 HUSMODATA vs PEYFLEX: SIDE-BY-SIDE WHOLESALE PRICE COMPARISON');
console.log('================================================================================================\n');

let husmoCheaperCount = 0;
let peyflexCheaperCount = 0;
let sameCount = 0;
let notFoundCount = 0;
let totalSavingsPotential = 0;

const summaryRows = [];

for (const item of data) {
  const ourWholesale = item.ourWholesale;
  const ourSellPrice = item.ourSellPrice;

  if (item.husmoMatches.length === 0) {
    notFoundCount++;
    summaryRows.push({
      network: item.network,
      name: item.name,
      duration: item.durationCategory.replace(/[\*📅⚡🗓️💎]/g, '').trim(),
      ourWholesale,
      husmoWholesale: 'N/A',
      diff: 'N/A',
      ourSellPrice,
      note: '❌ No direct match in Husmo list'
    });
    continue;
  }

  // Find the closest / best match (prioritize SME/DATA SHARE for SME, GIFTING for Gifting)
  let bestMatch = item.husmoMatches[0];
  if (item.network.includes('share') || item.network.includes('sme')) {
    const smeMatch = item.husmoMatches.find(m => m.planType.includes('sme') || m.planType.includes('share'));
    if (smeMatch) bestMatch = smeMatch;
  } else if (item.network.includes('gifting')) {
    const giftMatch = item.husmoMatches.find(m => m.planType.includes('gifting') && !m.planType.includes('corporate'));
    if (giftMatch) bestMatch = giftMatch;
  }

  const husmoWholesale = bestMatch.amount;
  const diff = husmoWholesale - ourWholesale; // negative means Husmo is CHEAPER!

  let note = '';
  if (diff < 0) {
    husmoCheaperCount++;
    const saved = Math.abs(diff);
    totalSavingsPotential += saved;
    note = `🟢 Husmo is ₦${saved.toLocaleString()} CHEAPER (${bestMatch.planType.toUpperCase()})`;
  } else if (diff === 0) {
    sameCount++;
    note = `⚪ Identical price (${bestMatch.planType.toUpperCase()})`;
  } else {
    peyflexCheaperCount++;
    note = `🔴 Peyflex is ₦${diff.toLocaleString()} cheaper (${bestMatch.planType.toUpperCase()})`;
  }

  summaryRows.push({
    network: item.network,
    name: item.name,
    duration: item.durationCategory.replace(/[\*📅⚡🗓️💎]/g, '').trim(),
    ourWholesale,
    husmoWholesale,
    diff,
    ourSellPrice,
    husmoType: bestMatch.planType,
    note
  });
}

// Print by network
const networks = ['mtn_data_share', 'mtn_gifting_data', 'airtel_data', 'glo_data'];

for (const net of networks) {
  const rows = summaryRows.filter(r => r.network === net);
  console.log(`\n------------------------------------------------------------------------------------------------`);
  console.log(`📡 NETWORK: ${net.toUpperCase()}`);
  console.log(`------------------------------------------------------------------------------------------------`);
  console.log(
    'Plan'.padEnd(16) +
    'Duration'.padEnd(16) +
    'Peyflex Wholesale'.padEnd(20) +
    'Husmo Wholesale'.padEnd(18) +
    'Our Sell Price'.padEnd(16) +
    'Verdict'
  );
  console.log('-'.repeat(110));

  for (const r of rows) {
    const pStr = `₦${r.ourWholesale}`;
    const hStr = r.husmoWholesale !== 'N/A' ? `₦${r.husmoWholesale}` : 'N/A';
    const sStr = `₦${r.ourSellPrice}`;

    console.log(
      r.name.padEnd(16) +
      r.duration.padEnd(16) +
      pStr.padEnd(20) +
      hStr.padEnd(18) +
      sStr.padEnd(16) +
      r.note
    );
  }
}

console.log('\n================================================================================================');
console.log('📊 OVERALL COMPARISON SCORECARD');
console.log('================================================================================================');
console.log(`Total Active Plans Checked:        ${data.length}`);
console.log(`🟢 Plans Cheaper on Husmodata:     ${husmoCheaperCount}`);
console.log(`🔴 Plans Cheaper on Peyflex:       ${peyflexCheaperCount}`);
console.log(`⚪ Plans with Exact Same Price:    ${sameCount}`);
console.log(`❌ Plans with No Direct Match:     ${notFoundCount}`);
console.log('================================================================================================\n');
