import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { config } from './src/config/env.js';
import { db } from './src/services/firebase.js';

async function run() {
    if (!db.plansCache) {
        console.error('db.plansCache unavailable');
        process.exit(1);
    }
    const snap = await db.plansCache.get();
    const plans = snap.docs.map(d => d.data());

    // Sort plans by network then sellPrice
    plans.sort((a, b) => {
        if (a.network !== b.network) return a.network.localeCompare(b.network);
        return a.sellPrice - b.sellPrice;
    });

    console.log(JSON.stringify(plans, null, 2));
    process.exit(0);
}

run().catch(console.error);
