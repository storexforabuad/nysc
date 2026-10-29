import axios from 'axios';
import { config, logger } from '../src/config/env.js';
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

const PEYFLEX_BASE = process.env.PAYFLEX_BASE_URL || 'https://client.peyflex.com.ng';
const PEYFLEX_TOKEN = process.env.PAYFLEX_TOKEN;

if (!PEYFLEX_TOKEN) {
  console.error('❌ PAYFLEX_TOKEN is missing from .env');
  process.exit(1);
}

const client = axios.create({
  baseURL: PEYFLEX_BASE,
  headers: {
    'Authorization': `Token ${PEYFLEX_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 25000
});

const NETWORKS = [
  { key: 'mtn_data_share', label: 'MTN (SME / Data Share)' },
  { key: 'mtn_gifting_data', label: 'MTN (Direct Gifting)' },
  { key: 'airtel_data', label: 'Airtel Data' },
  { key: 'glo_data', label: 'Glo Data' },
  { key: '9mobile_data', label: '9mobile / T2 Data' }
];

async function main() {
  console.log('🚀 Connecting to Peyflex API with current Reseller Token...');
  console.log(`📡 Base URL: ${PEYFLEX_BASE}`);

  // 1. Fetch live plans for all networks
  const livePlansMap = {};
  for (const net of NETWORKS) {
    try {
      console.log(`Fetching live plans for ${net.label} (${net.key})...`);
      const res = await client.get(`/api/data/plans/?network=${net.key}`);
      const plans = res.data?.plans || [];
      console.log(`  -> Received ${plans.length} plans from Peyflex.`);
      for (const p of plans) {
        livePlansMap[`${net.key}:${p.plan_code}`] = p;
      }
    } catch (err) {
      console.error(`❌ Error fetching ${net.key}:`, err.response?.data || err.message);
    }
  }

  console.log('\n========================================================================================');
  console.log('📊 COMPARISON: OLD BASE WHOLESALE vs NEW LIVE RESELLER WHOLESALE FOR 54 ACTIVE PLANS');
  console.log('========================================================================================\n');

  let cheaperCount = 0;
  let sameCount = 0;
  let moreExpensiveCount = 0;
  let missingCount = 0;
  let totalOldWholesale = 0;
  let totalNewWholesale = 0;
  let totalProfitIncrease = 0;

  const comparisonRows = [];

  for (const [key, planDef] of Object.entries(ACTIVE_APPROVED_PLANS)) {
    const livePlan = livePlansMap[key];
    const [netKey, planCode] = key.split(':');

    if (!livePlan) {
      missingCount++;
      comparisonRows.push({
        network: netKey,
        code: planCode,
        name: planDef.name,
        oldBase: planDef.basePrice,
        newBase: 'NOT FOUND',
        diff: 'N/A',
        sellPrice: planDef.sellPrice,
        status: '❌ Missing from API'
      });
      continue;
    }

    const oldBase = planDef.basePrice;
    const newBase = Number(livePlan.amount);
    const diff = newBase - oldBase; // negative means cheaper!
    const profitOld = planDef.sellPrice - oldBase;
    const profitNew = planDef.sellPrice - newBase;

    totalOldWholesale += oldBase;
    totalNewWholesale += newBase;

    let status = '';
    if (diff < 0) {
      cheaperCount++;
      const saved = Math.abs(diff);
      totalProfitIncrease += saved;
      status = `🎉 Cheaper by ₦${saved}`;
    } else if (diff === 0) {
      sameCount++;
      status = '➡️ Identical';
    } else {
      moreExpensiveCount++;
      status = `⚠️ Increased by ₦${diff}`;
    }

    comparisonRows.push({
      network: netKey,
      code: planCode,
      name: planDef.name,
      oldBase,
      newBase,
      diff,
      sellPrice: planDef.sellPrice,
      profitOld,
      profitNew,
      status
    });
  }

  // Print grouped by network
  const networksOrder = ['mtn_data_share', 'mtn_gifting_data', 'airtel_data', 'glo_data'];
  for (const net of networksOrder) {
    const rows = comparisonRows.filter(r => r.network === net);
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`🌐 Network: ${net.toUpperCase()} (${rows.length} Plans)`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(
      'Plan Code'.padEnd(12) +
      'Plan Name'.padEnd(32) +
      'Old Wholesale'.padEnd(16) +
      'New Reseller'.padEnd(16) +
      'Sell Price'.padEnd(14) +
      'New Margin'.padEnd(14) +
      'Status'
    );
    console.log('-'.repeat(110));

    for (const r of rows) {
      const oldStr = `₦${r.oldBase}`;
      const newStr = r.newBase !== 'NOT FOUND' ? `₦${r.newBase}` : 'NOT FOUND';
      const sellStr = `₦${r.sellPrice}`;
      const marginStr = r.profitNew !== undefined ? `₦${r.profitNew}` : 'N/A';

      console.log(
        r.code.padEnd(12) +
        r.name.padEnd(32) +
        oldStr.padEnd(16) +
        newStr.padEnd(16) +
        sellStr.padEnd(14) +
        marginStr.padEnd(14) +
        r.status
      );
    }
  }

  console.log('\n========================================================================================');
  console.log('📈 SUMMARY OF FINDINGS');
  console.log('========================================================================================');
  console.log(`Total Active Plans Checked:     ${Object.keys(ACTIVE_APPROVED_PLANS).length}`);
  console.log(`🎉 Plans Cheaper (Discounts):   ${cheaperCount}`);
  console.log(`➡️  Plans with Same Price:      ${sameCount}`);
  console.log(`⚠️  Plans with Higher Price:    ${moreExpensiveCount}`);
  console.log(`❌ Plans Missing from Live API:  ${missingCount}`);
  console.log(`Total Old Wholesale Cost:       ₦${totalOldWholesale.toLocaleString()}`);
  console.log(`Total New Wholesale Cost:       ₦${totalNewWholesale.toLocaleString()}`);
  if (totalProfitIncrease > 0) {
    console.log(`💰 Total Wholesale Savings:      ₦${totalProfitIncrease.toLocaleString()}`);
  }
  console.log('========================================================================================\n');
}

main().catch(console.error);
