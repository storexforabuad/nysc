import { logger } from '../config/env.js';
import { db } from './firebase.js';
import payflex from './payflex.js';
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
                .where('retryCount', '<', this.maxRetries)
                .limit(5)
                .get();

            if (snapshot.empty) return;

            logger.info(`[RETRY-QUEUE] Found ${snapshot.size} failed order(s) to retry.`);

            for (const doc of snapshot.docs) {
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
                    const result = await payflex.dispenseData(
                        order.buyerPhone.split('@')[0],
                        order.serial || order.planId
                    );

                    // SUCCESS — update order to COMPLETED
                    const netProfit = order.markup ?? +(order.amount - (order.baseCost || order.amount)).toFixed(2);
                    const coMemberShare = +(netProfit * 0.50).toFixed(2);
                    const systemShare = +(netProfit * 0.30).toFixed(2);
                    const cdsShare = +(netProfit * 0.20).toFixed(2);

                    await db.ledger.doc(orderId).update({
                        status: 'COMPLETED',
                        settlement: { coMemberShare, systemShare, cdsShare, totalProfit: netProfit },
                        retryCount: currentRetry,
                        resolvedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });

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

                        // Notify customer
                        if (this.onOrderUpdate) {
                            this.onOrderUpdate({
                                type: 'REFUNDED_TO_WALLET',
                                orderId,
                                order,
                                message: `😔 *We're sorry* — the network is currently experiencing issues and we could not deliver your ${order.planName || 'data'} plan.\n\n✅ *Good news:* Your payment of *₦${order.amount}* has been safely refunded directly into your *Clarion Wallet*!\n\nReply *BALANCE* to view your funds, or send *BUY* again later to use your wallet to re-order. 🛡️`
                            });

                            // Also notify the store owner
                            this.onOrderUpdate({
                                type: 'OWNER_ALERT',
                                orderId,
                                order,
                                message: `🚨 *Failed Order Auto-Refunded*\n\nA customer order failed due to network issues. The funds have been safely pushed to their Customer Wallet.\n\n• Plan: ${order.planName || 'N/A'}\n• Refunded: ₦${order.amount}\n• Customer: ${order.buyerPhone?.split('@')[0] || 'Unknown'}\n• Auto Action: REFUNDED_TO_WALLET`
                            });
                        }
                    } else {
                        logger.info(`[RETRY-QUEUE] Order ${orderId} failed retry ${currentRetry}. Next retry in ${(backoffMs * 2) / 60000}min.`);
                    }

                    await db.ledger.doc(orderId).update(updatePayload);
                }
            }
        } catch (err) {
            logger.error('[RETRY-QUEUE] Processing error:', err);
        }
    }
}

export default new RetryQueue();
