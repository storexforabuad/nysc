import fs from 'fs';

const netPlans = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));

console.log('=== MTN PLAN TYPES ===');
const mtnTypes = [...new Set(netPlans.MTN_PLAN.map(p => p.plan_type))];
console.log('MTN types:', mtnTypes);

for (const t of mtnTypes) {
  console.log(`\n--- MTN [${t}] (${netPlans.MTN_PLAN.filter(p => p.plan_type === t).length} plans) ---`);
  netPlans.MTN_PLAN.filter(p => p.plan_type === t).forEach(p => {
    console.log(`ID: ${p.id} | ${p.plan} | ${p.month_validate} | Cost: ₦${p.plan_amount}`);
  });
}

console.log('\n=== GLO PLAN TYPES ===');
const gloTypes = [...new Set(netPlans.GLO_PLAN.map(p => p.plan_type))];
console.log('Glo types:', gloTypes);

for (const t of gloTypes) {
  console.log(`\n--- GLO [${t}] (${netPlans.GLO_PLAN.filter(p => p.plan_type === t).length} plans) ---`);
  netPlans.GLO_PLAN.filter(p => p.plan_type === t).forEach(p => {
    console.log(`ID: ${p.id} | ${p.plan} | ${p.month_validate} | Cost: ₦${p.plan_amount}`);
  });
}

