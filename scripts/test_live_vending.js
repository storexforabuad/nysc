import dotenv from 'dotenv';
dotenv.config();

import payflex from '../src/services/payflex.js';

/**
 * Live Vending Smoke Test
 * Usage:
 *   node scripts/test_live_vending.js <action: airtime|data> <network: mtn|airtel|glo|9mobile> <phone_number>
 * Examples:
 *   node scripts/test_live_vending.js airtime mtn 08012345678
 *   node scripts/test_live_vending.js data airtel 08012345678
 */

const [,, action, network, phone] = process.argv;

if (!action || !network || !phone) {
  console.log(`
Usage:
  node scripts/test_live_vending.js <action> <network> <phone>

Examples:
  node scripts/test_live_vending.js airtime mtn 08012345678
  node scripts/test_live_vending.js data airtel 08012345678
  `);
  process.exit(1);
}

async function runTest() {
  console.log(`\n========================================`);
  console.log(`🚀 CLARION LIVE PEYFLEX DISPENSING TEST`);
  console.log(`========================================`);
  console.log(`Action:  ${action.toUpperCase()}`);
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`Phone:   ${phone}`);
  console.log(`========================================\n`);

  try {
    if (action.toLowerCase() === 'airtime') {
      const amount = 100;
      console.log(`Dispensing ₦${amount} ${network.toUpperCase()} airtime to ${phone}...`);
      const result = await payflex.purchaseAirtime(network, phone, amount);
      console.log(`\n✅ AIRTIME PURCHASE SUCCESSFUL!`);
      console.log(`Reference:`, result.reference);
      console.log(`API Response:`, result.apiResponse);
    } else if (action.toLowerCase() === 'data') {
      console.log(`Finding best ~₦300 data plan for ${network.toUpperCase()}...`);
      const plans = await payflex.getAvailablePlans();
      const networkPlans = plans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));
      
      // Look for a plan near ₦300 (between 200 and 350)
      const selectedPlan = networkPlans.find(p => p.basePrice >= 200 && p.basePrice <= 350) || networkPlans[0];

      if (!selectedPlan) {
        throw new Error(`No available plan found for ${network}`);
      }

      console.log(`Selected Plan: ${selectedPlan.name} (Wholesale: ₦${selectedPlan.basePrice}) [Serial: ${selectedPlan.serial || selectedPlan.plan_code}]`);
      console.log(`Dispensing data to ${phone}...`);

      const result = await payflex.dispenseData(phone, selectedPlan.serial || selectedPlan.id);
      console.log(`\n✅ DATA PURCHASE SUCCESSFUL!`);
      console.log(`Reference:`, result.reference);
      console.log(`Plan:`, result.planDetails?.name);
      console.log(`API Response:`, result.apiResponse);
    } else {
      console.error(`Invalid action "${action}". Must be "airtime" or "data".`);
    }
  } catch (error) {
    console.error(`\n❌ DISPENSE FAILED:`, error.message);
  }
}

runTest();
