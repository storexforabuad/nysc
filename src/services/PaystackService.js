import axios from 'axios';
import crypto from 'crypto';
import { config, logger } from '../config/env.js';

class PaystackService {
    constructor() {
        this.client = axios.create({
            baseURL: config.paystack?.baseUrl || 'https://api.paystack.co',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.paystack?.secretKey}`
            },
            timeout: 15000
        });

        this.client.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response) {
                    logger.error(`[PAYSTACK-RAW] HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
                }
                return Promise.reject(error);
            }
        );

        this.cachedBanks = null;
        this.cacheTime = 0;
    }

    /**
     * Get list of Nigerian banks with in-memory caching.
     */
    async getBanks() {
        const now = Date.now();
        if (this.cachedBanks && (now - this.cacheTime < 24 * 60 * 60 * 1000)) {
            return this.cachedBanks;
        }

        try {
            const response = await this.client.get('/bank?country=nigeria&perPage=300');
            if (response.data && response.data.status) {
                this.cachedBanks = response.data.data.map(b => ({
                    name: b.name,
                    code: b.code,
                    slug: b.slug,
                    nipCode: b.nibss_bank_code || b.code
                }));
                this.cacheTime = now;
                return this.cachedBanks;
            }
            throw new Error('Failed to retrieve bank list from Paystack');
        } catch (error) {
            logger.warn(`Paystack bank list query failed (${error.message}), falling back to built-in list.`);
            return this.getFallbackBanks();
        }
    }

    getFallbackBanks() {
        return [
            { name: 'Access Bank', code: '044' },
            { name: 'Guaranty Trust Bank (GTBank)', code: '058' },
            { name: 'First Bank of Nigeria', code: '011' },
            { name: 'United Bank for Africa (UBA)', code: '033' },
            { name: 'Zenith Bank', code: '057' },
            { name: 'Opay (PayCom)', code: '999992' },
            { name: 'PalmPay', code: '999991' },
            { name: 'Kuda Microfinance Bank', code: '50211' },
            { name: 'Moniepoint MFB', code: '50515' },
            { name: 'Wema Bank', code: '035' },
            { name: 'Fidelity Bank', code: '070' },
            { name: 'Stanbic IBTC Bank', code: '221' },
            { name: 'Sterling Bank', code: '232' },
            { name: 'Union Bank of Nigeria', code: '032' },
            { name: 'First City Monument Bank (FCMB)', code: '214' },
            { name: 'Polaris Bank', code: '076' },
            { name: 'Keystone Bank', code: '082' },
            { name: 'Jaiz Bank', code: '301' },
            { name: 'Taj Bank', code: '302' },
            { name: 'Ecobank Nigeria', code: '050' }
        ];
    }

    /**
     * Resolves and verifies a Nigerian bank account number with NIBSS via Paystack.
     * @param {string} bankCode - 3-digit or standard Paystack bank code (e.g. '058')
     * @param {string} accountNumber - 10-digit NUBAN
     */
    async validateBankAccount(bankCode, accountNumber) {
        try {
            if (config.mockMode) {
                return {
                    accountName: 'Mustapha Lawal Gambo',
                    accountNumber,
                    bankCode
                };
            }

            const cleanAcct = String(accountNumber).trim();
            const cleanCode = String(bankCode).trim();

            const response = await this.client.get(`/bank/resolve?account_number=${cleanAcct}&bank_code=${cleanCode}`);
            if (response.data && response.data.status) {
                return {
                    accountName: response.data.data.account_name,
                    accountNumber: response.data.data.account_number || cleanAcct,
                    bankCode: cleanCode
                };
            }
            throw new Error(response.data?.message || 'Could not resolve account name');
        } catch (error) {
            const msg = error.response?.data?.message || error.message;
            logger.error(`Paystack bank resolution failed for ${accountNumber} (${bankCode}): ${msg}`);
            throw new Error(msg);
        }
    }

    /**
     * Creates or assigns a Dedicated Virtual Account (DVA) for a customer/franchise.
     * @param {string} brandName - e.g. "Clarion AI - Fatima Telecom"
     * @param {string} customerEmail - Customer email
     * @param {string} mobileNum - Customer phone number
     */
    async createVirtualAccount(brandName, customerEmail, mobileNum) {
        try {
            if (config.mockMode || config.paystack?.secretKey?.includes('sandbox')) {
                const randomAcct = `99${Math.floor(10000000 + Math.random() * 90000000)}`;
                return {
                    bankName: 'Wema Bank',
                    accountNumber: randomAcct,
                    accountName: brandName
                };
            }

            // Split brand name into first and last name
            let firstName = 'Clarion AI';
            let lastName = brandName.replace(/^Clarion AI\s*-\s*/i, '').trim() || 'Store';

            // 1. Create or fetch Paystack Customer
            const customerPayload = {
                email: customerEmail || `${mobileNum}@clarionhub.ng`,
                first_name: firstName,
                last_name: lastName,
                phone: mobileNum
            };

            let customerCode;
            try {
                const custRes = await this.client.post('/customer', customerPayload);
                customerCode = custRes.data?.data?.customer_code;
            } catch (err) {
                // If customer already exists, fetch customer
                if (err.response?.data?.message?.includes('already exists')) {
                    const fetchRes = await this.client.get(`/customer/${encodeURIComponent(customerPayload.email)}`);
                    customerCode = fetchRes.data?.data?.customer_code;
                } else {
                    throw err;
                }
            }

            // 2. Request Dedicated Virtual Account (Wema / Titan)
            const dvaPayload = {
                customer: customerCode,
                preferred_bank: 'wema-bank'
            };

            const dvaRes = await this.client.post('/dedicated_account', dvaPayload);
            if (dvaRes.data?.status && dvaRes.data?.data) {
                const d = dvaRes.data.data;
                return {
                    bankName: d.bank?.name || 'Wema Bank',
                    accountNumber: d.account_number,
                    accountName: d.account_name || brandName,
                    customerCode
                };
            }

            throw new Error(dvaRes.data?.message || 'Dedicated account creation returned no data');
        } catch (error) {
            const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            logger.warn(`Paystack DVA creation fallback (${detail}). Using Central Hub collection account.`);
            return {
                bankName: 'Guaranty Trust Bank (GTBank)',
                accountNumber: process.env.CENTRAL_COLLECTION_ACCOUNT || '0123456789',
                accountName: brandName || 'CLARION DIGITAL HUB'
            };
        }
    }

    /**
     * Initializes a Paystack checkout transaction.
     */
    async initializeTransaction({ email, amountNaira, reference, metadata = {}, callbackUrl }) {
        try {
            const payload = {
                email,
                amount: Math.round(amountNaira * 100),
                reference: reference || `clarion_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                metadata,
                channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']
            };

            if (callbackUrl) {
                payload.callback_url = callbackUrl;
            }

            const response = await this.client.post('/transaction/initialize', payload);

            if (response.data && response.data.status) {
                return {
                    success: true,
                    authorizationUrl: response.data.data.authorization_url,
                    accessCode: response.data.data.access_code,
                    reference: response.data.data.reference
                };
            }

            throw new Error(response.data?.message || 'Paystack initialization failed');
        } catch (error) {
            logger.error(`Paystack initializeTransaction error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Verifies a Paystack transaction by reference.
     */
    async verifyTransaction(reference) {
        try {
            const response = await this.client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
            if (response.data && response.data.status) {
                const data = response.data.data;
                return {
                    success: true,
                    isPaid: data.status === 'success',
                    status: data.status,
                    amountNaira: data.amount / 100,
                    currency: data.currency,
                    reference: data.reference,
                    paidAt: data.paid_at,
                    channel: data.channel,
                    customer: data.customer,
                    metadata: data.metadata
                };
            }
            throw new Error(response.data?.message || 'Paystack verification failed');
        } catch (error) {
            logger.error(`Paystack verifyTransaction error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Verifies the cryptographic HMAC SHA512 signature of incoming Paystack webhooks.
     */
    verifyWebhookSignature(signature, rawBody) {
        if (!signature || !config.paystack?.secretKey) return false;
        try {
            const hash = crypto
                .createHmac('sha512', config.paystack.secretKey)
                .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
                .digest('hex');
            return hash === signature;
        } catch (err) {
            logger.error(`Paystack webhook signature verification error: ${err.message}`);
            return false;
        }
    }

    /**
     * Initiates a payout/withdrawal transfer to a Nigerian bank account.
     */
    async initiateTransfer(amountNaira, bankCode, accountNumber, narration, reference) {
        try {
            if (config.mockMode) {
                logger.info(`MOCK: Transferring ₦${amountNaira} to ${accountNumber} (${bankCode}) via Paystack`);
                return { status: 'SUCCESS', reference };
            }

            // 1. Create or retrieve transfer recipient
            const recipientRes = await this.client.post('/transferrecipient', {
                type: 'nuban',
                name: narration.substring(0, 30),
                account_number: String(accountNumber).trim(),
                bank_code: String(bankCode).trim(),
                currency: 'NGN'
            });

            const recipientCode = recipientRes.data?.data?.recipient_code;
            if (!recipientCode) {
                throw new Error('Could not create Paystack transfer recipient');
            }

            // 2. Initiate transfer
            const transferRes = await this.client.post('/transfer', {
                source: 'balance',
                amount: Math.round(amountNaira * 100), // in kobo
                recipient: recipientCode,
                reason: narration,
                reference: reference
            });

            return transferRes.data;
        } catch (error) {
            const detail = error.response?.data?.message || error.message;
            logger.error(`Paystack initiateTransfer error: ${detail}`);
            throw new Error(detail);
        }
    }
}

export default new PaystackService();

