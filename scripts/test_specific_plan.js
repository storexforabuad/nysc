import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

/**
 * Direct Plan Vending Test
 * Tests a specific plan_code directly via Peyflex API
 * Usage: node scripts/test_specific_plan.js <phone_number>
 * Example: node scripts/test_specific_plan.js 08012345678
 */

const phone = process.argv[2];

if (!phone) {
  console.log('Usage: node scripts/test_specific_plan.js <phone_number>');
  console.log('Example: node scripts/test_specific_plan.js 08012345678');
  process.exit(1);
}

const PLAN = {
  network: 'mtn_gifting_data',
  plan_code: 'M2GBS',
  label: '2GB All-Purpose (2 Days)',
  wholesale_cost: 745,
  sell_price: 750,
  profit: 5
};

const client = axios.create({
  baseURL: process.env.PAYFLEX_BASE_URL || 'https://client.peyflex.com.ng',
  headers: {
    'Authorization': `Token ${process.env.PAYFLEX_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function run() {
  console.log('\n================================================');
  console.log('🚀 CLARION LIVE DATA VENDING TEST — SPECIFIC PLAN');
  console.log('================================================');
  console.log(`📦 Plan:        ${PLAN.label}`);
  console.log(`📡 Network:     ${PLAN.network}`);
  console.log(`🔑 Plan Code:   ${PLAN.plan_code}`);
  console.log(`💸 Wholesale:   ₦${PLAN.wholesale_cost}`);
  console.log(`💰 Sell Price:  ₦${PLAN.sell_price}`);
  console.log(`💵 Profit:      ₦${PLAN.profit}`);
  console.log(`📱 Target Phone: ${phone}`);
  console.log('================================================\n');

  try {
    console.log('Sending request to Peyflex...');
    const response = await client.post('/api/data/purchase/', {
      network: PLAN.network,
      mobile_number: phone,
      plan_code: PLAN.plan_code
    });

    const data = response.data;

    if (data.status === 'SUCCESS') {
      console.log('\n✅ DATA VENDED SUCCESSFULLY!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📦 Plan:       ${PLAN.label}`);
      console.log(`📱 Phone:      ${phone}`);
      console.log(`🔖 Reference:  ${data.reference}`);
      console.log(`💰 Amount:     ₦${data.amount || PLAN.wholesale_cost}`);
      console.log(`💳 Balance Left: ₦${data.balance || 'N/A'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\nFull API Response:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error('\n❌ VENDING FAILED — API returned non-SUCCESS:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    if (err.response) {
      console.error(`\n❌ VENDING FAILED — HTTP ${err.response.status}:`);
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('\n❌ VENDING FAILED — Network Error:', err.message);
    }
  }
}

run();
