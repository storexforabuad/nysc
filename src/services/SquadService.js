import axios from 'axios';
import crypto from 'crypto';
import { config, logger } from '../config/env.js';

class SquadService {
    constructor() {
        this.client = axios.create({
            baseURL: config.squad.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.squad.secretKey}`
            }
        });
    }

    async createVirtualAccount(customerName, customerEmail, mobileNum) {
        try {
            if (config.mockMode) {
                logger.info(`MOCK: Creating simulated Squad virtual account for ${customerName}`);
                return {
                    bankName: 'HabariPay (GTCO)',
                    accountNumber: '0123456789',
                    accountName: `Habari / ${customerName}`
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
                customer_identifier: String(mobileNum || Date.now()), // Unique ID for customer
                first_name: customerName.split(' ')[0] || 'Customer',
                last_name: customerName.split(' ').slice(1).join(' ') || 'Clarion',
                mobile_num: cleanMobile,
                email: customerEmail,
                bvn: "",
                dob: "1990-01-01",
                address: "Nigeria",
                gender: "1",
                beneficiary_account: ""
            };

            const response = await this.client.post('/virtual-account', payload);

            const data = response.data.data;
            return {
                bankName: 'HabariPay (GTCO)',
                accountNumber: data.virtual_account_number,
                accountName: data.account_name || data.first_name + ' ' + data.last_name
            };
        } catch (error) {
            logger.error('Error creating Squad virtual account:', error.response?.data || error.message);
            throw error;
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
            // Squad doesn't enforce a strict bank-fetch flow prior to lookup like Monnify, 
            // but providing a mocked list works perfectly with our existing dialogue logic.
            return [
                { name: 'GTBank', code: '058' },
                { name: 'Access Bank', code: '044' },
                { name: 'First Bank', code: '011' },
                { name: 'UBA', code: '033' },
                { name: 'Zenith Bank', code: '057' },
                { name: 'Opay', code: '999992' },
                { name: 'Palmpay', code: '999991' },
                { name: 'Kuda Bank', code: '50211' },
            ];
        } catch (error) {
            logger.error('Error fetching banks:', error.message);
            throw error;
        }
    }

    async validateBankAccount(bankCode, accountNumber) {
        try {
            if (config.mockMode) {
                logger.info(`MOCK: Validating Squad account ${accountNumber} at bank ${bankCode}`);
                return { accountName: 'MOCK SQUAD ACC', accountNumber, bankCode };
            }

            const response = await this.client.post('/payout/account/lookup', {
                bank_code: bankCode,
                account_number: accountNumber
            });

            return {
                accountName: response.data.data.account_name,
                accountNumber,
                bankCode
            };
        } catch (error) {
            logger.error('Error validating bank account via Squad:', error.response?.data || error.message);
            throw error;
        }
    }

    async initiateTransfer(amount, bankCode, accountNumber, narration, reference) {
        try {
            if (config.mockMode) {
                logger.info(`MOCK: Transferring ₦${amount} to ${accountNumber} (${bankCode}) via Squad`);
                return { status: 'SUCCESS', reference };
            }

            const payload = {
                remark: narration,
                bank_code: bankCode,
                currency_id: "NGN",
                amount: String(Math.floor(amount * 100)), // Squad usually takes values in kobo integers/strings
                account_number: accountNumber,
                transaction_reference: reference
            };

            const response = await this.client.post('/payout/transfer', payload);
            return response.data;
        } catch (error) {
            logger.error('Error initiating transfer with Squad:', error.response?.data || error.message);
            throw error;
        }
    }
}

export default new SquadService();
