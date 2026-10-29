import axios from 'axios';
import fs from 'fs';
import { config } from '../src/config/env.js';

const client = axios.create({
  baseURL: 'https://client.peyflex.com.ng',
  headers: { Authorization: 'Token ' + process.env.PAYFLEX_TOKEN }
});

async function run() {
  const res = await client.get('/bills/pricing/');
  fs.writeFileSync('storage/pricing_page.html', res.data);
  console.log('Saved storage/pricing_page.html, size:', res.data.length);

  // Extract all cards / tables
  const blocks = res.data.match(/<div class="card[^"]*"[\s\S]*?<\/table>[\s\S]*?<\/div>/gi) || [];
  console.log('Found card blocks:', blocks.length);
  blocks.forEach((b, i) => {
    const text = b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`\n--- Block ${i + 1} ---`);
    console.log(text.slice(0, 300));
  });
}

run().catch(console.error);
