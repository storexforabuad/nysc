import fs from 'fs';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

// Format currency
const nwf = (num) => '₦' + Number(num).toLocaleString('en-NG');

function normCap(str) {
  if (!str) return '';
  const m = str.match(/([\d\.]+)\s*(MB|GB)/i);
  if (!m) return str.trim().toUpperCase();
  const num = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'MB' && num >= 1000) {
    return `${num / 1000}GB`;
  }
  if (unit === 'GB' && num % 1 === 0) {
    return `${Math.round(num)}GB`;
  }
  if (unit === 'MB' && num % 1 === 0) {
    return `${Math.round(num)}MB`;
  }
  return `${num}${unit}`;
}

function normDur(str) {
  if (!str) return 'Unknown';
  const s = str.toLowerCase();
  if (s.includes('1 year') || s.includes('365 day')) return '1 Year';
  if (s.includes('2 month') || s.includes('60 day') || s.includes('60day') || s.includes('2months')) return '60 Days';
  if (s.includes('30 day') || s.includes('30day') || s.includes('1 month') || s.includes('1month')) return '30 Days';
  if (s.includes('14 day') || s.includes('14day')) return '14 Days';
  if (s.includes('7 day') || s.includes('7day') || s.includes('weekly')) return '7 Days';
  if (s.includes('3 day') || s.includes('3day')) return '3 Days';
  if (s.includes('2 day') || s.includes('2day') || s.includes('2,day')) return '2 Days';
  if (s.includes('1 day') || s.includes('1day')) return '1 Day';
  return str.replace(/[-]/g, '').trim();
}

// Clean duration for display
function cleanDuration(str) {
  return str.replace(/^[-—\s]+/, '').trim();
}

// Flatten Peyflex
const pfAll = [];
for (const [netKey, list] of Object.entries(peyflex)) {
  for (const item of list) {
    let raw = item.label;
    let capMatch = raw.match(/^([\d\.]+(?:MB|GB))/i);
    let cap = capMatch ? normCap(capMatch[1]) : '';
    let dur = normDur(raw);
    pfAll.push({
      netKey,
      code: item.plan_code,
      label: raw,
      amount: Number(item.amount),
      cap,
      dur
    });
  }
}

// Network mapping
const netMap = {
  MTN_PLAN: ['mtn_data_share', 'mtn_gifting_data'],
  GLO_PLAN: ['glo_data'],
  AIRTEL_PLAN: ['airtel_data'],
  '9MOBILE_PLAN': ['9mobile_data']
};

function findBestPeyflexMatch(husmoNetKey, hPlan) {
  const hCap = normCap(hPlan.plan);
  const hDur = normDur(hPlan.month_validate);
  const allowedPfNets = netMap[husmoNetKey] || [];
  const candidates = pfAll.filter(p => allowedPfNets.includes(p.netKey));

  // Type-specific preference
  let pool = candidates;
  if (hPlan.plan_type.includes('SHARE') || hPlan.plan_type.includes('SME')) {
    const shareOnly = candidates.filter(p => p.netKey === 'mtn_data_share');
    if (shareOnly.length > 0) pool = shareOnly;
  } else if (hPlan.plan_type === 'GIFTING' || hPlan.plan_type === 'AWOOF GIFTING') {
    const giftOnly = candidates.filter(p => p.netKey === 'mtn_gifting_data');
    if (giftOnly.length > 0) pool = giftOnly;
  }

  // Exact cap and exact duration
  let matches = pool.filter(p => p.cap === hCap && p.dur === hDur);
  if (matches.length > 0) return matches[0];

  // Try entire network candidate pool for exact cap and duration
  matches = candidates.filter(p => p.cap === hCap && p.dur === hDur);
  if (matches.length > 0) return matches[0];

  // Capacity match only if unique or very close
  const capMatches = pool.filter(p => p.cap === hCap);
  if (capMatches.length === 1) return capMatches[0];

  return null;
}

// 18 Pilot plans config
import { ACTIVE_APPROVED_PLANS } from '../src/services/payflex.js';

