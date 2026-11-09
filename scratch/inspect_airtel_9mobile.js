import fs from 'fs';

const husmoNet = JSON.parse(fs.readFileSync('scratch/husmodata_network_plans.json', 'utf8'));
const peyflex = JSON.parse(fs.readFileSync('tmp_all_latest_peyflex_plans.json', 'utf8'));

function calculatePaystackFee(amount) {
  const num = Number(amount) || 0;
  if (num <= 0) return 0;
  if (num < 2500) {
    return Math.round(num * 0.015);
  }
  return Math.min(2000, Math.round(num * 0.015 + 100));
}

function normCap(str) {
  if (!str) return '';
  const m = str.match(/([\d\.]+)\s*(MB|GB)/i);
  if (!m) return str.trim().toUpperCase();
  const num = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'MB' && num >= 1000) return `${num / 1000}GB`;
  if (unit === 'GB' && num % 1 === 0) return `${Math.round(num)}GB`;
  if (unit === 'MB' && num % 1 === 0) return `${Math.round(num)}MB`;
  return `${num}${unit}`;
}

function normDur(str) {
  if (!str) return 'Unknown';
  const s = str.toLowerCase();
  if (s.includes('1 year') || s.includes('365 day')) return '1 Year';
  if (s.includes('2 month') || s.includes('60 day') || s.includes('60day') || s.includes('2months')) return '60 Days';
  if (s.includes('30 day') || s.includes('30day') || s.includes('1 month') || s.includes('1month')) return '30 Days';
  if (s.includes('14 day') || s.includes('14day')) return '14 Days';
  if (s.includes('7 day') || s.includes('7day') || s.includes('weekly')) return '7 Days';
  if (s.includes('3 day') || s.includes('3day')) return '3 Days';
  if (s.includes('2 day') || s.includes('2day') || s.includes('2,day')) return '2 Days';
  if (s.includes('1 day') || s.includes('1day')) return '1 Day';
  return str.replace(/[-]/g, '').trim();
}

function deduceSellPrice(hPlan) {
  const cap = normCap(hPlan.plan);
  const dur = normDur(hPlan.month_validate);
  const cost = Number(hPlan.plan_amount);

  if (cap === '25MB' || cap === '50MB' || cap === '75MB' || cap === '100MB' || cap === '110MB') return 100;
  if (cap === '150MB' || cap === '200MB' || cap === '230MB' || cap === '250MB') return 200;
  if (cap === '300MB' || cap === '350MB') return 300;
  if (cap === '500MB' || cap === '600MB' || cap === '650MB' || cap === '750MB') {
    if (dur === '1 Day' || dur === '2 Days') return 350;
    return 500;
  }
  if (cap === '1GB') {
    if (dur === '1 Day') return 350;
    if (dur === '2 Days' || dur === '3 Days') return 500;
    if (dur === '7 Days') return 800;
    return 1000;
  }
  if (cap === '1.1GB' || cap === '1.2GB' || cap === '1.5GB' || cap === '1.8GB') {
    if (dur === '1 Day') return 450;
    if (dur === '2 Days' || dur === '3 Days') return 600;
    if (dur === '7 Days') return 1000;
    return 1200;
  }
  if (cap === '2GB') {
    if (dur === '1 Day' || dur === '2 Days') return 800;
    if (dur === '7 Days') return 1200;
    return 1500;
  }
  if (cap === '2.5GB' || cap === '2.6GB' || cap === '2.7GB') {
    if (dur === '1 Day' || dur === '2 Days') return 900;
    if (dur === '7 Days') return 1500;
    return 2000;
  }
  if (cap === '3GB' || cap === '3.2GB' || cap === '3.5GB' || cap === '3.7GB') {
    if (dur === '1 Day' || dur === '2 Days') return 1000;
    if (dur === '7 Days') return 1500;
    return 2000;
  }
  if (cap === '4GB' || cap === '4.5GB') {
    if (dur === '2 Days' || dur === '3 Days') return 1500;
    return 2500;
  }
  if (cap === '5GB' || cap === '5.2GB' || cap === '5.5GB') {
    if (dur === '2 Days' || dur === '3 Days') return 1500;
    if (dur === '7 Days') return 2000;
    return 2500;
  }
  if (cap === '6GB' || cap === '6.25GB' || cap === '6.75GB' || cap === '7GB' || cap === '7.25GB' || cap === '7.5GB') {
    if (dur === '1 Day' || dur === '2 Days') return 2000;
    if (dur === '7 Days') return 2500;
    return 3500;
  }
  if (cap === '8GB' || cap === '9GB') return 3000;
  if (cap === '10GB' || cap === '11GB') {
    if (dur === '7 Days' || dur === '14 Days') return 3500;
    return 4500;
  }
  if (cap === '12GB' || cap === '12.5GB' || cap === '13GB') return 5000;
  if (cap === '14GB' || cap === '14.5GB' || cap === '15GB') return 5500;
  if (cap === '16.5GB' || cap === '18GB') return 6000;
  if (cap === '20GB' || cap === '20.5GB') return 7500;
  if (cap === '25GB' || cap === '28GB') return 9000;
  if (cap === '30GB' || cap === '35GB' || cap === '36GB' || cap === '38GB' || cap === '40GB') return 11000;
  if (cap === '60GB' || cap === '64GB' || cap === '65GB') return 16000;
  if (cap === '75GB') return 18000;
  if (cap === '90GB' || cap === '100GB' || cap === '107GB') return 25000;
  if (cap === '150GB' || cap === '160GB' || cap === '165GB') return 35000;
  if (cap === '200GB' || cap === '250GB') return 50000;
  if (cap === '800GB') return 125000;

  return Math.ceil((cost * 1.15) / 50) * 50;
}

// Check Airtel plans
const airtelProfitable = [];
for (const p of husmoNet.AIRTEL_PLAN) {
  const cost = Number(p.plan_amount);
  if (cost > 100000) continue;
  const sell = deduceSellPrice(p);
  const fee = calculatePaystackFee(sell);
  const net = sell - cost - fee;
  if (net >= 0) {
    airtelProfitable.push({
      id: p.id,
      type: p.plan_type,
      cap: normCap(p.plan),
      dur: normDur(p.month_validate),
      cost,
      sell,
      fee,
      net
    });
  }
}

// Check 9mobile plans
const nineMobileProfitable = [];
for (const p of husmoNet['9MOBILE_PLAN']) {
  const cost = Number(p.plan_amount);
  if (cost > 100000) continue;
  const sell = deduceSellPrice(p);
  const fee = calculatePaystackFee(sell);
  const net = sell - cost - fee;
  if (net >= 0) {
    nineMobileProfitable.push({
      id: p.id,
      type: p.plan_type,
      cap: normCap(p.plan),
      dur: normDur(p.month_validate),
      cost,
      sell,
      fee,
      net
    });
  }
}

console.log('Profitable Airtel plans:', airtelProfitable.length);
console.log('Profitable 9mobile plans:', nineMobileProfitable.length);

console.log('\n--- SAMPLE AIRTEL TOP PROFITABLE ---');
console.table(airtelProfitable.sort((a,b) => b.net - a.net).slice(0, 15));

console.log('\n--- SAMPLE 9MOBILE TOP PROFITABLE ---');
console.table(nineMobileProfitable.sort((a,b) => b.net - a.net).slice(0, 15));

