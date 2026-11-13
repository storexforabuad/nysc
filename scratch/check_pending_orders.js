// scratch/check_pending_orders.js
// Find recent AWAITING_PAYMENT orders that may have been paid but not processed
import { db } from '../src/services/firebase.js';

const snap = await db.ledger.get();
const now = Date.now();
const TWO_HOURS = 2 * 60 * 60 * 1000;

console.log('=== ALL LEDGER RECORDS (recent first) ===\n');
const docs = [];
snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));

// Sort by createdAt desc
docs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

docs.slice(0, 20).forEach(d => {
  const age = d.createdAt ? Math.round((now - new Date(d.createdAt)) / 60000) : '?';
  console.log(`[${d.type}] status=${d.status} | ₦${d.amount} | userId=${d.userId}`);
  console.log(`  id=${d.id} | phone=${d.buyerPhone || d.targetPhone || ''} | plan=${d.planName || d.planId || ''}`);
  console.log(`  created=${d.createdAt} (~${age}m ago)\n`);
});
process.exit(0);

