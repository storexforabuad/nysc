import axios from 'axios';
import { config, logger } from '../config/env.js';
import { db } from './firebase.js';
import CircuitBreaker from 'opossum';

// Tiered markup: fallback for minimum markup.
const getTieredMarkup = (basePrice) => {
  if (basePrice >= 3000) return 100;
  if (basePrice >= 1000) return 50;
  if (basePrice >= 500) return 20;
  return 15;
};

// Airtime parameters: sold at face value
export const AIRTIME_MIN = 50;
export const AIRTIME_MAX = 50000;

// Exam PIN products (WAEC & NECO)
export const EXAM_PIN_PRODUCTS = {
  WAEC: { name: 'WAEC Result Checker PIN', sellPrice: 4500, productCode: 'waec' },
  NECO: { name: 'NECO Result Checker PIN', sellPrice: 1500, productCode: 'neco' }
};

// Deterministic plan_code → officialPrice map, built from master_pricing_strategy_dashboard.html.
// Keyed by Payflex plan_code so it is IMMUNE to API ordering/count changes.
// MTN Share plan codes that collide with Gifting (e.g. M2GBS) are prefixed with their network.

const analyzeDuration = (label) => {
  const lbl = label.toLowerCase();
  let priority = 99;
  let category = 'Other Plans';

  if (lbl.includes('1 day') || lbl.includes('1day')) { priority = 1; category = '⚡ *1-Day Plans:*'; }
  else if (lbl.includes('2 day') || lbl.includes('2day')) { priority = 2; category = '⚡ *2-Day Plans:*'; }
  else if (lbl.includes('3 day') || lbl.includes('3day')) { priority = 3; category = '⚡ *3-Day Plans:*'; }
  else if (lbl.includes('7 day') || lbl.includes('7day') || lbl.includes('weekly')) { priority = 7; category = '📅 *7-Day Plans:*'; }
  else if (lbl.includes('14 day') || lbl.includes('14day')) { priority = 14; category = '📅 *14-Day Plans:*'; }
  else if (lbl.includes('1 month') || lbl.includes('30 day') || lbl.includes('30day') || lbl.includes('1month')) { priority = 30; category = '🗓️ *30-Day/Monthly Plans:*'; }
  else if (lbl.includes('2 month') || lbl.includes('60 day') || lbl.includes('60day') || lbl.includes('2months')) { priority = 60; category = '🗓️ *2-Month Plans:*'; }
  else if (lbl.includes('1 year') || lbl.includes('365 day')) { priority = 365; category = '💎 *Yearly Plans:*'; }

  return { category, priority };
};

export const calculatePaystackFee = (amount) => {
  const num = Number(amount) || 0;
  if (num < 2500) {
    return Math.round(num * 0.015);
  }
  return Math.min(2000, Math.round(num * 0.015 + 100));
};

