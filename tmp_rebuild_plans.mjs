// One-time script to rebuild plans_cache in Firestore using the locally cached API data
// and the new deterministic OFFICIAL_PRICES_MAP.
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import config
import { config } from './src/config/env.js';
import { db } from './src/services/firebase.js';

const OFFICIAL_PRICES_MAP = {
    // MTN DATA SHARE
    'mtn_data_share:M500MBS': 500, 'mtn_data_share:M1GBS': 800, 'mtn_data_share:M2GBS': 1000,
    'mtn_data_share:M3GBS': 1500, 'mtn_data_share:M1GBS2': 1000, 'mtn_data_share:M2GBS2': 1500,
    'mtn_data_share:M3GBS2': 2000, 'mtn_data_share:M5GBS': 3000,
    // MTN GIFTING
    'mtn_gifting_data:M110MBS': 100, 'mtn_gifting_data:M1m2GB': 500, 'mtn_gifting_data:M2m5GB': 600,
    'mtn_gifting_data:M2m5GBS': 900, 'mtn_gifting_data:M2GBS': 750, 'mtn_gifting_data:M3m2GBS': 1000,
    'mtn_gifting_data:M1GBS': 800, 'mtn_gifting_data:M2GBS2': 1500, 'mtn_gifting_data:M2m5GBS1': 2500,
    'mtn_gifting_data:M2m7GBS': 2000, 'mtn_gifting_data:M3m5GBS': 2500, 'mtn_gifting_data:M6GBS': 2500,
    'mtn_gifting_data:M7GBS': 3500, 'mtn_gifting_data:M11GBS': 3500, 'mtn_gifting_data:M12m5GBS': 5500,
    'mtn_gifting_data:M14m5GBS': 5000, 'mtn_gifting_data:M20GBS': 7500, 'mtn_gifting_data:M25GBS': 9000,
    'mtn_gifting_data:M36GBS': 11000, 'mtn_gifting_data:M65GBS': 16000, 'mtn_gifting_data:M75GBS': 18000,
    'mtn_gifting_data:M90GBS': 25000, 'mtn_gifting_data:M150GBS': 40000, 'mtn_gifting_data:M165GBS': 35000,
    'mtn_gifting_data:M200GBS': 50000, 'mtn_gifting_data:M250GBS': 55000, 'mtn_gifting_data:M800GBS': 125000,
    // AIRTEL
    'airtel_data:A200MB': 200, 'airtel_data:A300MB': 300, 'airtel_data:A1GBS': 350, 'airtel_data:A2GBS': 800,
    'airtel_data:A3a2GB': 1000, 'airtel_data:A5GB': 1500, 'airtel_data:A1GB': 800, 'airtel_data:A1a5GB': 1000,
    'airtel_data:A3a5GB': 1500, 'airtel_data:A6GB': 2500, 'airtel_data:A10GBS': 3000, 'airtel_data:A18GB': 5000,
    'airtel_data:A35GB': 10000, 'airtel_data:A2GB2': 1500, 'airtel_data:A3GB': 2000, 'airtel_data:A4GB': 2500,
    'airtel_data:A8GB': 3000, 'airtel_data:A10GB': 4000, 'airtel_data:A13GB': 5000, 'airtel_data:A18GB2': 6000,
    'airtel_data:A25GB': 8000, 'airtel_data:A60GB': 15000, 'airtel_data:A75GB': 15000,
    'airtel_data:A100GB': 20000, 'airtel_data:A160GB': 30000,
    // GLO
    'glo_data:G500MB': 250, 'glo_data:G1GB1': 300, 'glo_data:G3GB1': 800, 'glo_data:G5GB1': 1400,
    'glo_data:G1GB2': 350, 'glo_data:G3GB2': 1000, 'glo_data:G5GB2': 1500,
    'glo_data:G1GB3': null, 'glo_data:G3GB3': null, 'glo_data:G5GB3': null, 'glo_data:G10GB1': null,
    'glo_data:G1GB4': 500, 'glo_data:G2GB4': 1000, 'glo_data:G3GB4': 1300, 'glo_data:G5GB4': 2200, 'glo_data:G10GB2': 4500,
    // 9MOBILE
    '9mobile_data:E300MB': 200, '9mobile_data:E500MB': 300, '9mobile_data:E1GB': 500, '9mobile_data:E2GB': 1000,
    '9mobile_data:E3GB': 1500, '9mobile_data:E5GB': 2500, '9mobile_data:E10GB': 5000, '9mobile_data:E15GB': 7000,
    '9mobile_data:E20GB': 9500, '9mobile_data:E40GB': 19000,
};

