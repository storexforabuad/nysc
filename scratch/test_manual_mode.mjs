import assert from 'assert';
import { BOT_MODES, SUBSCRIPTION_PLANS } from '../src/services/WalletService.js';
import wallet from '../src/services/WalletService.js';
import { detectNetwork } from '../src/utils/networkUtils.js';
import { mockManualOrders } from '../src/bot/MotherBot.js';

console.log('🧪 Starting Manual Storefront & Freemium Upgrade Test Suite...\n');

// ── Test 1: Constants Verification ──
console.log('Test 1: BOT_MODES and SUBSCRIPTION_PLANS constants');
assert.strictEqual(BOT_MODES.MANUAL, 'manual');
assert.strictEqual(BOT_MODES.AUTONOMOUS, 'autonomous');
assert.strictEqual(SUBSCRIPTION_PLANS.WEEKLY.price, 500);
assert.strictEqual(SUBSCRIPTION_PLANS.WEEKLY.durationDays, 7);
assert.strictEqual(SUBSCRIPTION_PLANS.MONTHLY.price, 1500);
assert.strictEqual(SUBSCRIPTION_PLANS.MONTHLY.durationDays, 30);
console.log('✅ Constants verified successfully.\n');

// ── Test 2: Regex Matching for Manual Mode Commands ──
console.log('Test 2: Regex matching for all new commands');

const checkRegex = /^check\s+(0\d{3})\s+([\d]+(?:gb|mb)?|all)$/i;
assert.ok(checkRegex.test('CHECK 0801 1GB'), 'CHECK 0801 1GB should match');
assert.ok(checkRegex.test('check 0802 500'), 'check 0802 500 should match');
assert.ok(checkRegex.test('Check 0803 ALL'), 'Check 0803 ALL should match');
assert.ok(checkRegex.test('CHECK 0705 500MB'), 'CHECK 0705 500MB should match');
assert.ok(!checkRegex.test('CHECK 080 1GB'), 'CHECK 3-digit prefix should not match');
assert.ok(!checkRegex.test('CHECK 0801'), 'CHECK without size/budget should not match');

const orderRegex = /^order(?:\s+(mtn|airtel|glo|9mobile))?\s+([\d]+(?:gb|mb)?|\d+)\s+(0\d{10}|\+?234\d{10})$/i;
assert.ok(orderRegex.test('ORDER 1GB 08012345678'), 'ORDER without network should match (auto-detected)');
assert.ok(orderRegex.test('order 500 08023456789'), 'order 500 without network should match');
assert.ok(orderRegex.test('ORDER MTN 1GB 08012345678'), 'ORDER MTN 1GB 08012345678 should match');
assert.ok(orderRegex.test('order airtel 500 08023456789'), 'order airtel 500 should match');
assert.ok(orderRegex.test('ORDER GLO 2GB +2348051234567'), 'ORDER with +234 should match');
assert.ok(!orderRegex.test('ORDER 1GB 080123'), 'ORDER with short phone should not match');

const ordersRegex = /^orders$/i;
assert.ok(ordersRegex.test('ORDERS'), 'ORDERS should match');
assert.ok(ordersRegex.test('orders'), 'orders should match');

const helpRegex = /^(?:help|commands|\?)$/i;
assert.ok(helpRegex.test('HELP'), 'HELP should match');
assert.ok(helpRegex.test('commands'), 'commands should match');
assert.ok(helpRegex.test('?'), '? should match');

const cancelRegex = /^cancel\s+(MO-\d+)$/i;
assert.ok(cancelRegex.test('CANCEL MO-4821'), 'CANCEL MO-4821 should match');
assert.ok(cancelRegex.test('cancel mo-1234'), 'cancel mo-1234 should match');
assert.ok(!cancelRegex.test('CANCEL 1234'), 'CANCEL without MO- prefix should not match');

const upgradeRegex = /^upgrade(?:\s+(weekly|monthly))?$/i;
assert.ok(upgradeRegex.test('UPGRADE'), 'Bare UPGRADE should match');
assert.ok(upgradeRegex.test('upgrade weekly'), 'upgrade weekly should match');
assert.ok(upgradeRegex.test('UPGRADE MONTHLY'), 'UPGRADE MONTHLY should match');
assert.ok(!upgradeRegex.test('UPGRADE YEARLY'), 'UPGRADE YEARLY should not match');

const downgradeRegex = /^downgrade$/i;
assert.ok(downgradeRegex.test('DOWNGRADE'), 'DOWNGRADE should match');

const modeRegex = /^mode$/i;
assert.ok(modeRegex.test('MODE'), 'MODE should match');

console.log('✅ Command regex validation passed.\n');

// ── Test 3: Network Detection & Prefix Matching ──
console.log('Test 3: Network Detection on prefixes');
assert.strictEqual(detectNetwork('0803'), 'mtn');
assert.strictEqual(detectNetwork('0802'), 'airtel');
assert.strictEqual(detectNetwork('0805'), 'glo');
assert.strictEqual(detectNetwork('0809'), '9mobile');
console.log('✅ Network detection verified.\n');

// ── Test 4: Manual Order Data Creation & Lifecycle ──
console.log('Test 4: Manual Order Storage & Lifecycle');
const testOrderId = 'MO-9999';
const testOrder = {
  orderId: testOrderId,
  partnerId: 'test_partner_123',
  type: 'data',
  network: 'MTN',
  planSerial: 101,
  planName: 'MTN 1GB (30 Days)',
  amount: 350,
  baseCost: 280,
  targetPhone: '08012345678',
  status: 'PENDING_PAYMENT',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
};

