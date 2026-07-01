import axios from 'axios';

const TOKEN = 'd31f5e1da421661ae44433bbb8e72ed0e30605a4';
const BASE_URL = 'https://client.peyflex.com.ng';
const networks = ['mtn_data_share', 'mtn_gifting_data', 'airtel_data', 'glo_data', '9mobile_data'];

const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Authorization': `Token ${TOKEN}`,
        'Content-Type': 'application/json'
    },
    timeout: 15000
});

const results = {};

for (const net of networks) {
    try {
        console.log(`Fetching ${net}...`);
        const res = await client.get(`/api/data/plans/?network=${net}`);
        const plans = res.data?.plans || res.data || [];
        results[net] = plans;
        console.log(`  ✅ Got ${Array.isArray(plans) ? plans.length : '?'} plans`);
    } catch (err) {
        console.error(`  ❌ ${net}: ${err.response?.status || err.message}`);
        results[net] = { error: err.message, status: err.response?.status, data: err.response?.data };
    }
}

console.log('\n=== FULL RESPONSE ===\n');
console.log(JSON.stringify(results, null, 2));
