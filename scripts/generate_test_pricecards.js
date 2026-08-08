import fs from 'fs';
import path from 'path';
import PriceCardGenerator from '../src/services/PriceCardGenerator.js';

(async () => {
  // ensure output dir exists
  const outDir = path.join(process.cwd(), 'src', 'media', 'price_cards');
  fs.mkdirSync(outDir, { recursive: true });

  const samplePlans = [];
  const networks = ['mtn', 'airtel', 'glo', '9mobile'];

  networks.forEach((net) => {
    for (let i = 1; i <= 8; i++) {
      const sizeGb = i * (net === 'mtn' ? 0.5 : 1);
      samplePlans.push({
        network: net,
        name: `${Math.round(sizeGb * 1000)}MB`,
        description: `${Math.round(sizeGb * 1000)}MB bundle`,
        sellPrice: Math.round(200 * i + (net === 'glo' ? -20 : net === 'airtel' ? 30 : 0))
      });
    }
  });

  try {
    const paths = await PriceCardGenerator.generateWeeklyCards(samplePlans);
    console.log('Generated cards:', paths);
  } catch (e) {
    console.error('Generation error:', e);
    process.exit(1);
  }
})();