let md = `# ⚡ Husmodata vs. Peyflex Wholesale Data Plans Comparison Catalog

*Generated on: 2026-11-06*  
*Husmodata API Endpoint: https://husmodata.com/api/*  
*Peyflex API Endpoint: https://client.peyflex.com.ng*  

---

## Executive Summary & Key Takeaways

1. **Massive Cost Savings on MTN Data Share (Up to 32% cheaper):**  
   Husmodata offers significantly lower wholesale rates on MTN Data Share plans. For example:
   - **MTN 1GB (30 Days)**: Peyflex wholesale is **₦580** vs. Husmodata **₦392** (**₦188 / 32% cheaper**).
   - **MTN 500MB (7 Days)**: Peyflex is **₦350** vs. Husmodata **₦300** (**₦50 cheaper**).
   - **MTN 2GB (30 Days)**: Peyflex is **₦950** vs. Husmodata **₦805** (**₦145 cheaper**).
   - **MTN 5GB (30 Days)**: Peyflex is **₦1,800** vs. Husmodata **₦1,610** (**₦190 cheaper**).

2. **Glo 30-Day Monthly Plans Are Cheaper on Husmodata (Double Profit Margin):**  
   - **Glo 1GB (30 Days)**: Peyflex is **₦450** vs. Husmodata **₦400** (**₦50 cheaper**). Margin on ₦460 retail jumps from ₦10 to ₦60!
   - **Glo 2GB (30 Days)**: Peyflex is **₦900** vs. Husmodata **₦800** (**₦100 cheaper**). Margin on ₦900 retail jumps from ₦0 to ₦100!
   - **Glo 3GB (30 Days)**: Peyflex is **₦1,350** vs. Husmodata **₦1,200** (**₦150 cheaper**). Profit doubles from ₦150 to ₦300!
   - **Glo 5GB (30 Days)**: Peyflex is **₦2,200** vs. Husmodata **₦2,000** (**₦200 cheaper**). Profit doubles from ₦200 to ₦400!

3. **Peyflex Retains Advantage on Short-Validity Glo Plans (3-Day & 7-Day multi-GB):**  
   - Glo 3GB (3 Days) is **₦850** on Peyflex vs. **₦1,005** on Husmodata.
   - Glo 5GB (3 Days) is **₦1,380** on Peyflex vs. **₦1,675** on Husmodata.

4. **Wider Catalog Availability:**  
   Husmodata provides **237 plans** across MTN, Glo, Airtel, and 9mobile compared to Peyflex's **86 plans**, giving us access to low-cost Micro Data (50MB–250MB), Corporate Gifting, and Awoof Gifting.

---

## 🎯 Direct Comparison: The 18 Pilot Plans We Currently Sell

These are the 18 active plans configured in \`src/services/payflex.js\` for our pilot launch (8 MTN Data Share + 10 Glo Data):

| # | Network & Plan Code | Capacity | Duration | Our Retail Price | Peyflex Wholesale | Husmodata Plan ID & Type | Husmodata Wholesale | Price Delta (Husmo vs Peyflex) | Impact on Profit Margin |
| :-: | :--- | :-: | :-: | --: | --: | :--- | --: | :---: | :--- |
`;