function getMarkup(base) {
    if (base >= 3000) return 100;
    if (base >= 1000) return 50;
    if (base >= 500) return 20;
    return 15;
}

function applyPricing(plan) {
    const mapKey = `${plan.network}:${plan.plan_code}`;
    const official = OFFICIAL_PRICES_MAP[mapKey] ?? null;
    const basePrice = plan.amount;
    const markup = getMarkup(basePrice);
    let sellPrice = basePrice + markup;

    if (official !== null) {
        if (sellPrice < official) sellPrice = official;
        else if (sellPrice > official) sellPrice = official - 5;
    }

    const margin = sellPrice - basePrice;
    if (margin >= 500) sellPrice -= 50;
    else if (margin >= 200) sellPrice -= 20;
    else if (margin >= 100) sellPrice -= 10;
    else if (margin >= 50) sellPrice -= 5;

    if (sellPrice <= basePrice) sellPrice = basePrice + Math.max(5, markup);

    return { basePrice, markup, sellPrice, proxyCost: sellPrice, officialPrice: official };
}

// ========================
// LIVE PLAN DATA (fetched 2026-06-26 via PowerShell)
// ========================
const RAW_PLANS = {
    mtn_data_share: [
        { plan_code: 'M500MBS', amount: 350, label: '500MB = N350 (7 Days)' },
        { plan_code: 'M1GBS', amount: 450, label: '1GB = N450 (7 Days)' },
        { plan_code: 'M2GBS', amount: 850, label: '2GB = N850 (7 Days)' },
        { plan_code: 'M3GBS', amount: 1200, label: '3GB = N1200 (7 Days)' },
        { plan_code: 'M1GBS2', amount: 580, label: '1GB = N580 (30 Days)' },
        { plan_code: 'M2GBS2', amount: 950, label: '2GB = N950 (30 Days)' },
        { plan_code: 'M3GBS2', amount: 1250, label: '3GB = N1250 (30 Days)' },
        { plan_code: 'M5GBS', amount: 1800, label: '5GB = N1800 (30 Days)' },
    ],
    mtn_gifting_data: [
        { plan_code: 'M110MBS', amount: 99, label: '110MB = N99 (1 Day)' },
        { plan_code: 'M1m2GB', amount: 495, label: '1.2GB = N495 (1 month) Access All Social Apps' },
        { plan_code: 'M2m5GB', amount: 650, label: '2.5GB = N650 (2 Days)12hrs YouTube Buffer' },
        { plan_code: 'M2m5GBS', amount: 893, label: '2.5GB = N893 (2 Days)' },
        { plan_code: 'M2GBS', amount: 745, label: '2GB = N745 (2 Days)' },
        { plan_code: 'M3m2GBS', amount: 990, label: '3.2GB = N990 (2 Days)' },
        { plan_code: 'M1GBS', amount: 796, label: '1GB = N796 (7Days)' },
        { plan_code: 'M2GBS2', amount: 1480, label: '2GB = N1480 (1 Month)' },
        { plan_code: 'M2m5GBS1', amount: 2480, label: '2.5GB = N2480 (1 Month)' },
        { plan_code: 'M2m7GBS', amount: 1990, label: '2.7GB = N1990 (1Month)' },
        { plan_code: 'M3m5GBS', amount: 2480, label: '3.5GB = N2480 (1 Month)' },
        { plan_code: 'M6GBS', amount: 2480, label: '6GB = N2480 (Weekly)' },
        { plan_code: 'M7GBS', amount: 3450, label: '7GB = N3450 (1 Month) +2GB All Night Streaming' },
        { plan_code: 'M11GBS', amount: 3500, label: '11GB = N3500 (Weekly)' },
        { plan_code: 'M12m5GBS', amount: 5435, label: '12.5GB = N5435(1 Month)' },
        { plan_code: 'M14m5GBS', amount: 4950, label: '14.5GB = N4950 (1 Month)' },
        { plan_code: 'M20GBS', amount: 7380, label: '20GB = N7380 (1MONTH) + 4GB All Night Streaming' },
        { plan_code: 'M25GBS', amount: 8850, label: '25GB = N8850 (1 Month)' },
        { plan_code: 'M36GBS', amount: 10850, label: '36GB = N10850 (1 Month)' },
        { plan_code: 'M65GBS', amount: 15800, label: '65GB = N15800 (1 Month)' },
        { plan_code: 'M75GBS', amount: 17700, label: '75GB = N17700 (1 Month)' },
        { plan_code: 'M90GBS', amount: 24650, label: '90GB = N24650 (2 Months)' },
        { plan_code: 'M150GBS', amount: 39500, label: '150GB = N39500 (2 Month)' },
        { plan_code: 'M165GBS', amount: 34500, label: '165GB = N34500 (1 Month)' },
        { plan_code: 'M200GBS', amount: 49200, label: '200GB = N49200 (2 Months)' },
        { plan_code: 'M250GBS', amount: 54500, label: '250GB = N54500 (1 Month)' },
        { plan_code: 'M800GBS', amount: 123500, label: '800GB = N123500 (1 Year)' },
    ],
    airtel_data: [
        { plan_code: 'A200MB', amount: 199, label: '200MB (2 Days)' },
        { plan_code: 'A300MB', amount: 298, label: '300MB (2 Days)' },
        { plan_code: 'A1GBS', amount: 338, label: '1GB Social (3 Days)' },
        { plan_code: 'A2GBS', amount: 782, label: '2GB (2 Days)' },
        { plan_code: 'A3a2GB', amount: 980, label: '3.2GB (2 Days)' },
        { plan_code: 'A5GB', amount: 1475, label: '5GB (2 Days)' },
        { plan_code: 'A1GB', amount: 830, label: '1GB (7 Days)' },
        { plan_code: 'A1a5GB', amount: 530, label: '1.5GB (7 Days)' },
        { plan_code: 'A3a5GB', amount: 1513, label: '3.5GB (7 Days)' },
        { plan_code: 'A6GB', amount: 2475, label: '6GB (7 Days)' },
        { plan_code: 'A10GBS', amount: 2975, label: '10GB (7 Days)' },
        { plan_code: 'A18GB', amount: 4955, label: '18GB (7 Days)' },
        { plan_code: 'A35GB', amount: 9900, label: '35GB Router (7 Days)' },
        { plan_code: 'A2GB2', amount: 1478, label: '2GB (30 Days)' },
        { plan_code: 'A3GB', amount: 1975, label: '3GB (30 Days)' },
        { plan_code: 'A4GB', amount: 2477, label: '4GB (30 Days)' },
        { plan_code: 'A8GB', amount: 2975, label: '8GB (30 Days)' },
        { plan_code: 'A10GB', amount: 3950, label: '10GB (30 Days)' },
        { plan_code: 'A13GB', amount: 4955, label: '13GB (30 Days)' },
        { plan_code: 'A18GB', amount: 5940, label: '18GB (30 Days)' },  // same code, different plan
        { plan_code: 'A25GB', amount: 7900, label: '25GB (30 Days)' },
        { plan_code: 'A60GB', amount: 14900, label: '60GB (30 Days)' },
        { plan_code: 'A75GB', amount: 14980, label: '75GB (30 Days)' },
        { plan_code: 'A100GB', amount: 19800, label: '100GB (30 Days)' },
        { plan_code: 'A160GB', amount: 29750, label: '160GB (30 Days)' },
    ],
    glo_data: [
        { plan_code: 'G500MB', amount: 245, label: '500MB (30 Days)' },
        { plan_code: 'G1GB1', amount: 270, label: '1GB (3 Days)' },
        { plan_code: 'G3GB1', amount: 850, label: '3GB (3 Days)' },
        { plan_code: 'G5GB1', amount: 1380, label: '5GB (3 Days)' },
        { plan_code: 'G1GB2', amount: 330, label: '1GB (7 Days)' },
        { plan_code: 'G3GB2', amount: 990, label: '3GB (7 Days)' },
        { plan_code: 'G5GB2', amount: 1580, label: '5GB (7 Days)' },
        { plan_code: 'G1GB3', amount: 330, label: '1GB Night (14 Days)' },
        { plan_code: 'G3GB3', amount: 1640, label: '5GB Night (14 Days)' },
        { plan_code: 'G5GB3', amount: 3300, label: '10GB Night (14 Days)' },
        { plan_code: 'G10GB1', amount: 3300, label: '10GB Night alt' },
        { plan_code: 'G1GB4', amount: 450, label: '1GB (30 Days)' },
        { plan_code: 'G2GB4', amount: 900, label: '2GB (30 Days)' },
        { plan_code: 'G3GB4', amount: 1350, label: '3GB (30 Days)' },
        { plan_code: 'G5GB4', amount: 2200, label: '5GB (30 Days)' },
        { plan_code: 'G10GB2', amount: 4250, label: '10GB (30 Days)' },
    ],
    '9mobile_data': [
        { plan_code: 'E300MB', amount: 200, label: '300MB (30 Days)' },
        { plan_code: 'E500MB', amount: 300, label: '500MB (30 Days)' },
        { plan_code: 'E1GB', amount: 500, label: '1GB (30 Days)' },
        { plan_code: 'E2GB', amount: 980, label: '2GB (30 Days)' },
        { plan_code: 'E3GB', amount: 1500, label: '3GB (30 Days)' },
        { plan_code: 'E5GB', amount: 2500, label: '5GB (30 Days)' },
        { plan_code: 'E10GB', amount: 5000, label: '10GB (30 Days)' },
        { plan_code: 'E15GB', amount: 6950, label: '15GB Gifting (30 Days)' },
        { plan_code: 'E20GB', amount: 9500, label: '20GB (30 Days)' },
        { plan_code: 'E40GB', amount: 18800, label: '40GB (30 Days)' },
    ],
};

