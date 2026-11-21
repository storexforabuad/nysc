import fs from 'fs';

const content = fs.readFileSync('src/components/merchant/MerchantDashboard.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((l, i) => {
  if (l.includes('activeTab ===')) {
    console.log(`${i+1}: ${l}`);
  }
});

