// scratch/check_motherbot_wallet.js
// Find what records hold the ₦150 wallet credit for MotherBot user
import { db } from '../src/services/firebase.js';

const USER_ID = '2347032905036@s.whatsapp.net';

// Check all ledger docs — no filter, dump everything
const allSnap = await db.ledger.get();
console.log(`Total ALL ledger docs: ${allSnap.size}`);

// Look for wallet-fund or credit records related to this user
const related = [];
allSnap.forEach(doc => {
  const d = doc.data();
  const str = JSON.stringify(d).toLowerCase();
  if (str.includes('2347032905036') || str.includes('7032905036')) {
    related.push({ id: doc.id, ...d });
  }
});

console.log(`\nRecords mentioning user: ${related.length}`);
related.forEach(r => {
  console.log(`  [${r.type}] status=${r.status} | amount=${r.amount} | userId=${r.userId} | desc=${r.description || ''}`);
});

// Also check users collection
if (db.users) {
  const uDoc = await db.users.doc(USER_ID).get();
  if (uDoc.exists) {
    const u = uDoc.data();
    console.log('\nUser doc wallet fields:', {
      walletBalance: u.walletBalance,
      balance: u.balance,
      dataFuelBalance: u.dataFuelBalance,
    });
  }
}
process.exit(0);

