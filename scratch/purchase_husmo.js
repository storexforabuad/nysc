import axios from 'axios';

const token = '096fce20c04dfbeb3954210f4dea5a99d04fd76d';
const headers = {
  'Authorization': `Token ${token}`,
  'Content-Type': 'application/json'
};

async function execute() {
  console.log('--- 1. CHECKING HUSMODATA USER PROFILE & WALLET BALANCE ---');
  try {
    const userRes = await axios.get('https://husmodata.com/api/user/', { headers });
    const u = userRes.data.user;
    console.log(`Username: ${u.username} (${u.FullName})`);
    console.log(`Phone: ${u.Phone}`);
    console.log(`Wallet Balance: ₦${u.wallet_balance}`);
    console.log(`User Type: ${u.user_type}`);
    
    console.log('\n--- 2. EXECUTING PURCHASE REQUEST ---');
    const payload = {
      network: 1, // MTN
      mobile_number: '07032905036',
      plan: 255, // 50MB Corporate Gifting
      Ported_number: true
    };
    console.log('Endpoint: POST https://husmodata.com/api/data/');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const buyRes = await axios.post('https://husmodata.com/api/data/', payload, { headers });
    console.log('\n--- 3. PURCHASE RESPONSE ---');
    console.log('Status Code:', buyRes.status);
    console.log('Response Data:', JSON.stringify(buyRes.data, null, 2));

    // Calculate financials
    const cost = 52;
    const sell = 100;
    const paystackFee = Math.round(sell * 0.015); // ₦2
    const netProfit = sell - cost - paystackFee;
    console.log('\n--- 4. FINANCIAL SUMMARY ---');
    console.log(`Cost: ₦${cost}`);
    console.log(`Sell: ₦${sell}`);
    console.log(`Paystack Fee (Absorbed): ₦${paystackFee}`);
    console.log(`Net Profit: ₦${netProfit}`);
  } catch (error) {
    console.error('\n--- API ERROR ENCOUNTERED ---');
    if (error.response) {
      console.error(`HTTP ${error.response.status}:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error message:', error.message);
    }
  }
}

execute();

