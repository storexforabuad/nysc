// scratch/deliver_mum_order.js
// Fires a signed Paystack charge.success webhook locally to http://localhost:3000/webhook/paystack
// to fulfill Mama's order (CLARION_1794336334794 - ₦100 MTN 110MB)
// and deliver all WhatsApp post-purchase messages via the live server process.

import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
if (!SECRET_KEY) {
  console.error('PAYSTACK_SECRET_KEY is missing in .env!');
  process.exit(1);
}

const payload = {
  event: 'charge.success',
  data: {
    id: Date.now(),
    domain: 'live',
    status: 'success',
    reference: 'MANUAL_RESEND_' + Date.now(),
    amount: 10000, // ₦100 in kobo
    message: null,
    gateway_response: 'Successful',
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    channel: 'dedicated_nuban',
    currency: 'NGN',
    ip_address: '127.0.0.1',
    metadata: {
      orderId: 'CLARION_1794336334794',
      phone: '08037231445'
    },
    authorization: {
      receiver_bank_account_number: '9819092390',
      receiver_bank: 'Wema Bank'
    },
    customer: {
      id: 999999,
      phone: '08037231445',
      customer_code: 'CUS_MAMA'
    },
    dedicated_account: {
      bank: { name: 'Wema Bank', id: 20 },
      account_name: 'CLARIONDIGITA/MUSTY DATA CLARION AI',
      account_number: '9819092390',
      assigned: true
    }
  }
};

const rawBody = JSON.stringify(payload);
const signature = crypto
  .createHmac('sha512', SECRET_KEY)
  .update(rawBody)
  .digest('hex');

console.log('Sending signed webhook to http://localhost:3000/webhook/paystack...');

try {
  const response = await fetch('http://localhost:3000/webhook/paystack', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature
    },
    body: rawBody
  });

  const text = await response.text();
  console.log(`Server HTTP Status: ${response.status} (${response.statusText})`);
  console.log(`Server Response: ${text}`);

  if (response.ok) {
    console.log('\n✅ Webhook delivered to running server! Processing fulfillment & WhatsApp messages...');
  } else {
    console.error('❌ Server rejected webhook:', text);
  }
} catch (err) {
  console.error('Error connecting to local server:', err.message);
}

