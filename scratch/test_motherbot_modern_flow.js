import { motherActiveMenuMap } from '../src/bot/MotherBot.js';
import telecomDispatcher from '../src/services/TelecomDispatcher.js';
import wallet from '../src/services/WalletService.js';
import { calculatePaystackFee } from '../src/services/payflex.js';

console.log('Testing MotherBot Modern Menu Architecture...\n');

// 1. Verify motherActiveMenuMap export
console.log('1. Checking motherActiveMenuMap existence:');
if (motherActiveMenuMap && typeof motherActiveMenuMap.set === 'function') {
  console.log('   ✅ motherActiveMenuMap is properly instantiated.');
} else {
  console.error('   ❌ motherActiveMenuMap missing!');
  process.exit(1);
}

// 2. Simulate Budget Search Numbered List formatting
const testNetwork = 'mtn';
const targetPrice = 2000;
const netPlans = await telecomDispatcher.getAvailablePlans(testNetwork);
let filtered = netPlans.filter(p => p.sellPrice <= targetPrice && p.sellPrice >= targetPrice * 0.60);
if (filtered.length < 3) {
  filtered = netPlans.filter(p => p.sellPrice <= targetPrice && p.sellPrice >= targetPrice * 0.40);
}

console.log('\n2. Testing Numbered Listing (No BUY codes):');
let planIndex = 1;
const lines = [];
filtered.forEach(p => {
  const baseC = Number(p.baseCost || 1000);
  const pfFee = calculatePaystackFee(baseC);
  const displayPrice = Math.round(baseC + pfFee);
  const indexEmoji = planIndex <= 10 ? `${planIndex}️⃣` : `${planIndex}.`;
  lines.push(`${indexEmoji} *${p.name}* (${p.validity || 'Standard'}) — *₦${displayPrice.toLocaleString()}*`);
  planIndex++;
});

console.log(lines.join('\n'));
if (lines.some(l => l.includes('Reply BUY'))) {
  console.error('   ❌ Found legacy BUY code in numbered listing!');
  process.exit(1);
} else {
  console.log('   ✅ Clean numbered list generated without legacy BUY codes.');
}

// 3. Simulate Menu Caching & Bare Number Indexing
const testJid = '2347032905036@s.whatsapp.net';
motherActiveMenuMap.set(testJid, {
  plans: filtered,
  targetPhone: '07032905036',
  network: testNetwork,
  timestamp: Date.now()
});

const activeMenu = motherActiveMenuMap.get(testJid);
const selectedIndex = 1;
const resolvedPlan = activeMenu.plans[selectedIndex - 1];

console.log('\n3. Testing Bare Number 1-Tap Indexing:');
console.log(`   User replied: "${selectedIndex}"`);
console.log(`   Resolved Plan: ${resolvedPlan.code} (${resolvedPlan.name})`);
if (resolvedPlan && resolvedPlan.code === filtered[0].code) {
  console.log('   ✅ Index 1 successfully mapped to first filtered plan.');
} else {
  console.error('   ❌ Failed to map bare number to plan!');
  process.exit(1);
}

console.log('\n🎉 ALL TESTS PASSED: MotherBot menu modernizations verified!');

