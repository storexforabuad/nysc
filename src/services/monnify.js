import axios from 'axios';
import crypto from 'crypto';
import { config, logger } from '../config/env.js';

class MonnifyService {
  constructor() {
    this.client = axios.create({
      baseURL: config.monnify.baseUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    this.accessToken = null;
  }

  async authenticate() {
    try {
      if (config.mockMode) {
        logger.info('MOCK: Simulated Monnify authentication');
        this.accessToken = 'mock_token';
        return this.accessToken;
      }
      const authHeader = Buffer.from(`${config.monnify.apiKey}:${config.monnify.secretKey}`).toString('base64');
      const response = await this.client.post('/api/v1/auth/login', {}, {
        headers: { 'Authorization': `Basic ${authHeader}` }
      });
      this.accessToken = response.data.responseBody.accessToken;
      return this.accessToken;
    } catch (error) {
      logger.error('Monnify Authentication Failed:', error.message);
      throw error;
    }
  }

  async createVirtualAccount(customerName, customerEmail, bvn = '') {
    try {
      if (config.mockMode) {
        logger.info(`MOCK: Creating simulated virtual account for ${customerName}`);
        return {
          bankName: 'MOCK WEMA BANK',
          accountNumber: '0123456789',
          accountName: `NYSC BOT / ${customerName}`
        };
      }
      if (!this.accessToken) await this.authenticate();
      
      const payload = {
        accountReference: `REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        accountName: customerName,
        currencyCode: "NGN",
        contractCode: config.monnify.contractCode,
        customerEmail: customerEmail,
        customerName: customerName,
        getAllAvailableBanks: true
      };

      const response = await this.client.post('/api/v2/bank-transfer/reserved-accounts', payload, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      return response.data.responseBody;
    } catch (error) {
      logger.error('Error creating Monnify virtual account:', error.response?.data || error.message);
      throw error;
    }
  }

  verifyWebhook(payload, signature) {
    if (config.mockMode) return true; // Always verify in mock mode

    const computedSignature = crypto
      .createHmac('sha512', config.monnify.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    return computedSignature === signature;
  }
}

export default new MonnifyService();