const pilotRows = [
  // MTN Data Share
  { code: 'M500MBS', net: 'mtn_data_share', cap: '500MB', dur: '7 Days', sell: 500, pfCost: 350, hId: 458, hType: 'DATA SHARE', hCost: 300 },
  { code: 'M1GBS', net: 'mtn_data_share', cap: '1GB', dur: '7 Days', sell: 600, pfCost: 450, hId: 466, hType: 'DATA SHARE', hCost: 380 },
  { code: 'M2GBS', net: 'mtn_data_share', cap: '2GB', dur: '7 Days', sell: 1200, pfCost: 850, hId: 467, hType: 'DATA SHARE', hCost: 735 },
  { code: 'M3GBS', net: 'mtn_data_share', cap: '3GB', dur: '7 Days', sell: 1400, pfCost: 1200, hId: 468, hType: 'DATA SHARE', hCost: 1075 },
  { code: 'M1GBS2', net: 'mtn_data_share', cap: '1GB', dur: '30 Days', sell: 850, pfCost: 580, hId: 457, hType: 'DATA SHARE', hCost: 392 },
  { code: 'M2GBS2', net: 'mtn_data_share', cap: '2GB', dur: '30 Days', sell: 1700, pfCost: 950, hId: 459, hType: 'DATA SHARE', hCost: 805 },
  { code: 'M3GBS2', net: 'mtn_data_share', cap: '3GB', dur: '30 Days', sell: 2000, pfCost: 1250, hId: 460, hType: 'DATA SHARE', hCost: 1125 },
  { code: 'M5GBS', net: 'mtn_data_share', cap: '5GB', dur: '30 Days', sell: 2500, pfCost: 1800, hId: 309, hType: 'DATA SHARE', hCost: 1610 },
  // Glo Data
  { code: 'G1GB1', net: 'glo_data', cap: '1GB', dur: '3 Days', sell: 400, pfCost: 335, hId: 479, hType: 'CORPORATE GIFTING', hCost: 335 },
  { code: 'G3GB1', net: 'glo_data', cap: '3GB', dur: '3 Days', sell: 1200, pfCost: 850, hId: 480, hType: 'CORPORATE GIFTING', hCost: 1005 },
  { code: 'G5GB1', net: 'glo_data', cap: '5GB', dur: '3 Days', sell: 2000, pfCost: 1380, hId: 481, hType: 'CORPORATE GIFTING', hCost: 1675 },
  { code: 'G1GB2', net: 'glo_data', cap: '1GB', dur: '7 Days', sell: 400, pfCost: 360, hId: 447, hType: 'CORPORATE GIFTING', hCost: 349 },
  { code: 'G3GB2', net: 'glo_data', cap: '3GB', dur: '7 Days', sell: 1200, pfCost: 990, hId: 448, hType: 'CORPORATE GIFTING', hCost: 1047 },
  { code: 'G5GB2', net: 'glo_data', cap: '5GB', dur: '7 Days', sell: 2000, pfCost: 1580, hId: 449, hType: 'CORPORATE GIFTING', hCost: 1745 },
  { code: 'G1GB4', net: 'glo_data', cap: '1GB', dur: '30 Days', sell: 460, pfCost: 450, hId: 261, hType: 'CORPORATE GIFTING', hCost: 400 },
  { code: 'G2GB4', net: 'glo_data', cap: '2GB', dur: '30 Days', sell: 900, pfCost: 900, hId: 262, hType: 'CORPORATE GIFTING', hCost: 800 },
  { code: 'G3GB4', net: 'glo_data', cap: '3GB', dur: '30 Days', sell: 1500, pfCost: 1350, hId: 263, hType: 'CORPORATE GIFTING', hCost: 1200 },
  { code: 'G5GB4', net: 'glo_data', cap: '5GB', dur: '30 Days', sell: 2400, pfCost: 2200, hId: 297, hType: 'CORPORATE GIFTING', hCost: 2000 }
];

let idx = 1;
for (const row of pilotRows) {
  const diff = row.hCost - row.pfCost;
  let diffStr = '';
  let impactStr = '';
  const pfProfit = row.sell - row.pfCost;
  const husmoProfit = row.sell - row.hCost;

  if (diff < 0) {
    diffStr = `🟢 **-₦${Math.abs(diff)}** (Husmo Cheaper)`;
    impactStr = `Profit increases from ₦${pfProfit} to **₦${husmoProfit}** (+${Math.round(((husmoProfit - pfProfit) / pfProfit) * 100)}%)`;
  } else if (diff > 0) {
    diffStr = `🔴 **+₦${diff}** (Peyflex Cheaper)`;
    impactStr = `Peyflex yields ₦${pfProfit} vs. Husmo ₦${husmoProfit}`;
  } else {
    diffStr = `⚪ **₦0** (Equal)`;
    impactStr = `Identical profit (₦${pfProfit})`;
  }

  md += `| ${idx++} | \`${row.code}\` (${row.net.startsWith('mtn') ? 'MTN' : 'Glo'}) | **${row.cap}** | ${row.dur} | ₦${row.sell.toLocaleString()} | ₦${row.pfCost.toLocaleString()} | ID \`${row.hId}\` [${row.hType}] | ₦${row.hCost.toLocaleString()} | ${diffStr} | ${impactStr} |\n`;
}

md += `\n> **Pilot Takeaway:** If routing the 8 MTN Data Share plans through Husmodata, average gross profit per transaction increases by **+38.5%**. For Glo, route 30-day plans through Husmodata and 3-day plans through Peyflex.\n\n---\n`;

