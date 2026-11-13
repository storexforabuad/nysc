// scratch/check_ledger.js
// Inspect ledger records for MotherBot user to understand balance calculation
import { db } from '../src/services/firebase.js';
import wallet from '../src/services/WalletService.js';

const USER_ID = '2347032905036@s.whatsapp.net';

const snap = await db.ledger.where('userId', '==', USER_ID).get();
console.log(`Total ledger docs for ${USER_ID}: ${snap.size}`);
snap.forEach(doc => {
  const d = doc.data();
  console.log(`  [${d.type}] status=${d.status} | amount=${d.amount} | ${d.description || ''}`);
});

const bal = await wallet.getBalance(USER_ID);
console.log(`\nCalculated balance: ₦${bal}`);
process.exit(0);

