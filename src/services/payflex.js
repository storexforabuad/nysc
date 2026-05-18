import axios from 'axios';
import { config, logger } from '../config/env.js';
import { db } from './firebase.js';

class PayflexService {
  constructor() {
    this.client = axios.create({
      baseURL: config.payflex.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.payflex.apiKey}:${config.payflex.secretKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async fetchPlans() {
    try {
      if (config.mockMode) {
        logger.info('MOCK: Generating dummy data plans...');
        const mockPlans = [
          { id: 1, name: 'MTN 1GB (SME)', price: 250 },
          { id: 2, name: 'MTN 2GB (SME)', price: 480 },
          { id: 3, name: 'MTN 5GB (SME)', price: 1150 },
          { id: 4, name: 'Airtel 1GB (CG)', price: 300 },
          { id: 5, name: 'Glo 2.5GB', price: 950 }
        ];

        const batch = db.plansCache.firestore.batch();
        mockPlans.forEach(plan => {
          const docRef = db.plansCache.doc(plan.id.toString());
          batch.set(docRef, { ...plan, updatedAt: new Date().toISOString() }, { merge: true });
        });
        await batch.commit();
        return mockPlans;
      }

      logger.info('Fetching data plans from Payflex...');
      const response = await this.client.get('/v1/data/plans');
      const plans = response.data.data;

      const batch = db.plansCache.firestore.batch();
      
      plans.forEach(plan => {
        const docRef = db.plansCache.doc(plan.id.toString());
        batch.set(docRef, {
          ...plan,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();
      logger.info(`Successfully cached ${plans.length} data plans`);
      return plans;
    } catch (error) {
      logger.error('Error fetching Payflex plans:', error.message);
      throw error;
    }
  }

  async dispenseData(phoneNumber, planId) {
    try {
      if (config.mockMode) {
        logger.info(`MOCK: Simulated data vending of Plan ${planId} to ${phoneNumber}`);
        return { status: 'success', message: 'MOCK success' };
      }

      logger.info(`Dispensing data: Plan ${planId} to ${phoneNumber}`);
      const response = await this.client.post('/v1/data/vend', {
        phone: phoneNumber,
        plan_id: planId
      });
      
      if (response.data.status === 'success') {
        logger.info(`Data vended successfully to ${phoneNumber}`);
        return response.data;
      } else {
        throw new Error(response.data.message || 'Data vending failed');
      }
    } catch (error) {
      logger.error(`Error dispensing data to ${phoneNumber}:`, error.response?.data || error.message);
      throw error;
    }
  }
}

export default new PayflexService();
