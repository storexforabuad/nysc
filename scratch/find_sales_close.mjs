import fs from 'fs';

const content = fs.readFileSync('src/components/merchant/MerchantDashboard.tsx', 'utf8');
const lines = content.split('\n');

console.log(lines.slice(1665, 1680).map((l, i) => `${i+1666}: ${l}`).join('\n'));