// Fix Airtel A18GB collision: 18GB 30-day needs a unique key
// We handle it by tracking a per-network-plan_code encounter count
const networks = ['mtn_data_share', 'mtn_gifting_data', 'airtel_data', 'glo_data', '9mobile_data'];
let serial = 1;
let allPlans = [];
const seen = {};

for (const net of networks) {
    for (const p of RAW_PLANS[net]) {
        const baseSeenKey = `${net}:${p.plan_code}`;
        seen[baseSeenKey] = (seen[baseSeenKey] || 0) + 1;
        // For the second occurrence of the same plan_code within the same network, use a '2' suffix key
        const mapKey = seen[baseSeenKey] > 1 ? `${net}:${p.plan_code}2` : baseSeenKey;
        const official = OFFICIAL_PRICES_MAP[mapKey] ?? null;
        const pricing = applyPricing({ ...p, network: net, plan_code_orig: p.plan_code });

        allPlans.push({
            id: `${net}_${p.plan_code}_${serial}`,
            network: net,
            plan_code: p.plan_code,
            name: p.label,
            basePrice: p.amount,
            markup: pricing.markup,
            sellPrice: pricing.sellPrice,
            proxyCost: pricing.proxyCost,
            officialPrice: official,
            serial: serial++,
            updatedAt: new Date().toISOString(),
        });
    }
}

