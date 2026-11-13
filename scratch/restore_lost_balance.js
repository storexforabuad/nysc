// scratch/restore_lost_balance.js
// One-time manual reversal to restore ₦99 lost due to debit-before-dispense bug (2026-11-10).
// Run ONCE: node scratch/restore_lost_balance.js

import wallet from '../src/services/WalletService.js';

const USER_ID = '2347032905036@s.whatsapp.net';
const AMOUNT = 99;

console.log(`Restoring ₦${AMOUNT} for ${USER_ID}...`);

const balBefore = await wallet.getBalance(USER_ID);
console.log(`Balance before: ₦${balBefore}`);

const id = await wallet.recordPurchaseReversal(
  USER_ID,
  AMOUNT,
  'Manual reversal: M110MBS dispense failure 2026-11-10 — debit existed but data not delivered',
  { manual: true, reason: 'Bug fix: debit-before-dispense with no rollback', date: '2026-11-10' }
);
console.log(`Reversal recorded: ${id}`);

const balAfter = await wallet.getBalance(USER_ID);
console.log(`Balance after:  ₦${balAfter}`);
console.log('Done ✅');
process.exit(0);

