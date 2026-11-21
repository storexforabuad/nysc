import fs from 'fs';

const td = fs.readFileSync('src/services/TelecomDispatcher.js', 'utf8');
const lines = td.split('\n');
const targets = ['M1GB1D', 'M1GBS', 'M1GBS2', 'G1GB1', 'G1GB2', 'G1GB4', 'A1GB'];

lines.forEach((l, i) => {
  targets.forEach(t => {
    if (l.includes(`code: '${t}'`)) {
      console.log(`\nTarget ${t} at line ${i+1}:`);
      for (let j = Math.max(0, i-2); j <= Math.min(lines.length-1, i+12); j++) {
        console.log(`  ${j+1}: ${lines[j]}`);
      }
    }
  });
});

