import telecomDispatcher from '../src/services/TelecomDispatcher.js';

function applyBracketFilter(netPlans, targetPrice) {
  // Tier 1: 60%–100% of budget (sweet spot)
  let filtered = netPlans.filter(p => p.sellPrice <= targetPrice && p.sellPrice >= targetPrice * 0.60);

  // Tier 2: expand to 40%–100% if fewer than 3 results
  if (filtered.length < 3) {
    filtered = netPlans.filter(p => p.sellPrice <= targetPrice && p.sellPrice >= targetPrice * 0.40);
  }

  // Tier 3: absolute fallback — 4 closest by price distance
  if (filtered.length < 2) {
    filtered = [...netPlans]
      .sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice))
      .slice(0, 4);
    filtered.sort((a, b) => a.sellPrice - b.sellPrice);
  }
  return filtered;
}

async function run() {
  const mtnPlans = await telecomDispatcher.getAvailablePlans('mtn');
  console.log('=== MTN 2000 Filter ===');
  const mtn2000 = applyBracketFilter(mtnPlans, 2000);
  console.log(`Count: ${mtn2000.length}`);
  mtn2000.forEach(p => console.log(`  - ${p.name} @ ₦${p.sellPrice}`));

  console.log('\n=== MTN 3000 Filter ===');
  const mtn3000 = applyBracketFilter(mtnPlans, 3000);
  console.log(`Count: ${mtn3000.length}`);
  mtn3000.forEach(p => console.log(`  - ${p.name} @ ₦${p.sellPrice}`));

  console.log('\n=== GLO 2000 Filter ===');
  const gloPlans = await telecomDispatcher.getAvailablePlans('glo');
  const glo2000 = applyBracketFilter(gloPlans, 2000);
  console.log(`Count: ${glo2000.length}`);
  glo2000.forEach(p => console.log(`  - ${p.name} @ ₦${p.sellPrice}`));

  console.log('\n=== MTN 100 Low Budget Filter (Fallback) ===');
  const mtn100 = applyBracketFilter(mtnPlans, 100);
  console.log(`Count: ${mtn100.length}`);
  mtn100.forEach(p => console.log(`  - ${p.name} @ ₦${p.sellPrice}`));
}

run().catch(console.error);