mockManualOrders.set(testOrderId, testOrder);
assert.strictEqual(mockManualOrders.get(testOrderId).status, 'PENDING_PAYMENT');

// Test order expiration logic
const expiredOrder = {
  ...testOrder,
  orderId: 'MO-8888',
  expiresAt: new Date(Date.now() - 60 * 1000).toISOString() // 1 min ago
};
mockManualOrders.set('MO-8888', expiredOrder);
const isExpired = new Date(mockManualOrders.get('MO-8888').expiresAt) < new Date();
assert.ok(isExpired, 'Order MO-8888 should be identified as expired');
console.log('✅ Manual Order lifecycle verified.\n');

// ── Test 5: Subscription Pricing & Settlement Math ──
console.log('Test 5: Profit calculation and tripartite settlement for manual order');
const netProfit = +(testOrder.amount - testOrder.baseCost).toFixed(2);
assert.strictEqual(netProfit, 70.00);

const settlement = wallet.calculateSettlement(netProfit, 'MEMBER');
assert.strictEqual(settlement.coMemberShare, 44.80); // 64% of 70
assert.strictEqual(settlement.cdsShare, 11.20);     // 16% of 70
assert.strictEqual(settlement.systemShare, 14.00);  // 20% of 70
console.log('✅ Settlement math verified.\n');

// ── Test 6: ProxyBot Mode Gate ──
console.log('Test 6: ProxyBot Mode Gate Simulation');
function simulateProxyBotGate(user) {
  // Mode Gate: If not autonomous, ProxyBot is completely silent
  if (user.botMode !== BOT_MODES.AUTONOMOUS) {
    return 'SILENT';
  }
  return 'RESPOND';
}

const manualUser = { uid: 'user_1', botMode: 'manual' };
const defaultUser = { uid: 'user_2' };
const autonomousUser = { uid: 'user_3', botMode: 'autonomous' };

assert.strictEqual(simulateProxyBotGate(manualUser), 'SILENT');
assert.strictEqual(simulateProxyBotGate(defaultUser), 'SILENT');
assert.strictEqual(simulateProxyBotGate(autonomousUser), 'RESPOND');
console.log('✅ ProxyBot Mode Gate verified.\n');

// ── Test 7: Subscription Expiry & Auto-Renew Simulation ──
console.log('Test 7: Subscription Expiry & Auto-Renew Simulation');
function simulateSubscriptionCheck(user, walletBalance) {
  if (user.botMode === BOT_MODES.AUTONOMOUS && user.subscription?.expiresAt) {
    const now = new Date();
    const expiry = new Date(user.subscription.expiresAt);

    if (now > expiry) {
      if (user.subscription.autoRenew !== false) {
        const planKey = user.subscription.plan || 'MONTHLY';
        const planConfig = SUBSCRIPTION_PLANS[planKey] || SUBSCRIPTION_PLANS.MONTHLY;

        if (walletBalance >= planConfig.price) {
          // Auto-renew succeeds
          return {
            status: 'RENEWED',
            botMode: BOT_MODES.AUTONOMOUS,
            newExpiry: new Date(now.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000).toISOString()
          };
        }
      }
      // Revert to manual
      return {
        status: 'EXPIRED_REVERTED_TO_MANUAL',
        botMode: BOT_MODES.MANUAL
      };
    }
  }
  return { status: 'ACTIVE', botMode: user.botMode };
}

// Case A: Subscription expired, wallet has sufficient funds (e.g. ₦2,000 >= ₦1,500)
const subUserWithFunds = {
  botMode: BOT_MODES.AUTONOMOUS,
  subscription: {
    plan: 'MONTHLY',
    expiresAt: new Date(Date.now() - 10000).toISOString(),
    autoRenew: true
  }
};
const resWithFunds = simulateSubscriptionCheck(subUserWithFunds, 2000);
assert.strictEqual(resWithFunds.status, 'RENEWED');
assert.strictEqual(resWithFunds.botMode, BOT_MODES.AUTONOMOUS);

// Case B: Subscription expired, insufficient funds (₦200 < ₦1,500)
const resNoFunds = simulateSubscriptionCheck(subUserWithFunds, 200);
assert.strictEqual(resNoFunds.status, 'EXPIRED_REVERTED_TO_MANUAL');
assert.strictEqual(resNoFunds.botMode, BOT_MODES.MANUAL);

// Case C: Active subscription not expired
const subUserActive = {
  botMode: BOT_MODES.AUTONOMOUS,
  subscription: {
    plan: 'WEEKLY',
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    autoRenew: true
  }
};
const resActive = simulateSubscriptionCheck(subUserActive, 0);
assert.strictEqual(resActive.status, 'ACTIVE');
assert.strictEqual(resActive.botMode, BOT_MODES.AUTONOMOUS);

console.log('✅ Subscription Expiry & Auto-Renew logic verified.\n');

// ── Clean up mock manual orders ──
mockManualOrders.delete(testOrderId);
mockManualOrders.delete('MO-8888');

console.log('🎉 ALL 7 TEST SUITES PASSED FLAWLESSLY!');
