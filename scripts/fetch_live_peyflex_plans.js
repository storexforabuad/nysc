import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config, logger } from '../src/config/env.js';

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
    timeout: 20000
});

const NETWORKS = [
    { key: 'mtn_data_share', label: 'MTN (SME / Data Share)', networkName: 'MTN' },
    { key: 'mtn_gifting_data', label: 'MTN (Direct Gifting)', networkName: 'MTN' },
    { key: 'airtel_data', label: 'Airtel Data', networkName: 'Airtel' },
    { key: 'glo_data', label: 'Glo Data', networkName: 'Glo' },
    { key: '9mobile_data', label: '9mobile Data', networkName: '9mobile' }
];

function extractDetails(label) {
    const raw = label || '';

    // Extract capacity (e.g. 500MB, 1.5GB, 2GB, 10GB, 100GB)
    const capMatch = raw.match(/(\d+(?:\.\d+)?\s*(?:MB|GB|TB))/i);
    const capacity = capMatch ? capMatch[1].toUpperCase().replace(/\s+/, '') : 'N/A';

    // Extract duration (e.g. 1 Day, 2 Days, 7 Days, 14 Days, 30 Days, 1 Month, 1 Year)
    const durMatch = raw.match(/(\d+\s*(?:day|days|month|months|week|weeks|year|years|hr|hrs))/i) 
                  || raw.match(/\b(daily|weekly|monthly|yearly)\b/i);
    const duration = durMatch ? durMatch[1] : 'Standard / 30 Days';

    return { capacity, duration };
}

async function run() {
    console.log('📡 Connecting to Peyflex API to query latest live data plans for all 4 networks...\n');

    const networkResults = {};
    let totalPlansCount = 0;

    for (const net of NETWORKS) {
        process.stdout.write(`Fetching ${net.label}... `);
        let plans = [];
        let lastError = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await client.get(`/api/data/plans/?network=${net.key}`);
                plans = res.data?.plans || [];
                lastError = null;
                break;
            } catch (err) {
                lastError = err;
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        if (!lastError) {
            console.log(`✅ ${plans.length} plans found.`);
            networkResults[net.key] = { meta: net, plans };
            totalPlansCount += plans.length;
        } else {
            console.log(`❌ Error: ${lastError.response?.data?.message || lastError.message}`);
            networkResults[net.key] = { meta: net, plans: [], error: lastError.message };
        }
    }

    console.log(`\nTotal plans fetched: ${totalPlansCount}`);

    // Build comprehensive structured Markdown file
    let md = `# 📡 Peyflex Live Telecommunications Data Catalog (All 4 Networks)\n\n`;
    md += `*Queried on: ${new Date().toISOString()}*\n`;
    md += `*API Base: ${PEYFLEX_BASE}*\n\n`;
    md += `This catalog contains all real-time data plans, wholesale base costs, validity durations, and capacities directly from the Peyflex wholesale aggregator API.\n\n`;
    md += `---\n\n`;

    // Summary table
    md += `## 📊 Summary by Network\n\n`;
    md += `| Network Category | Identifier | Total Plans Available |\n`;
    md += `| :--- | :--- | :---: |\n`;
    for (const net of NETWORKS) {
        const count = networkResults[net.key]?.plans?.length || 0;
        md += `| **${net.label}** | \`${net.key}\` | ${count} |\n`;
    }
    md += `| **TOTAL** | | **${totalPlansCount}** |\n\n`;
    md += `---\n\n`;

    // Network breakdowns
    for (const net of NETWORKS) {
        const data = networkResults[net.key];
        const plans = data.plans || [];

        md += `## 🌐 ${net.label} (\`${net.key}\`)\n\n`;

        if (plans.length === 0) {
            md += `*No plans returned or error: ${data.error || 'Empty'}*\n\n`;
            continue;
        }

        md += `| # | Plan Code | Plan Name / Label | Capacity | Duration | Base Wholesale Price (₦) |\n`;
        md += `| :-: | :--- | :--- | :-: | :-: | --: |\n`;

        plans.forEach((p, idx) => {
            const { capacity, duration } = extractDetails(p.label);
            const price = Number(p.amount).toLocaleString();
            md += `| ${idx + 1} | \`${p.plan_code}\` | ${p.label} | **${capacity}** | ${duration} | ₦${price} |\n`;
        });

        md += `\n`;
    }

    const outputPath = path.resolve('PEYFLEX_LIVE_DATA_PLANS.md');
    fs.writeFileSync(outputPath, md, 'utf-8');
    console.log(`\n💾 Saved markdown catalog to: ${outputPath}`);

    // Also save raw JSON for programmatic queries
    const jsonPath = path.resolve('storage/peyflex_plans_raw.json');
    const storageDir = path.resolve('storage');
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(networkResults, null, 2), 'utf-8');
    console.log(`💾 Saved raw JSON data to: ${jsonPath}`);
}

run().catch(err => {
    console.error('Fatal execution error:', err);
});
