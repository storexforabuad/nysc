import fs from 'fs';

let content = fs.readFileSync('src/server.js', 'utf8');
const target = 'const tier = wallet.getMultiplierTier(balance);';

const replacement = `// Universal 4X VIP Tier for all merchants (Day 1 unlock)
      const tier = {
        level: 6,
        multiplier: '4X',
        name: 'Tier 6 · 4X MAX VIP',
        minBalance: 0,
        neededToNext: 0,
        progressPercent: 100,
        nextThreshold: null
      };`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/server.js', content, 'utf8');
  console.log('src/server.js successfully updated with 4X VIP tier!');
} else {
  console.error('Target not found in src/server.js');
}

