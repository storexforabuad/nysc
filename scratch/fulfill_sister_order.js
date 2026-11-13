// scratch/fulfill_sister_order.js
// Manual fulfillment for order CLARION_1794322701433 (Sister's MTN 110MB)
import { db } from '../src/services/firebase.js';
import telecomDispatcher from '../src/services/TelecomDispatcher.js';
import wallet from '../src/services/WalletService.js';

const ORDER_ID = 'CLARION_1794322701433';
const TXN_REF = '100004261110145938177046168446'; // Paystack reference from notification

async function main() {
  console.log(`[FULFILL] Fetching order ${ORDER_ID}...`);
  const docRef = db.ledger.doc(ORDER_ID);
  const snap = await docRef.get();

  if (!snap.exists) {
    console.error(`Order ${ORDER_ID} not found in Firestore ledger.`);
    process.exit(1);
  }

  const order = snap.data();
  console.log(`Order details:`, {
    status: order.status,
    amount: order.amount,
    code: order.code,
    recipient: order.recipientPhone || order.buyerPhone,
    buyerPhone: order.buyerPhone
  });

  if (order.status === 'COMPLETED') {
    console.log(`Order is already COMPLETED. Skipping.`);
    process.exit(0);
  }

  // 1. Move to DISPENSING
  await docRef.update({
    status: 'DISPENSING',
    updatedAt: new Date().toISOString()
  });

  const recipient = order.recipientPhone || order.buyerPhone.replace(/\D/g, '');
  const planCode = order.code || 'M110MBS';
  console.log(`[DISPENSE] Dispensing ${planCode} to ${recipient}...`);

  try {
    const result = await telecomDispatcher.dispenseData(recipient, planCode);
    console.log(`[DISPENSE SUCCESS] Provider: ${result.provider}, Ref: ${result.reference}`);

    // 2. Settle order
    let userData = null;
    if (db.users && order.userId) {
      try {
        const uDoc = await db.users.doc(order.userId).get();
        if (uDoc.exists) userData = uDoc.data();
      } catch (e) {}
    }

    const settlement = await wallet.settleCompletedOrder({
      orderId: ORDER_ID,
      userId: order.userId,
      amount: order.amount || 100,
      baseCost: order.baseCost || 98,
      wholesaleCost: order.baseCost || 98,
      netProfit: (order.amount || 100) - (order.baseCost || 98),
      userDoc: userData,
      buyerPhone: order.buyerPhone,
      planName: order.planName || 'MTN 110MB',
      transactionRef: TXN_REF,
      source: 'AUTOMATED_STORE'
    });

    // 3. Mark COMPLETED
    await docRef.update({
      status: 'COMPLETED',
      settlement,
      paystackTransactionRef: TXN_REF,
      updatedAt: new Date().toISOString()
    });

    console.log(`[ORDER COMPLETED] Order ${ORDER_ID} fulfilled and settled successfully!`);
    console.log(`Data has been sent to recipient: ${recipient}`);
  } catch (err) {
    console.error(`[DISPENSE FAILED]:`, err.message);
    await docRef.update({
      status: 'FAILED_DISPENSE',
      lastError: err.message,
      updatedAt: new Date().toISOString()
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

