import telecomDispatcher from '../src/services/TelecomDispatcher.js';
import { calculatePaystackFee } from '../src/services/payflex.js';

const plans = await telecomDispatcher.getAvailablePlans();

console.log(`Analyzing ${plans.length} plans:`);

let totalProfit = 0;
let minProfit = Infinity;
let maxProfit = -Infinity;

const analyzed = plans.map(p => {
  const fee = calculatePaystackFee(p.sellPrice);
  const netProfit = +(p.sellPrice - p.baseCost - fee).toFixed(2);
  totalProfit += netProfit;
  if (netProfit < minProfit) minProfit = netProfit;
  if (netProfit > maxProfit) maxProfit = netProfit;

  return {
    code: p.code,
    name: p.name,
    network: p.network,
    sell: p.sellPrice,
    cost: p.baseCost,
    fee,
    netProfit,
    // Child direct under Parent (80/10/10)
    child10: +(netProfit * 0.10).toFixed(2),
    parent80: +(netProfit * 0.80).toFixed(2),
    platform10: +(netProfit * 0.10).toFixed(2),
    // Semi-parent direct (40/50/10)
    semi40: +(netProfit * 0.40).toFixed(2),
    parent50: +(netProfit * 0.50).toFixed(2),
    // Semi-parent downline (Child 10, Semi 30, Parent 50, Plat 10)
    semi30: +(netProfit * 0.30).toFixed(2)
  };
});

const avgProfit = +(totalProfit / plans.length).toFixed(2);
console.log(`Average Net Profit: ₦${avgProfit} (Min: ₦${minProfit}, Max: ₦${maxProfit})`);

// Top 5 highest margin plans
const top5 = [...analyzed].sort((a,b) => b.netProfit - a.netProfit).slice(0, 5);
console.log('\nTop 5 High Profit Plans:');
top5.forEach(p => console.log(`${p.code} (${p.network} ${p.name}): Sell ₦${p.sell}, Profit ₦${p.netProfit} -> Child10: ₦${p.child10}, Semi40: ₦${p.semi40}, Parent50: ₦${p.parent50}, Parent80: ₦${p.parent80}`));

// Top 5 everyday volume plans
const volumeCodes = ['M1GBS', 'M2GBS', 'M1GBS2', 'G2m5GB', 'A10GB'];
console.log('\nEveryday High-Volume Plans:');
analyzed.filter(p => volumeCodes.includes(p.code)).forEach(p => console.log(`${p.code} (${p.network} ${p.name}): Sell ₦${p.sell}, Profit ₦${p.netProfit} -> Child10: ₦${p.child10}, Semi40: ₦${p.semi40}, Parent50: ₦${p.parent50}, Parent80: ₦${p.parent80}`));

