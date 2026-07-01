import axios from 'axios';
import { config, logger } from '../config/env.js';
import { db } from './firebase.js';

// Tiered markup: fallback for minimum markup.
const getTieredMarkup = (basePrice) => {
  if (basePrice >= 3000) return 100;
  if (basePrice >= 1000) return 50;
  if (basePrice >= 500) return 20;
  return 15;
};

// Deterministic plan_code → officialPrice map, built from master_pricing_strategy_dashboard.html.
// Keyed by Payflex plan_code so it is IMMUNE to API ordering/count changes.
// MTN Share plan codes that collide with Gifting (e.g. M2GBS) are prefixed with their network.
const OFFICIAL_PRICES_MAP = {
  // MTN DATA SHARE
  'mtn_data_share:M500MBS': 500,
  'mtn_data_share:M1GBS': 800,
  'mtn_data_share:M2GBS': 1000,
  'mtn_data_share:M3GBS': 1500,
  'mtn_data_share:M1GBS2': 1000,
  'mtn_data_share:M2GBS2': 1500,
  'mtn_data_share:M3GBS2': 2000,
  'mtn_data_share:M5GBS': 3000,
  // MTN GIFTING DATA
  'mtn_gifting_data:M110MBS': 100,
  'mtn_gifting_data:M1m2GB': 500,
  'mtn_gifting_data:M2m5GB': 600,
  'mtn_gifting_data:M2m5GBS': 900,
  'mtn_gifting_data:M2GBS': 750,
  'mtn_gifting_data:M3m2GBS': 1000,
  'mtn_gifting_data:M1GBS': 800,
  'mtn_gifting_data:M2GBS2': 1500,
  'mtn_gifting_data:M2m5GBS1': 2500,
  'mtn_gifting_data:M2m7GBS': 2000,
  'mtn_gifting_data:M3m5GBS': 2500,
  'mtn_gifting_data:M6GBS': 2500,
  'mtn_gifting_data:M7GBS': 3500,
  'mtn_gifting_data:M11GBS': 3500,
  'mtn_gifting_data:M12m5GBS': 5500,
  'mtn_gifting_data:M14m5GBS': 5000,
  'mtn_gifting_data:M20GBS': 7500,
  'mtn_gifting_data:M25GBS': 9000,
  'mtn_gifting_data:M36GBS': 11000,
  'mtn_gifting_data:M65GBS': 16000,
  'mtn_gifting_data:M75GBS': 18000,
  'mtn_gifting_data:M90GBS': 25000,
  'mtn_gifting_data:M150GBS': 40000,
  'mtn_gifting_data:M165GBS': 35000,
  'mtn_gifting_data:M200GBS': 50000,
  'mtn_gifting_data:M250GBS': 55000,
  'mtn_gifting_data:M800GBS': 125000,
  // AIRTEL DATA
  'airtel_data:A200MB': 200,
  'airtel_data:A300MB': 300,
  'airtel_data:A1GBS': 350,
  'airtel_data:A2GBS': 800,
  'airtel_data:A3a2GB': 1000,
  'airtel_data:A5GB': 1500,
  'airtel_data:A1GB': 800,
  'airtel_data:A1a5GB': 1000,
  'airtel_data:A3a5GB': 1500,
  'airtel_data:A6GB': 2500,
  'airtel_data:A10GBS': 3000,
  'airtel_data:A18GB': 5000,
  'airtel_data:A35GB': 10000,
  'airtel_data:A2GB2': 1500,
  'airtel_data:A3GB': 2000,
  'airtel_data:A4GB': 2500,
  'airtel_data:A8GB': 3000,
  'airtel_data:A10GB': 4000,
  'airtel_data:A13GB': 5000,
  'airtel_data:A18GB2': 6000,  // note: A18GB appears twice (7-day vs 30-day)
  'airtel_data:A25GB': 8000,
  'airtel_data:A60GB': 15000,
  'airtel_data:A75GB': 15000,
  'airtel_data:A100GB': 20000,
  'airtel_data:A160GB': 30000,
  // GLO DATA
  'glo_data:G500MB': 250,
  'glo_data:G1GB1': 300,
  'glo_data:G3GB1': 800,
  'glo_data:G5GB1': 1400,
  'glo_data:G1GB2': 350,
  'glo_data:G3GB2': 1000,
  'glo_data:G5GB2': 1500,
  'glo_data:G1GB3': null,
  'glo_data:G3GB3': null,
  'glo_data:G5GB3': null,
  'glo_data:G10GB1': null,
  'glo_data:G1GB4': 500,
  'glo_data:G2GB4': 1000,
  'glo_data:G3GB4': 1300,
  'glo_data:G5GB4': 2200,
  'glo_data:G10GB2': 4500,
  // 9MOBILE DATA
  '9mobile_data:E300MB': 200,
  '9mobile_data:E500MB': 300,
  '9mobile_data:E1GB': 500,
  '9mobile_data:E2GB': 1000,
  '9mobile_data:E3GB': 1500,
  '9mobile_data:E5GB': 2500,
  '9mobile_data:E10GB': 5000,
  '9mobile_data:E15GB': 7000,
  '9mobile_data:E20GB': 9500,
  '9mobile_data:E40GB': 19000,
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
    this.cachedPlans = [];
  }

  async syncPlans() {
    logger.info('Syncing real data plans from Peyflex...');
    const networks = ['mtn_data_share', 'mtn_gifting_data', 'airtel_data', 'glo_data', '9mobile_data'];
    let allPlans = [];

    for (const net of networks) {
      try {
        const response = await this.client.get(`/api/data/plans/?network=${net}`);
        if (response.data && response.data.plans) {
          const plans = response.data.plans.map((p, index) => {
            const markup = getTieredMarkup(p.amount);
            return {
              ...p,
              id: `${net}_${p.plan_code}_${index}`,
              network: net,
              basePrice: p.amount,              // Wholesale price paid to Peyflex
              markup,                           // Our profit on this plan (tiered)
              proxyCost: p.amount + markup,     // ✅ Fixed: actual sell price (no hidden split yet)
              sellPrice: p.amount + markup,     // What the end customer pays
              name: p.label
            };
          });
          allPlans = allPlans.concat(plans);
        }
      } catch (err) {
        logger.error(`Failed to fetch ${net} plans:`, err.message);
      }
    }

    if (allPlans.length > 0) {
      // Assign global serials and apply Official Price Ceiling + Smart Discount strategy.
      // Uses plan_code keyed map so it is IMMUNE to API plan count/ordering changes.
      allPlans = allPlans.map((p, index) => {
        // Build the lookup key using network prefix to resolve plan_code collisions (e.g. MTN Share vs Gifting)
        const mapKey = `${p.network}:${p.plan_code}`;
        const official = OFFICIAL_PRICES_MAP[mapKey] ?? null;
        let newSellPrice = p.sellPrice;

        if (official !== null && official !== undefined) {
          if (p.sellPrice < official) {
            // Full profit capture: raise to network retail ceiling
            newSellPrice = official;
          } else if (p.sellPrice > official) {
            // Above market: set just below official to stay competitive
            newSellPrice = official - 5;
          }
        }

        // --- Smart Advertising Discount Strategy ---
        const grossMargin = newSellPrice - p.basePrice;
        if (grossMargin >= 500) {
          newSellPrice -= 50;
        } else if (grossMargin >= 200) {
          newSellPrice -= 20;
        } else if (grossMargin >= 100) {
          newSellPrice -= 10;
        } else if (grossMargin >= 50) {
          newSellPrice -= 5;
        }

        // Safety net: never sell below cost
        if (newSellPrice <= p.basePrice) {
          newSellPrice = p.basePrice + Math.max(5, p.markup);
        }

        return {
          ...p,
          serial: index + 1,
          officialPrice: official,
          sellPrice: newSellPrice,
          proxyCost: newSellPrice
        };
      });


      if (db.plansCache) {
        const batch = db.plansCache.firestore.batch();
        for (const p of allPlans) {
          const ref = db.plansCache.doc(p.id);
          batch.set(ref, { ...p, updatedAt: new Date().toISOString() }, { merge: true });
        }
        await batch.commit();
      }
      this.cachedPlans = allPlans;
      logger.info(`Synced ${allPlans.length} plans successfully!`);
      return allPlans;
    }
    return [];
  }

  async getAvailablePlans() {
    if (this.cachedPlans && this.cachedPlans.length > 0) {
      return this.cachedPlans;
    }

    // Try to load from Firestore
    if (db.plansCache) {
      const snapshot = await db.plansCache.get();
      if (!snapshot.empty) {
        const plans = snapshot.docs.map(doc => doc.data());
        // Sort by serial so the menu stays consistent
        this.cachedPlans = plans.sort((a, b) => a.serial - b.serial);
        return this.cachedPlans;
      }
    }

    // Force sync if no cache
    return await this.syncPlans();
  }

  async dispenseData(phoneNumber, serialId) {
    try {
      const plan = this.cachedPlans.find(p => p.serial.toString() === serialId.toString())
        || (await this.getAvailablePlans()).find(p => p.serial.toString() === serialId.toString());

      if (!plan) throw new Error('Invalid plan selection');

      logger.info(`Dispensing real data: ${plan.name} to ${phoneNumber} via Peyflex`);

      const response = await this.client.post('/api/data/purchase/', {
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
      logger.error(`Error dispensing data to ${phoneNumber}:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  }
}

export default new PayflexService();