export const ACTIVE_APPROVED_PLANS = {
  // ──────────────────────────────────────────
  // 🌐 MTN (SME / Data Share) - 8 plans
  // ──────────────────────────────────────────
  'mtn_data_share:M500MBS': {
    name: '500MB',
    sellPrice: 500,
    officialPrice: 500,
    basePrice: 350,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'mtn_data_share:M1GBS': {
    name: '1GB',
    sellPrice: 800,
    officialPrice: 800,
    basePrice: 450,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'mtn_data_share:M2GBS': {
    name: '2GB',
    sellPrice: 1200,
    officialPrice: 1333,
    basePrice: 850,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'mtn_data_share:M3GBS': {
    name: '3GB',
    sellPrice: 1400,
    officialPrice: 1400,
    basePrice: 1200,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'mtn_data_share:M1GBS2': {
    name: '1GB',
    sellPrice: 850,
    officialPrice: 1000,
    basePrice: 580,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_data_share:M2GBS2': {
    name: '2GB',
    sellPrice: 1700,
    officialPrice: 1500,
    basePrice: 950,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_data_share:M3GBS2': {
    name: '3GB',
    sellPrice: 2000,
    officialPrice: 2000,
    basePrice: 1250,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_data_share:M5GBS': {
    name: '5GB',
    sellPrice: 2500,
    officialPrice: 3000,
    basePrice: 1800,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },

  // ──────────────────────────────────────────
  // 🌐 MTN (Direct Gifting) - 15 plans
  // ──────────────────────────────────────────
  'mtn_gifting_data:M110MBS': {
    name: '110MB',
    sellPrice: 100,
    officialPrice: 100,
    basePrice: 99,
    durationCategory: '⚡ *1-Day Plans:*',
    durationPriority: 1
  },
  'mtn_gifting_data:M6GBS': {
    name: '6GB',
    sellPrice: 2500,
    officialPrice: 2500,
    basePrice: 2480,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'mtn_gifting_data:M7GBS': {
    name: '7GB (+2GB All Night Streaming)',
    sellPrice: 3500,
    officialPrice: 3500,
    basePrice: 3450,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M14m5GBS': {
    name: '14.5GB',
    sellPrice: 5000,
    officialPrice: 5000,
    basePrice: 4950,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M20GBS': {
    name: '20GB (+4GB All Night Streaming)',
    sellPrice: 7500,
    officialPrice: 7500,
    basePrice: 7380,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M25GBS': {
    name: '25GB',
    sellPrice: 9000,
    officialPrice: 9000,
    basePrice: 8850,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M36GBS': {
    name: '36GB',
    sellPrice: 11000,
    officialPrice: 11000,
    basePrice: 10850,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M65GBS': {
    name: '65GB',
    sellPrice: 16000,
    officialPrice: 16000,
    basePrice: 15800,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M75GBS': {
    name: '75GB',
    sellPrice: 18000,
    officialPrice: 18000,
    basePrice: 17800,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M90GBS': {
    name: '90GB',
    sellPrice: 25000,
    officialPrice: 25000,
    basePrice: 24650,
    durationCategory: '🗓️ *2-Month Plans:*',
    durationPriority: 60
  },
  'mtn_gifting_data:M150GBS': {
    name: '150GB',
    sellPrice: 40000,
    officialPrice: 40000,
    basePrice: 39500,
    durationCategory: '🗓️ *2-Month Plans:*',
    durationPriority: 60
  },
  'mtn_gifting_data:M165GBS': {
    name: '165GB',
    sellPrice: 35000,
    officialPrice: 35000,
    basePrice: 34500,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M200GBS': {
    name: '200GB',
    sellPrice: 50000,
    officialPrice: 50000,
    basePrice: 49200,
    durationCategory: '🗓️ *2-Month Plans:*',
    durationPriority: 60
  },
  'mtn_gifting_data:M250GBS': {
    name: '250GB',
    sellPrice: 55000,
    officialPrice: 55000,
    basePrice: 54500,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'mtn_gifting_data:M800GBS': {
    name: '800GB',
    sellPrice: 125000,
    officialPrice: 125000,
    basePrice: 123500,
    durationCategory: '💎 *Yearly Plans:*',
    durationPriority: 365
  },

  // ──────────────────────────────────────────
  // 🌐 Airtel Data - 21 plans
  // ──────────────────────────────────────────
  'airtel_data:A4GBS': {
    name: '4GB Binge Plan',
    sellPrice: 1000,
    officialPrice: 1000,
    basePrice: 990,
    durationCategory: '⚡ *2-Day Plans:*',
    durationPriority: 2
  },
  'airtel_data:A6GBS': {
    name: '6GB',
    sellPrice: 1500,
    officialPrice: 1500,
    basePrice: 1485,
    durationCategory: '⚡ *2-Day Plans:*',
    durationPriority: 2
  },
  'airtel_data:A1GB': {
    name: '1GB',
    sellPrice: 800,
    officialPrice: 800,
    basePrice: 795,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'airtel_data:A1a5GBS': {
    name: '1.5GB',
    sellPrice: 1000,
    officialPrice: 1000,
    basePrice: 995,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'airtel_data:A6GB': {
    name: '6GB',
    sellPrice: 2000,
    officialPrice: 2000,
    basePrice: 1970,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'airtel_data:A8GBS': {
    name: '8GB',
    sellPrice: 2500,
    officialPrice: 2500,
    basePrice: 2487,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'airtel_data:A10GBS': {
    name: '10GB',
    sellPrice: 3000,
    officialPrice: 3000,
    basePrice: 2975,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'airtel_data:A20GB': {
    name: '20GB',
    sellPrice: 5000,
    officialPrice: 5000,
    basePrice: 4950,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'airtel_data:A35GB': {
    name: '35GB Unlimited Ultra Router',
    sellPrice: 10000,
    officialPrice: 10000,
    basePrice: 9900,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'airtel_data:A2GB2': {
    name: '2GB',
    sellPrice: 1500,
    officialPrice: 1500,
    basePrice: 1478,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A3GB': {
    name: '3GB',
    sellPrice: 2000,
    officialPrice: 2000,
    basePrice: 1980,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A4GB': {
    name: '4GB',
    sellPrice: 2500,
    officialPrice: 2500,
    basePrice: 2477,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A8GB': {
    name: '8GB',
    sellPrice: 3000,
    officialPrice: 3000,
    basePrice: 2975,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A10GB': {
    name: '10GB',
    sellPrice: 4000,
    officialPrice: 4000,
    basePrice: 3950,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A13GB': {
    name: '13GB',
    sellPrice: 5000,
    officialPrice: 5000,
    basePrice: 4955,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A18GB': {
    name: '18GB',
    sellPrice: 6000,
    officialPrice: 6000,
    basePrice: 5940,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A25GB': {
    name: '25GB',
    sellPrice: 8000,
    officialPrice: 8000,
    basePrice: 7900,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A60GB': {
    name: '60GB',
    sellPrice: 15000,
    officialPrice: 15000,
    basePrice: 14900,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A75GB': {
    name: '75GB Router Plan',
    sellPrice: 15000,
    officialPrice: 15000,
    basePrice: 14980,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A100GB': {
    name: '100GB',
    sellPrice: 20000,
    officialPrice: 20000,
    basePrice: 19800,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'airtel_data:A160GB': {
    name: '160GB',
    sellPrice: 30000,
    officialPrice: 30000,
    basePrice: 29750,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },

  // ──────────────────────────────────────────
  // 🌐 Glo Data - 10 plans
  // ──────────────────────────────────────────
  'glo_data:G1GB1': {
    name: '1GB',
    sellPrice: 400,
    officialPrice: 400,
    basePrice: 335,
    durationCategory: '⚡ *3-Day Plans:*',
    durationPriority: 3
  },
  'glo_data:G3GB1': {
    name: '3GB',
    sellPrice: 1200,
    officialPrice: 1200,
    basePrice: 850,
    durationCategory: '⚡ *3-Day Plans:*',
    durationPriority: 3
  },
  'glo_data:G5GB1': {
    name: '5GB',
    sellPrice: 2000,
    officialPrice: 2000,
    basePrice: 1380,
    durationCategory: '⚡ *3-Day Plans:*',
    durationPriority: 3
  },
  'glo_data:G1GB2': {
    name: '1GB',
    sellPrice: 400,
    officialPrice: 400,
    basePrice: 360,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'glo_data:G3GB2': {
    name: '3GB',
    sellPrice: 1200,
    officialPrice: 1200,
    basePrice: 990,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'glo_data:G5GB2': {
    name: '5GB',
    sellPrice: 2000,
    officialPrice: 2000,
    basePrice: 1580,
    durationCategory: '📅 *7-Day Plans:*',
    durationPriority: 7
  },
  'glo_data:G1GB4': {
    name: '1GB',
    sellPrice: 460,
    officialPrice: 465,
    basePrice: 450,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'glo_data:G2GB4': {
    name: '2GB',
    sellPrice: 900,
    officialPrice: 900,
    basePrice: 900,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'glo_data:G3GB4': {
    name: '3GB',
    sellPrice: 1500,
    officialPrice: 1500,
    basePrice: 1350,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  },
  'glo_data:G5GB4': {
    name: '5GB',
    sellPrice: 2400,
    officialPrice: 2400,
    basePrice: 2200,
    durationCategory: '🗓️ *30-Day/Monthly Plans:*',
    durationPriority: 30
  }
};

class PayflexService {
  constructor() {
    this.client = axios.create({
      baseURL: process.env.PAYFLEX_BASE_URL || 'https://client.peyflex.com.ng',
      headers: {
        'Authorization': `Token ${process.env.PAYFLEX_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const breakerOptions = {
      timeout: 15000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    };

    this.getBreaker = new CircuitBreaker((url) => this.client.get(url), breakerOptions);
    this.getBreaker.fallback((url, err) => {
      throw new Error(`Peyflex API unavailable (${err.code || 'CIRCUIT_OPEN'}).`);
    });

    this.postBreaker = new CircuitBreaker((url, data) => this.client.post(url, data), breakerOptions);
    this.postBreaker.fallback((url, data, err) => {
      throw new Error(`Peyflex API unavailable (${err.code || 'CIRCUIT_OPEN'}).`);
    });

    this.client.interceptors.response.use(null, (error) => {
      if (error.response) {
        logger.error(`[PEYFLEX-RAW] HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      }
      return Promise.reject(error);
    });

    this.cachedPlans = [];
  }

  async syncPlans() {
    logger.info('Syncing curated data plans from Peyflex...');
    const networks = ['mtn_data_share', 'mtn_gifting_data', 'airtel_data', 'glo_data'];
    let allPlans = [];

    for (const net of networks) {
      try {
        const response = await this.getBreaker.fire(`/api/data/plans/?network=${net}`);
        if (response.data && response.data.plans) {
          allPlans = allPlans.concat(response.data.plans.map(p => ({ ...p, network: net })));
        }
      } catch (err) {
        logger.error(`Failed to fetch ${net} plans:`, err.message);
      }
    }

    if (allPlans.length > 0) {
      // Step 1: Strictly filter down to ONLY the approved 54 active plans
      allPlans = allPlans.filter(p => {
        const mapKey = `${p.network}:${p.plan_code}`;
        return !!ACTIVE_APPROVED_PLANS[mapKey];
      });

      // Step 2: Apply exact user prices, clean names, and duration categories
      allPlans = allPlans.map(p => {
        const mapKey = `${p.network}:${p.plan_code}`;
        const cfg = ACTIVE_APPROVED_PLANS[mapKey];

        return {
          id: `${p.network}_${p.plan_code}`,
          plan_code: p.plan_code,
          network: p.network,
          name: cfg.name,
          basePrice: p.amount || cfg.basePrice,
          markup: cfg.sellPrice - (p.amount || cfg.basePrice),
          proxyCost: cfg.sellPrice,
          sellPrice: cfg.sellPrice,
          officialPrice: cfg.officialPrice,
          durationCategory: cfg.durationCategory,
          durationPriority: cfg.durationPriority
        };
      });

      // Step 3: Sort by network order, duration priority, then sellPrice
      const netPriority = { mtn_data_share: 1, mtn_gifting_data: 2, airtel_data: 3, glo_data: 4 };
      allPlans.sort((a, b) => {
        if (netPriority[a.network] !== netPriority[b.network]) {
          return (netPriority[a.network] || 99) - (netPriority[b.network] || 99);
        }
        if (a.durationPriority !== b.durationPriority) {
          return a.durationPriority - b.durationPriority;
        }
        return a.sellPrice - b.sellPrice;
      });

      // Step 4: Assign sequential 1-54 serial numbers
      allPlans = allPlans.map((p, index) => ({
        ...p,
        serial: index + 1
      }));

      // Step 5: Flush stale Firestore cache & write fresh 54 plans
      if (db.plansCache) {
        try {
          const oldSnap = await db.plansCache.get();
          if (!oldSnap.empty) {
            const deleteBatch = db.plansCache.firestore.batch();
            oldSnap.docs.forEach(doc => deleteBatch.delete(doc.ref));
            await deleteBatch.commit();
            logger.info(`Cleared ${oldSnap.size} stale plans from Firestore cache.`);
          }

          const insertBatch = db.plansCache.firestore.batch();
          for (const p of allPlans) {
            const ref = db.plansCache.doc(p.id);
            insertBatch.set(ref, { ...p, updatedAt: new Date().toISOString() });
          }
          await insertBatch.commit();
          logger.info(`Wrote ${allPlans.length} active curated plans to Firestore cache.`);
        } catch (dbErr) {
          logger.warn(`Firestore plansCache sync warning: ${dbErr.message}`);
        }
      }

      this.cachedPlans = allPlans;
      logger.info(`Synced exactly ${allPlans.length} active plans successfully!`);
      return allPlans;
    }
    return [];
  }

  async getAvailablePlans() {
    if (this.cachedPlans && this.cachedPlans.length === 54) {
      return this.cachedPlans;
    }

    // Try to load from Firestore, but verify exact 54 active plan count
    if (db.plansCache) {
      try {
        const snapshot = await db.plansCache.get();
        if (!snapshot.empty && snapshot.size === 54) {
          const plans = snapshot.docs.map(doc => doc.data());
          // Verify that the cached plans match the current ACTIVE_APPROVED_PLANS prices
          const isValid = plans.every(p => {
            const key = `${p.network}:${p.plan_code}`;
            const expected = ACTIVE_APPROVED_PLANS[key];
            return expected && p.sellPrice === expected.sellPrice;
          });

          if (isValid) {
            this.cachedPlans = plans.sort((a, b) => a.serial - b.serial);
            return this.cachedPlans;
          }
          logger.info('Firestore plansCache has outdated prices. Triggering re-sync...');
        }
      } catch (e) {
        logger.warn('Error reading db.plansCache:', e.message);
      }
    }

    // Force sync to purge stale entries and refresh exact 54 plans
    return await this.syncPlans();
  }

  async dispenseData(phoneNumber, serialId) {
    try {
      const plan = this.cachedPlans.find(p => p.serial.toString() === serialId.toString())
        || (await this.getAvailablePlans()).find(p => p.serial.toString() === serialId.toString());

      if (!plan) throw new Error('Invalid plan selection');

      if (config.mockMode) {
        // Mock flow: if mobile number is '08000000000', simulate a telco network failure to trigger RetryQueue/Refunds
        if (phoneNumber === '08000000000') {
          logger.warn(`MOCK: Simulating Peyflex API failure for ${phoneNumber}`);
          throw new Error('MOCK TELCO NETWORK ERROR');
        }

        logger.info(`MOCK: Vended ${plan.name} to ${phoneNumber} successfully.`);
        return {
          status: 'success',
          reference: `MOCK_REF_${Date.now()}`,
          planDetails: plan,
          apiResponse: { status: 'SUCCESS', reference: `MOCK_REF_${Date.now()}` }
        };
      }

      logger.info(`Dispensing real data: ${plan.name} to ${phoneNumber} via Peyflex`);

      const response = await this.postBreaker.fire('/api/data/purchase/', {
        network: plan.network,
        mobile_number: phoneNumber,
        plan_code: plan.plan_code
      });

      if (response.data.status === 'SUCCESS') {
        logger.info(`Data vended successfully to ${phoneNumber}. Ref: ${response.data.reference}`);
        return {
          status: 'success',
          reference: response.data.reference,
          planDetails: plan,
          apiResponse: response.data
        };
      } else {
        throw new Error(response.data.message || 'Data vending failed at provider');
      }
    } catch (error) {
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      logger.error(`Error dispensing data to ${phoneNumber}: ${detail}`);
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  getExamProducts() {
    return EXAM_PIN_PRODUCTS;
  }

  async purchaseAirtime(network, phoneNumber, amount) {
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < AIRTIME_MIN || parsedAmount > AIRTIME_MAX) {
      throw new Error(`Airtime amount must be between ₦${AIRTIME_MIN} and ₦${AIRTIME_MAX.toLocaleString()}`);
    }

    const normalizedNetwork = (network || '').toLowerCase().trim();

    if (config.mockMode) {
      if (phoneNumber === '08000000000') {
        logger.warn(`MOCK: Simulating Payflex Airtime API failure for ${phoneNumber}`);
        throw new Error('MOCK TELCO NETWORK ERROR (AIRTIME)');
      }

      logger.info(`MOCK: Dispensed ₦${parsedAmount} ${normalizedNetwork.toUpperCase()} airtime to ${phoneNumber}`);
      return {
        status: 'success',
        reference: `MOCK_AIRTIME_${Date.now()}`,
        amount: parsedAmount,
        network: normalizedNetwork,
        phoneNumber,
        apiResponse: { status: 'SUCCESS', reference: `MOCK_AIRTIME_${Date.now()}` }
      };
    }

    logger.info(`Dispensing real airtime: ₦${parsedAmount} ${normalizedNetwork.toUpperCase()} to ${phoneNumber}`);
    try {
      const response = await this.postBreaker.fire('/api/airtime/topup/', {
        network: normalizedNetwork,
        mobile_number: phoneNumber,
        amount: parsedAmount
      });

      if (response.data.status === 'SUCCESS') {
        logger.info(`Airtime vended successfully to ${phoneNumber}. Ref: ${response.data.reference}`);
        return {
          status: 'success',
          reference: response.data.reference,
          amount: parsedAmount,
          network: normalizedNetwork,
          phoneNumber,
          apiResponse: response.data
        };
      } else {
        throw new Error(response.data.message || 'Airtime vending failed at provider');
      }
    } catch (error) {
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      logger.error(`Error vending airtime to ${phoneNumber}: ${detail}`);
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  async purchaseExamPin(examType) {
    const normalizedExam = (examType || '').toUpperCase().trim();
    const product = EXAM_PIN_PRODUCTS[normalizedExam];

    if (!product) {
      throw new Error(`Unsupported exam type: ${examType}. Supported: WAEC, NECO`);
    }

    if (config.mockMode) {
      const mockPin = `MOCK-${normalizedExam}-${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      const mockSerial = `${normalizedExam === 'WAEC' ? 'WC' : 'NC'}-MOCK-${Date.now().toString().slice(-6)}`;
      logger.info(`MOCK: Dispensed ${product.name}. PIN: ${mockPin}, Serial: ${mockSerial}`);
      return {
        status: 'success',
        reference: `MOCK_EXAM_${Date.now()}`,
        pin: mockPin,
        serialNumber: mockSerial,
        examType: normalizedExam,
        productName: product.name,
        price: product.sellPrice,
        apiResponse: { status: 'SUCCESS' }
      };
    }

    logger.info(`Purchasing real exam PIN: ${product.name}`);
    try {
      const response = await this.postBreaker.fire('/api/education/', {
        exam_type: product.productCode
      });

      if (response.data.status === 'SUCCESS') {
        const pin = response.data.pin || response.data.token || response.data.cards?.[0]?.pin || 'N/A';
        const serialNumber = response.data.serial || response.data.serial_number || response.data.cards?.[0]?.serial || 'N/A';
        return {
          status: 'success',
          reference: response.data.reference,
          pin,
          serialNumber,
          examType: normalizedExam,
          productName: product.name,
          price: product.sellPrice,
          apiResponse: response.data
        };
      } else {
        throw new Error(response.data.message || 'Exam PIN vending failed at provider');
      }
    } catch (error) {
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      logger.error(`Error purchasing exam PIN ${product.name}: ${detail}`);
      throw new Error(error.response?.data?.message || error.message);
    }
  }
}

export default new PayflexService();

