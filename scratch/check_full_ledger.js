// scratch/check_full_ledger.js
// Dump all 34 ledger docs to understand all record types
import { db } from '../src/services/firebase.js';

const allSnap = await db.ledger.get();
console.log(`Total ledger docs: ${allSnap.size}\n`);

allSnap.forEach(doc => {
  const d = doc.data();
  console.log(`[${d.type}] status=${d.status} | userId=${d.userId} | amount=${d.amount} | desc=${(d.description||'').slice(0,60)}`);
});
process.exit(0);