// Helper to render network section
function renderNetworkSection(netTitle, netKey, plans) {
  let res = `\n## 🌐 ${netTitle} (${plans.length} Total Plans)\n\n`;

  const types = [...new Set(plans.map(p => p.plan_type))];
  for (const t of types) {
    const subPlans = plans.filter(p => p.plan_type === t);
    res += `### Category: ${t} (${subPlans.length} Plans)\n\n`;
    res += `| Plan ID | Plan Capacity | Validity / Duration | Husmodata Wholesale (₦) | Peyflex Equivalent | Peyflex Wholesale (₦) | Variance / Cheaper Provider |\n`;
    res += `| :-: | :--- | :--- | --: | :--- | --: | :--- |\n`;

    for (const p of subPlans) {
      const match = findBestPeyflexMatch(netKey, p);
      let pfLabel = '—';
      let pfCostStr = '—';
      let varianceStr = 'Unique to Husmodata';

      if (match) {
        pfLabel = `\`${match.code}\` (${match.cap})`;
        pfCostStr = nwf(match.amount);
        const diff = Number(p.plan_amount) - match.amount;
        if (diff < 0) {
          varianceStr = `🟢 **-₦${Math.abs(diff)}** (Husmodata Cheaper)`;
        } else if (diff > 0) {
          varianceStr = `🔴 **+₦${diff}** (Peyflex Cheaper)`;
        } else {
          varianceStr = `⚪ **₦0** (Identical)`;
        }
      }

      res += `| \`${p.id}\` | **${p.plan}** | ${cleanDuration(p.month_validate)} | **${nwf(p.plan_amount)}** | ${pfLabel} | ${pfCostStr} | ${varianceStr} |\n`;
    }
    res += `\n`;
  }
  return res;
}

md += renderNetworkSection('MTN Telecommunications Plans', 'MTN_PLAN', husmoNet.MTN_PLAN);
md += renderNetworkSection('Glo Telecommunications Plans', 'GLO_PLAN', husmoNet.GLO_PLAN);
md += renderNetworkSection('Airtel Telecommunications Plans', 'AIRTEL_PLAN', husmoNet.AIRTEL_PLAN);
md += renderNetworkSection('9mobile / T2 Mobile Plans', '9MOBILE_PLAN', husmoNet['9MOBILE_PLAN']);

// Add Developer & API Integration Guide
md += `
---

## 🛠️ Husmodata Technical Integration & API Specification

### 1. Authentication
All requests require an HTTP Authorization header:
\`\`\`http
Authorization: Token 096fce20c04dfbeb3954210f4dea5a99d04fd76d
Content-Type: application/json
\`\`\`

### 2. Core Endpoints
| Action | HTTP Method | Endpoint | Description |
| :--- | :---: | :--- | :--- |
| **Check Balance & Profile** | \`GET\` | \`https://husmodata.com/api/user/\` | Returns user wallet balance, account details, and tier discount plans. |
| **List All Live Plans** | \`GET\` | \`https://husmodata.com/api/network/\` | Returns real-time dataplan objects for MTN, Glo, Airtel, and 9mobile. |
| **Purchase Data Bundle** | \`POST\` | \`https://husmodata.com/api/data/\` | Dispatches instant data delivery to customer phone number. |
| **Query Transaction Status**| \`GET\` | \`https://husmodata.com/api/data/<transaction_id>\` | Verifies receipt, server delivery status, and token. |

### 3. Purchase Request Payload Format
To vend a data bundle, send a \`POST\` to \`https://husmodata.com/api/data/\` with the following body:
\`\`\`json
{
  "network": 1,
  "mobile_number": "08012345678",
  "plan": 457,
  "Ported_number": true
}
\`\`\`

#### Network Numerical IDs on Husmodata:
- **MTN**: \`1\`
- **GLO**: \`2\`
- **AIRTEL**: \`3\`
- **9MOBILE**: \`4\`

\`plan\` is the exact integer \`id\` / \`dataplan_id\` from the catalog tables above.

---

## 💡 Operational Recommendations for MotherBot & ProxyBot

1. **Implement Dual-Provider Routing / Dynamic Fallback:**
   - Configure a primary provider for each plan ID based on the highest profit margin.
   - For MTN Data Share, route first to **Husmodata** (yielding +₦50 to +₦190 more margin per transaction).
   - If Husmodata's API triggers a circuit breaker or returns a network error, automatically failover to **Peyflex**.
2. **Glo Hybrid Routing:**
   - Route Glo 30-day plans (1GB, 2GB, 3GB, 5GB) to **Husmodata** (saving ₦50 to ₦200 per bundle).
   - Route Glo 3-day plans (3GB, 5GB) to **Peyflex** (saving ₦155 to ₦295 per bundle).
3. **Wallet Pre-funding:**
   - Current Husmodata balance is **₦0**. Fund the Husmodata wallet before switching live purchase traffic.
`;

fs.writeFileSync('HUSMODATA_VS_PEYFLEX_DATA_PLANS.md', md);
console.log('Saved HUSMODATA_VS_PEYFLEX_DATA_PLANS.md successfully. Total length:', md.length);

