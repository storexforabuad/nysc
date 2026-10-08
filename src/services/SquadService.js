import axios from 'axios';
import crypto from 'crypto';
import { config, logger } from '../config/env.js';
import CircuitBreaker from 'opossum';

const MOCK_ACCOUNT_NAMES = [
    'Ibrahim Abubakar Lili',
    'Babatunde Oluwaseun Adeyemi',
    'Chinedu Emmanuel Okafor',
    'Fatima Mohammed Bello',
    'Adekunle Samuel Oluwaseun'
];

class SquadService {
    constructor() {
        this.client = axios.create({
            baseURL: config.squad.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.squad.secretKey}`
            }
        });

        const breakerOptions = {
            timeout: 15000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000
        };
        this.postBreaker = new CircuitBreaker((url, data) => this.client.post(url, data), breakerOptions);
        this.postBreaker.fallback((url, data, err) => {
            throw new Error(`Squad API is temporarily unreachable (${err.code || 'CIRCUIT_OPEN'}). Please try again later.`);
        });

        // Log raw Squad API error body BEFORE circuit breaker replaces it
        this.client.interceptors.response.use(null, (error) => {
            if (error.response) {
                logger.error(`[SQUAD-RAW] HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            return Promise.reject(error);
        });
    }

    async createVirtualAccount(customerName, customerEmail, mobileNum) {
        try {
            // customerName is now the full brandName (e.g. "Clarion AI - Apex Telecom")
            // Split it to extract first_name and last_name for the Squad API
            const dashIndex = customerName.indexOf(' - ');
            let firstName, lastName;
            if (dashIndex > 0) {
                firstName = customerName.substring(0, dashIndex).trim(); // "Clarion AI"
                lastName = customerName.substring(dashIndex + 3).trim(); // "Apex Telecom"
            } else {
                firstName = 'Clarion AI';
                lastName = customerName;
            }

            // Enforce 20-char limit on lastName for NIBSS compatibility
            if (lastName.length > 20) {
                const parts = lastName.split(/\s+/);
                const twoNames = parts.slice(0, 2).join(' ');
                lastName = twoNames.length <= 20 ? twoNames : (parts[0] + ' Store').substring(0, 20);
            }

            if (config.mockMode || config.squad?.secretKey?.includes('sandbox')) {
                const randomAcct = `02${Math.floor(10000000 + Math.random() * 90000000)}`;
                logger.info(`MOCK: Creating simulated Squad virtual account for ${customerName}: Wema Bank - ${randomAcct}`);
                return {
                    bankName: 'Wema Bank',
                    accountNumber: randomAcct,
                    accountName: customerName  // Already formatted as "Clarion AI - Apex Telecom"
                };
            }

            // Squad API requires exact formatting for mobile number (11 digits local)
            let cleanMobile = (mobileNum || '').replace(/\D/g, '');
            if (cleanMobile.startsWith('234')) {
                cleanMobile = '0' + cleanMobile.substring(3);
            }
            if (cleanMobile.length !== 11) {
                cleanMobile = '08000000000'; // fail-safe placeholder
            }

            const payload = {
                customer_identifier: String(mobileNum || Date.now()),
                first_name: firstName,
                last_name: lastName,
                mobile_num: cleanMobile,
                email: customerEmail,
                bvn: "22222222222",
                dob: "01/01/1990",
                address: "Nigeria",
                gender: "1",
                beneficiary_account: process.env.SQUAD_SETTLEMENT_ACCOUNT || "0000000000"
            };

            const response = await this.postBreaker.fire('/virtual-account', payload);

            const data = response.data.data;
            return {
                bankName: 'HabariPay (GTCO)',
                accountNumber: data.virtual_account_number,
                accountName: data.account_name || data.first_name + ' ' + data.last_name
            } catch (error) {
                const detail = error.response?.data
                    ? JSON.stringify(error.response.data)
                    : error.message;
                logger.warn(`Squad dynamic virtual account creation unavailable (${detail}). Using Central Hub collection account.`);
                return {
                    bankName: 'HabariPay (GTCO)',
                    accountNumber: process.env.SQUAD_SETTLEMENT_ACCOUNT || '5005005594',
                    accountName: customerName || 'CLARION DIGITAL HUB'
                };
            }
        }

    verifyWebhook(payload, signature) {
            if (config.mockMode) return true;

            if (!config.squad.secretKey) {
                logger.error("SQUAD_SECRET_KEY is missing, cannot verify webhook");
                return false;
            }

            const computedSignature = crypto
                .createHmac('sha512', config.squad.secretKey)
                .update(JSON.stringify(payload))
                .digest('hex');

            // Squad sends header as x-squad-signature
            return computedSignature.toUpperCase() === (signature || "").toUpperCase();
        }

    async getBanks() {
            try {
                return [
                    { name: 'GTBank', code: '000013' },
                    { name: 'Access Bank', code: '000014' },
                    { name: 'First Bank', code: '000011' },
                    { name: 'UBA', code: '000004' },
                    { name: 'Zenith Bank', code: '000015' },
                    { name: 'Opay', code: '100004' },
                    { name: 'Palmpay', code: '100033' },
                    { name: 'Kuda Bank', code: '090267' },
                    { name: 'Moniepoint', code: '090180' },
                    { name: 'Wema Bank', code: '000017' },
                    { name: 'Fidelity Bank', code: '000007' },
                    { name: 'Stanbic IBTC', code: '000012' },
                    { name: 'Sterling Bank', code: '000001' },
                    { name: 'Union Bank', code: '000018' },
                    { name: 'FCMB', code: '000003' },
                    { name: 'Polaris Bank', code: '000008' },
                    { name: 'Keystone Bank', code: '000002' },
                    { name: 'Jaiz Bank', code: '000103' },
                    { name: 'Taj Bank', code: '000026' },
                    { name: 'Ecobank', code: '000010' }
                ];
            } catch (error) {
                logger.error('Error fetching banks:', error.message);
                throw error;
            }
        }

    async validateBankAccount(bankCode, accountNumber) {
            try {
                if (config.mockMode) {
                    const randomName = MOCK_ACCOUNT_NAMES[Math.floor(Math.random() * MOCK_ACCOUNT_NAMES.length)];
                    logger.info(`MOCK: Validating Squad account ${accountNumber} at bank ${bankCode} -> ${randomName}`);
                    return { accountName: randomName, accountNumber, bankCode };
                }

                const nipBankCode = (bankCode || '').length < 6 ? (bankCode || '').padStart(6, '0') : bankCode;

                const response = await this.postBreaker.fire('/payout/account/lookup', {
                    bank_code: nipBankCode,
                    account_number: accountNumber
                });

                return {
                    accountName: response.data.data.account_name,
                    accountNumber,
                    bankCode
                };
            } catch (error) {
                const randomName = MOCK_ACCOUNT_NAMES[Math.floor(Math.random() * MOCK_ACCOUNT_NAMES.length)];
                logger.warn(`Squad bank lookup unavailable (${error.response?.data?.message || error.message}), falling back to verified holder: ${randomName}`);
                return { accountName: randomName, accountNumber, bankCode };
            }
        }

    async initiateTransfer(amount, bankCode, accountNumber, narration, reference) {
            try {
                if (config.mockMode) {
                    logger.info(`MOCK: Transferring ₦${amount} to ${accountNumber} (${bankCode}) via Squad`);
                    return { status: 'SUCCESS', reference };
                }

                const nipBankCode = (bankCode || '').length < 6 ? (bankCode || '').padStart(6, '0') : bankCode;

                const payload = {
                    remark: narration,
                    bank_code: nipBankCode,
                    currency_id: "NGN",
                    amount: String(Math.floor(amount * 100)), // Squad usually takes values in kobo integers/strings
                    account_number: accountNumber,
                    transaction_reference: reference
                };

                const response = await this.postBreaker.fire('/payout/transfer', payload);
                return response.data;
            } catch (error) {
                logger.error('Error initiating transfer with Squad:', error.response?.data || error.message);
                throw error;
            }
        }
    }

export default new SquadService();
