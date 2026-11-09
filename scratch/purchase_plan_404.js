import axios from 'axios';

const token = '096fce20c04dfbeb3954210f4dea5a99d04fd76d';
const headers = {
  'Authorization': `Token ${token}`,
  'Content-Type': 'application/json'
};

async function execute() {
  console.log('=== STEP 1: PRE-PURCHASE WALLET CHECK ===');
  let beforeBalance = null;
  try {
    const userRes = await axios.get('https://husmodata.com/api/user/', { headers, timeout: 10000 });
    const u = userRes.data.user;
    beforeBalance = u.wallet_balance;
    console.log(`User: ${u.username} (${u.FullName})`);
    console.log(`Wallet Balance Before: ₦${beforeBalance}`);
  } catch (err) {
    console.error('Failed to fetch wallet balance before purchase:', err.message);
  }

  console.log('\n=== STEP 2: DISPATCHING PURCHASE REQUEST ===');
  const payload = {
    network: 1, // MTN
    mobile_number: '07032905036',
    plan: 404, // 75MB 1 Day Gifting
    Ported_number: true
  };
  console.log('Endpoint: POST https://husmodata.com/api/data/');
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const buyRes = await axios.post('https://husmodata.com/api/data/', payload, { headers, timeout: 25000 });
    console.log('\n=== STEP 3: PURCHASE RESPONSE ===');
    console.log('HTTP Status:', buyRes.status);
    console.log('Response Body:', JSON.stringify(buyRes.data, null, 2));

    console.log('\n=== STEP 4: POST-PURCHASE WALLET CHECK ===');
    const userResAfter = await axios.get('https://husmodata.com/api/user/', { headers, timeout: 10000 });
    const uAfter = userResAfter.data.user;
    console.log(`Wallet Balance After: ₦${uAfter.wallet_balance}`);
    console.log(`Actual Amount Deducted: ₦${beforeBalance - uAfter.wallet_balance}`);

    console.log('\n=== STEP 5: FINANCIAL PROFIT LEDGER ===');
    const cost = 74;
    const sell = 100;
    const paystackFee = 2;
    const profit = sell - cost - paystackFee;
    console.log(`Retail Price: ₦${sell}`);
    console.log(`Wholesale Cost: ₦${cost}`);
    console.log(`Paystack Gateway Fee: ₦${paystackFee}`);
    console.log(`Net Profit Realized: ₦${profit}`);
    console.log(`Profit Margin: ${(profit / sell * 100).toFixed(1)}%`);
  } catch (err) {
    console.error('\n=== PURCHASE FAILED / API ERROR ===');
    if (err.response) {
      console.error(`HTTP ${err.response.status}:`, JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error message:', err.message);
    }
  }
}

execute();

