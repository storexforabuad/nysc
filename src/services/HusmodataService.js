import axios from 'axios';
import CircuitBreaker from 'opossum';
import { config, logger } from '../config/env.js';

class HusmodataService {
  constructor() {
    this.token = config.husmodata?.token || process.env.HUSMODATA_TOKEN;
    this.baseUrl = config.husmodata?.baseUrl || process.env.HUSMODATA_BASE_URL || 'https://husmodata.com/api';

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 12000
    });

    const breakerOptions = {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    };

    this.postBreaker = new CircuitBreaker((url, data) => this.client.post(url, data), breakerOptions);
    this.postBreaker.fallback((url, data, err) => {
      throw new Error(`Husmodata API unavailable (${err.code || 'CIRCUIT_OPEN'}).`);
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          logger.error(`[HUSMODATA-RAW] HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Network mapping for Husmodata:
   * 1 = MTN, 2 = GLO, 3 = AIRTEL, 4 = 9MOBILE
   */
  getNetworkId(network) {
    if (typeof network === 'number') return network;
    const net = String(network).toLowerCase();
    if (net.includes('mtn')) return 1;
    if (net.includes('glo')) return 2;
    if (net.includes('airtel')) return 3;
    if (net.includes('9mobile') || net.includes('t2')) return 4;
    return 1;
  }

  /**
   * Purchase data via Husmodata API
   * @param {number|string} network - network name or ID (1: MTN, 2: GLO, 3: AIRTEL, 4: 9MOBILE)
   * @param {string} mobileNumber - 11-digit Nigerian phone number (e.g. "08031234567")
   * @param {number} planId - Husmodata specific plan ID (e.g. 403, 495, 323, 450)
   * @param {boolean} portedNumber - default true
   */
  async purchaseData(network, mobileNumber, planId, portedNumber = true) {
    try {
      let cleanPhone = String(mobileNumber).replace(/\D/g, '');
      if (cleanPhone.startsWith('234') && cleanPhone.length === 13) {
        cleanPhone = '0' + cleanPhone.slice(3);
      }
      if (cleanPhone.length === 10) {
        cleanPhone = '0' + cleanPhone;
      }

      const networkId = this.getNetworkId(network);

      if (config.mockMode) {
        if (cleanPhone === '08000000000') {
          logger.warn(`MOCK: Simulating Husmodata API failure for ${cleanPhone}`);
          throw new Error('MOCK HUSMODATA NETWORK ERROR');
        }
        logger.info(`MOCK: Husmodata vended plan ${planId} to ${cleanPhone}`);
        return {
          status: 'success',
          reference: `MOCK_HUSMO_${Date.now()}`,
          apiResponse: { Status: 'successful', id: Date.now() }
        };
      }

      logger.info(`Dispensing via Husmodata: Plan ID ${planId} to ${cleanPhone} (Network ${networkId})`);

      const payload = {
        network: networkId,
        mobile_number: cleanPhone,
        plan: Number(planId),
        Ported_number: portedNumber
      };

      const response = await this.postBreaker.fire('/data/', payload);
      const data = response.data;

      // Husmodata returns Status: 'successful' on success
      if (data && (data.Status === 'successful' || data.status === 'successful' || data.status === 'success')) {
        logger.info(`Husmodata vending successful for ${cleanPhone}. Ref: ${data.ident || data.id}`);
        return {
          status: 'success',
          reference: String(data.ident || data.id || `HUSMO_${Date.now()}`),
          apiResponse: data
        };
      }

      const errMsg = (data && (data.error?.[0] || data.msg || data.message || data.Status)) || 'Husmodata vending rejected';
      throw new Error(errMsg);
    } catch (error) {
      const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      logger.error(`Error dispensing via Husmodata to ${mobileNumber}: ${detail}`);
      throw new Error(error.response?.data?.error?.[0] || error.response?.data?.msg || error.message);
    }
  }

  /**
   * Check wallet balance and profile
   */
  async getWalletBalance() {
    try {
      const response = await this.client.get('/user/');
      if (response.data && response.data.user) {
        return Number(response.data.user.wallet_balance || 0);
      }
      return 0;
    } catch (error) {
      logger.error(`Failed to fetch Husmodata balance: ${error.message}`);
      return 0;
    }
  }
}

export default new HusmodataService();