console.log(`Built ${allPlans.length} plans. Writing to Firestore...`);

// Spot check
const spot = (code, net) => allPlans.find(p => p.plan_code === code && p.network === net);
console.log('MTN Share 500MB:', spot('M500MBS', 'mtn_data_share')?.sellPrice, '(expected ~490)');
console.log('MTN Gifting 110MB:', spot('M110MBS', 'mtn_gifting_data')?.sellPrice, '(expected ~114: cost=99, official=100, so floor)');
console.log('Airtel 200MB:', spot('A200MB', 'airtel_data')?.sellPrice, '(expected ~214)');
console.log('Glo 10GB 30d:', spot('G10GB2', 'glo_data')?.sellPrice, '(expected ~4480)');
console.log('9mobile 1GB:', spot('E1GB', '9mobile_data')?.sellPrice, '(expected ~520)');

// Write to Firestore
if (db.plansCache) {
    const batch = db.plansCache.firestore.batch();
    // Clear old docs first by re-setting them all
    for (const p of allPlans) {
        const ref = db.plansCache.doc(p.id);
        batch.set(ref, p, { merge: false }); // full overwrite
    }
    await batch.commit();
    console.log('✅ Firestore plans_cache updated successfully!');
} else {
    console.log('⚠️ db.plansCache not available, skipping Firestore write');
}
process.exit(0);
