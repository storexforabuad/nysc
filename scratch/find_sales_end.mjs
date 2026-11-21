import fs from 'fs';

const content = fs.readFileSync('src/components/merchant/MerchantDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log(lines.slice(1890, 1940).map((l, i) => `${i+1891}: ${l}`).join('\n'));

