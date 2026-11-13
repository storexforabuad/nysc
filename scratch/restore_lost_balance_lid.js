// scratch/restore_lost_balance_lid.js
// Fix: the PURCHASE_DEBIT for ₦99 was recorded under LID 259794569039973@lid
// Our earlier reversal used phone JID — this script adds the correct reversal under the LID.
// Also verifies the final balance for both IDs.
import { db } from '../src/services/firebase.js';
import wallet from '../src/services/WalletService.js';

const LID = '259794569039973@lid';
const PHONE_JID = '2347032905036@s.whatsapp.net';

// Check current balance for LID (this is what MotherBot actually uses as `from`)
const balLidBefore = await wallet.getBalance(LID);
console.log(`Balance for LID before: ₦${balLidBefore}`);

// Add the reversal under the correct LID
const id = await wallet.recordPurchaseReversal(
  LID,
  99,
  'Manual reversal: M110MBS dispense failure 2026-11-10 — debit existed but data not delivered',
  { manual: true, reason: 'Bug fix: debit-before-dispense with no rollback', date: '2026-11-10' }
);
console.log(`Reversal recorded under LID: ${id}`);

const balLidAfter = await wallet.getBalance(LID);
console.log(`Balance for LID after:  ₦${balLidAfter}`);

// Also show what the phone JID shows (for reference — has the erroneous reversal from before)
const balPhone = await wallet.getBalance(PHONE_JID);
console.log(`\nBalance for PHONE_JID: ₦${balPhone} (has stray reversal from earlier attempt)`);
console.log('\nDone ✅');
process.exit(0);

