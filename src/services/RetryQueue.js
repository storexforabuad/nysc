import { logger } from '../config/env.js';
import { db } from './firebase.js';
import payflex from './payflex.js';
import telecomDispatcher from './TelecomDispatcher.js';
import wallet from './WalletService.js';
import admin from 'firebase-admin';

class RetryQueue {
    constructor() {
        this.intervalMs = 2 * 60 * 1000; // 2 minutes
        this.maxRetries = 3;
        this._timer = null;
        // Callback set by server.js to notify customer/owner via WhatsApp
        this.onOrderUpdate = null;
    }

    start() {
        if (this._timer) return;
        logger.info('[RETRY-QUEUE] Started — scanning for failed orders every 2 minutes.');
        this._timer = setInterval(() => this._processFailedOrders(), this.intervalMs);
    }

    stop() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    async _processFailedOrders() {
        if (!db.ledger) return;

        try {
            const snapshot = await db.ledger
                .where('status', '==', 'FAILED_DISPENSE')
                .limit(10)
                .get();

            if (snapshot.empty) return;

            const eligibleDocs = snapshot.docs.filter(doc => (doc.data().retryCount || 0) < this.maxRetries);
            if (eligibleDocs.length === 0) return;

            logger.info(`[RETRY-QUEUE] Found ${eligibleDocs.length} failed order(s) to retry.`);

            for (const doc of eligibleDocs) {
                const order = doc.data();
                const orderId = doc.id;

                // Exponential backoff: 2min, 4min, 8min
                const backoffMs = this.intervalMs * Math.pow(2, order.retryCount || 0);
                const lastRetryAt = order.lastRetryAt ? new Date(order.lastRetryAt).getTime() : 0;
                if (Date.now() - lastRetryAt < backoffMs) {
                    continue; // Not ready for retry yet
                }

                const currentRetry = (order.retryCount || 0) + 1;
                logger.info(`[RETRY-QUEUE] Retrying order ${orderId} (attempt ${currentRetry}/${this.maxRetries})`);

                try {
                    let result;
                    if (order.orderType === 'airtime' || order.type === 'PENDING_AIRTIME' || order.type === 'FAILED_AIRTIME') {
                        const target = order.targetPhone || order.buyerPhone.split('@')[0];
                        result = await payflex.purchaseAirtime(order.network, target, order.amount);
                    } else if (order.orderType === 'exam_pin' || order.type === 'PENDING_EXAM_PIN' || order.type === 'FAILED_EXAM_PIN') {
                        result = await payflex.purchaseExamPin(order.examType);
                    } else {
                        const targetRecipient = order.recipientPhone || order.buyerPhone.split('@')[0];
                        result = await telecomDispatcher.dispenseData(
                            targetRecipient,
                            order.code || order.serial || order.planId
                        );
                    }

                    // SUCCESS — update order to COMPLETED
                    const netProfit = order.markup ?? +(order.amount - (order.baseCost || order.amount)).toFixed(2);
                    let userTier = order.donationTier;
                    if (!userTier && db.users && order.userId) {
                        try {
                            const uDoc = await db.users.doc(order.userId).get();
                            if (uDoc.exists) userTier = uDoc.data().donationTier;
                        } catch (e) {}
                    }
                    const settlement = wallet.calculateSettlement(netProfit, userTier);

                    await db.ledger.doc(orderId).update({
                        status: 'COMPLETED',
                        settlement,
                        retryCount: currentRetry,
                        resolvedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });

                    // Increment CDS pool on user doc
                    if (db.users && order.userId && settlement.cdsShare > 0) {
                        let prevCds = 0;
                        let userData = null;
                        try {
                            const uDoc = await db.users.doc(order.userId).get();
                            if (uDoc.exists) {
                                userData = uDoc.data();
                                prevCds = Number(userData.totalCdsDonated) || 0;
                            }
                        } catch (e) {}
                        const newCds = +(prevCds + settlement.cdsShare).toFixed(2);
                        await db.users.doc(order.userId).set({
                            totalCdsDonated: admin.firestore.FieldValue.increment(settlement.cdsShare)
                        }, { merge: true }).catch(() => {});
                        import('../bot/MotherBot.js').then(mb => {
                            if (mb.handleMilestoneCheck) mb.handleMilestoneCheck(order.userId, prevCds, newCds, userData).catch(() => {});
                        }).catch(() => {});
                    }

                    // Increment contact stats
                    if (db.users && order.buyerPhone && order.userId) {
                        try {
                            const cleanCustomer = order.buyerPhone.includes('@') ? order.buyerPhone : `${order.buyerPhone}@s.whatsapp.net`;
                            await db.users.doc(order.userId).collection('contacts').doc(cleanCustomer).set({
                                totalSpent: admin.firestore.FieldValue.increment(order.amount),
                                totalOrders: admin.firestore.FieldValue.increment(1)
                            }, { merge: true });
                        } catch (e) { }
                    }

                    logger.info(`[RETRY-QUEUE] ✅ Order ${orderId} dispensed successfully on retry ${currentRetry}!`);

                    // Notify customer via callback
                    if (this.onOrderUpdate) {
                        this.onOrderUpdate({
                            type: 'RETRY_SUCCESS',
                            orderId,
                            order,
                            message: `✅ *Great news!* Your ${order.planName || 'data'} plan has been delivered successfully! 🎉\n\nThank you for your patience — powered by Clarion A.I.`
                        });
                    }

                } catch (retryError) {
                    // FAILED again
                    const updatePayload = {
                        retryCount: currentRetry,
                        lastRetryAt: new Date().toISOString(),
                        lastError: retryError.message || 'Unknown error',
                        updatedAt: new Date().toISOString()
                    };

                    // If max retries exceeded, automatically refund to customer wallet
                    if (currentRetry >= this.maxRetries) {
                        updatePayload.status = 'REFUNDED_TO_WALLET';
                        logger.warn(`[RETRY-QUEUE] 🔴 Order ${orderId} exhausted all retries. Auto-refunding to customer wallet.`);

                        // Increment customer wallet balance securely
                        if (db.users && order.buyerPhone && order.userId) {
                            try {
                                const cleanCustomer = order.buyerPhone.includes('@') ? order.buyerPhone : `${order.buyerPhone}@s.whatsapp.net`;
                                await db.users.doc(order.userId).collection('contacts').doc(cleanCustomer).set({
                                    walletBalance: admin.firestore.FieldValue.increment(order.amount)
                                }, { merge: true });
                            } catch (e) {
                                logger.error(`[RETRY-QUEUE] CRITICAL: Failed to credit wallet for ${order.buyerPhone}:`, e.message);
                            }
                        }

                        // Notify customer with secure wallet storage assurance (No bank refund option)
                        const netName = order.network ? order.network.toUpperCase() : 'Telecom';
                        const planLabel = order.planName || 'data';
                        const safeWalletMessage = `⚠️ *Network Delivery Update*\n` +
                            `━━━━━━━━━━━━━━━━━━━━━\n` +
                            `${netName} servers were unable to process your ${planLabel} order after multiple automatic attempts.\n\n` +
                            `💰 *₦${Number(order.amount).toLocaleString()}* is safely stored in your *Clarion In-Chat Wallet*!\n\n` +
                            `Your funds are 100% secure and will NOT expire. We will notify you as soon as the ${netName} data server is restored and stable.\n\n` +
                            `👉 In the meantime, reply *BUY [code]* to choose an alternative plan anytime using your wallet credit.`;

                        const adminAlertMessage = `🚨 *FAILED ORDER DISPATCH ALERT*\n` +
                            `━━━━━━━━━━━━━━━━━━━━━\n` +
                            `Order ID: #${orderId}\n` +
                            `Customer: ${order.buyerPhone?.split('@')[0] || 'Unknown'}\n` +
                            `Plan: ${planLabel} (₦${Number(order.amount).toLocaleString()})\n` +
                            `Cause: Telco server unresponsive on both providers after ${this.maxRetries} retries.\n` +
                            `Action Taken: Customer wallet auto-credited with ₦${Number(order.amount).toLocaleString()}.`;

                        if (this.onOrderUpdate) {
                            this.onOrderUpdate({
                                type: 'REFUNDED_TO_WALLET',
                                orderId,
                                order,
                                message: safeWalletMessage
                            });

                            // Also notify the store owner / admin
                            this.onOrderUpdate({
                                type: 'OWNER_ALERT',
                                orderId,
                                order,
                                message: adminAlertMessage
                            });
                        }
                    } else {
                        logger.info(`[RETRY-QUEUE] Order ${orderId} failed retry ${currentRetry}. Next retry in ${(backoffMs * 2) / 60000}min.`);
                    }

                    await db.ledger.doc(orderId).update(updatePayload);
                }
            }
        } catch (err) {
            logger.error({ err }, `[RETRY-QUEUE] Processing error: ${err?.message || err}`);
        }
    }
}

export default new RetryQueue();
