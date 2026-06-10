import axios from 'axios';
import { config, logger } from '../config/env.js';
import { db } from './firebase.js';

// Tiered markup: single source of truth for all pricing.
// Under ₦1000 → +₦20 | ₦1000–₦3000 → +₦50 | Over ₦3000 → +₦100
const getTieredMarkup = (basePrice) => {
  if (basePrice >= 3000) return 100;
  if (basePrice >= 1000) return 50;
  return 20;
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
              basePrice: p.amount,       // Wholesale price paid to Peyflex
              markup,                    // Our profit on this plan (tiered)
              sellPrice: p.amount + markup, // What the end user pays
              proxyCost: p.amount,       // System cost to fulfill (wholesale only)
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
      // Create readable serial numbers for the SMS menu
      allPlans = allPlans.map((p, index) => ({ ...p, serial: index + 1 }));

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
