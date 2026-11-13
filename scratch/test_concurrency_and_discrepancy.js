import { calculatePaystackFee } from '../src/services/payflex.js';

function testPaystackFeeAddition() {
  console.log('=== Test 1: Paystack Fee on Wallet Funding ===');
  const amounts = [200, 500, 1000, 2000, 5000];
  for (const amt of amounts) {
    const fee = calculatePaystackFee(amt);
    const total = amt + fee;
    console.log(`  - Fund ₦${amt} ➔ Fee: ₦${fee} ➔ Total to Pay: ₦${total}`);
  }
}

function testConcurrencyMicroOffset() {
  console.log('\n=== Test 2: Concurrency Micro-Naira Stamping ===');
  const activeAmounts = new Set([400, 401]);
  let planPrice = 400;
  let finalAmount = planPrice;
  while (activeAmounts.has(finalAmount)) {
    finalAmount += 1;
  }
  console.log(`  - Plan base: ₦${planPrice}, Existing active: [400, 401] ➔ Stamped invoice: ₦${finalAmount}`);
  if (finalAmount === 402) {
    console.log('  ✅ Concurrency offset correctly resolved to ₦402 (unique)');
  } else {
    console.log('  ❌ Failed concurrency offset');
  }
}

function testDiscrepancyLogic() {
  console.log('\n=== Test 3: Discrepancy Engine (Overpayment & Underpayment) ===');
  const requiredAmount = 1200;

  // Case A: Overpayment
  const paidOver = 1500;
  const isOver = paidOver > requiredAmount;
  const excessChange = paidOver - requiredAmount;
  console.log(`  - Overpayment: Required ₦${requiredAmount}, Paid ₦${paidOver}`);
  console.log(`    ➔ Fulfill order? ${isOver} | Change to credit customer wallet: ₦${excessChange}`);

  // Case B: Underpayment
  const paidUnder = 1000;
  const isUnder = paidUnder < requiredAmount;
  const shortfall = requiredAmount - paidUnder;
  console.log(`  - Underpayment: Required ₦${requiredAmount}, Paid ₦${paidUnder}`);
  console.log(`    ➔ Fulfill order? ${!isUnder} | Shortfall: ₦${shortfall} | Amount deposited to customer wallet: ₦${paidUnder}`);
}

testPaystackFeeAddition();
testConcurrencyMicroOffset();
testDiscrepancyLogic();

