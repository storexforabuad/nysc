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

  // ── Disbursement Methods ──────────────────────────────────

  async getBanks() {
    try {
      if (config.mockMode) {
        return [
          { name: 'GTBank', code: '058', nipBankCode: '058' },
          { name: 'Access Bank', code: '044', nipBankCode: '044' },
          { name: 'UBA', code: '033', nipBankCode: '033' },
          { name: 'First Bank', code: '011', nipBankCode: '011' },
          { name: 'Zenith Bank', code: '057', nipBankCode: '057' },
          { name: 'Kuda', code: '50211', nipBankCode: '50211' },
          { name: 'OPay', code: '999992', nipBankCode: '999992' },
          { name: 'Palmpay', code: '999991', nipBankCode: '999991' },
          { name: 'Wema Bank', code: '035', nipBankCode: '035' },
          { name: 'Fidelity Bank', code: '070', nipBankCode: '070' },
          { name: 'Stanbic IBTC', code: '221', nipBankCode: '221' },
        ];
      }
      if (!this.accessToken) await this.authenticate();
      const response = await this.client.get('/api/v1/sdk/transactions/banks', {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      return response.data.responseBody || [];
    } catch (error) {
      logger.error('Error fetching banks:', error.response?.data || error.message);
      throw error;
    }
  }

  async validateBankAccount(bankCode, accountNumber) {
    try {
      if (config.mockMode) {
        logger.info(`MOCK: Validating account ${accountNumber} at bank ${bankCode}`);
        return { accountName: 'MOCK JOHN DOE', accountNumber, bankCode };
      }
      if (!this.accessToken) await this.authenticate();
      const response = await this.client.get(
        `/api/v1/disbursements/account/validate?accountNumber=${accountNumber}&bankCode=${bankCode}`,
        { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
      );
      return response.data.responseBody;
    } catch (error) {
      logger.error('Error validating bank account:', error.response?.data || error.message);
      throw error;
    }
  }

  async initiateTransfer(amount, bankCode, accountNumber, narration, reference) {
    try {
      if (config.mockMode) {
        logger.info(`MOCK: Transferring ₦${amount} to ${accountNumber} (${bankCode})`);
        return {
          status: 'SUCCESS',
          reference: reference || `MOCK_REF_${Date.now()}`,
          amount
        };
      }
      if (!this.accessToken) await this.authenticate();

      const payload = {
        amount,
        reference: reference || `WDR_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        narration: narration || 'NYSC Bot Profit Withdrawal',
        destinationBankCode: bankCode,
        destinationAccountNumber: accountNumber,
        currency: 'NGN',
        sourceAccountNumber: config.monnify.walletAccountNumber || ''
      };

      const response = await this.client.post('/api/v2/disbursements/single', payload, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      return response.data.responseBody;
    } catch (error) {
      logger.error('Error initiating transfer:', error.response?.data || error.message);
      throw error;
    }
  }

  async getDisbursementStatus(reference) {
    try {
      if (config.mockMode) {
        return { status: 'SUCCESS', reference };
      }
      if (!this.accessToken) await this.authenticate();
      const response = await this.client.get(
        `/api/v2/disbursements/single/summary?reference=${reference}`,
        { headers: { 'Authorization': `Bearer ${this.accessToken}` } }
      );
      return response.data.responseBody;
    } catch (error) {
      logger.error('Error fetching disbursement status:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default new MonnifyService();
