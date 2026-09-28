import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { config, logger } from './config/env.js';
import squad from './services/SquadService.js';
import payflex from './services/payflex.js';
import admin, { db } from './services/firebase.js';
import sessionManager from './bot/SessionManager.js';
import mediaGen from './services/mediaGen.js';
import wallet from './services/WalletService.js';
import { startWeeklyReportJob } from './jobs/weeklyReportJob.js';
import { startStatusPostJob } from './jobs/statusPostJob.js';
import ReceiptGenerator from './services/ReceiptGenerator.js';
import PriceCardGenerator from './services/PriceCardGenerator.js';
import CaptionService from './services/CaptionService.js';
import retryQueue from './services/RetryQueue.js';
import broadcastQueue from './services/BroadcastQueue.js';
import adminService from './services/AdminService.js';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { CENTRAL_HUB_ACCOUNT, handleMilestoneCheck, checkIsSameNumber, mockManualOrders } from './bot/MotherBot.js';
import networkRecoveryNotifier from './services/NetworkRecoveryNotifier.js';

// ── HTTP Rate Limiters ──
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 30,              // 30 requests per minute per IP
  message: { error: 'Too many webhook requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,              // 60 requests per minute per IP
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

async function startServer() {
  const app = express();
  app.use(express.json());

  // Apply API rate limiter globally to /api routes
  app.use('/api', apiLimiter);

  // API routes go here FIRST
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // --- ADMIN AUTH ROUTES ---
  app.post('/api/auth/login', (req, res) => {
    const { passcode } = req.body;
    if (!passcode) {
      return res.status(400).json({ error: 'Passcode required' });
    }
    if (passcode === process.env.ADMIN_PASSCODE) {
      const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '24h' });
      return res.json({ token, success: true });
    } else {
      return res.status(401).json({ error: 'Invalid passcode' });
    }
  });

  // Admin Verification Middleware
  const verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    try {
      jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      next();
    } catch (err) {
      return res.status(403).json({ error: 'Unauthorized: Invalid token' });
    }
  };

  app.get('/api/admin/metrics', verifyAdminToken, async (req, res) => {
    try {
      const metrics = await adminService.getSystemMetrics();
      const activeBots = await adminService.getActiveBotCount();
      res.json({ ...metrics, activeBots });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch admin metrics' });
    }
  });

  app.get('/api/admin/partners', verifyAdminToken, async (req, res) => {
    try {
      const partners = await adminService.listPartners();
      res.json(partners);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch partners' });
    }
  });

  app.get('/api/admin/withdrawals/pending', verifyAdminToken, async (req, res) => {
    try {
      const withdrawals = await adminService.listPendingWithdrawals();
      res.json(withdrawals);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch pending withdrawals' });
    }
  });

  app.post('/api/admin/withdrawals/:id/approve', verifyAdminToken, async (req, res) => {
    try {
      if (!db.ledger) return res.status(500).json({ error: 'DB unavailable' });
      await db.ledger.doc(req.params.id).update({
        status: 'SUCCESS',
        updatedAt: new Date().toISOString()
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/generate-test-receipt', verifyAdminToken, async (req, res) => {
    try {
      const sampleOrder = {
        id: `TEST_${Date.now()}`,
        planName: 'MTN 5GB',
        buyerPhone: '2348000000001@s.whatsapp.net',
        amount: 550
      };
      const outPath = await ReceiptGenerator.generate(sampleOrder);
      if (!outPath) {
        return res.status(500).json({ error: 'Receipt generation failed' });
      }
      const fileBuffer = fs.readFileSync(outPath);
      const base64Image = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;
      res.json({ success: true, imageBase64: base64Image });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/generate-test-pricecard', verifyAdminToken, async (req, res) => {
    try {
      const plans = await payflex.getAvailablePlans();
      if (!plans || plans.length === 0) {
        return res.status(500).json({ error: 'No plans available for price card generation' });
      }

      const generatedPaths = await PriceCardGenerator.generateWeeklyCards(plans);
      if (!generatedPaths || generatedPaths.length === 0) {
        return res.status(500).json({ error: 'Price card generation failed' });
      }

      const images = generatedPaths.map((filePath) => {
        const ext = filePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
        const buffer = fs.readFileSync(filePath);
        return `data:image/${ext};base64,${buffer.toString('base64')}`;
      });
      res.json({ success: true, images });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/status-captions', verifyAdminToken, async (req, res) => {
    try {
      const captions = await CaptionService.getStatusCaptions();
      res.json({ success: true, captions });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/status-captions', verifyAdminToken, async (req, res) => {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Invalid caption payload' });
      }

      const success = await CaptionService.updateStatusCaptions(payload);
      if (!success) {
        return res.status(500).json({ error: 'Could not persist captions' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/hub-account', verifyAdminToken, async (req, res) => {
    try {
      res.json({
        success: true,
        account: CENTRAL_HUB_ACCOUNT,
        mode: config.mockMode ? 'MOCK' : 'LIVE'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/scale-advisor', verifyAdminToken, async (req, res) => {
    try {
      const metrics = await adminService.getScaleAdvisorMetrics();
      res.json({ success: true, ...metrics });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/cds-proposals', verifyAdminToken, async (req, res) => {
    try {
      const proposals = await adminService.listCdsProposals();
      res.json({ success: true, proposals });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/cds-proposals/:id/decision', verifyAdminToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { decision, approvedAmount, reviewNotes } = req.body;
      const result = await adminService.decideCdsProposal(id, decision, approvedAmount, reviewNotes);
      res.json({ success: true, proposal: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/trigger-network-recovery', verifyAdminToken, async (req, res) => {
    try {
      const { network } = req.body;
      const result = await networkRecoveryNotifier.scanAndNotify(network || 'MTN');
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- BROADCAST ADMIN ROUTES ---
  app.get('/api/admin/broadcasts/partners', verifyAdminToken, async (req, res) => {
    try {
      const tier = req.query.tier || 'ALL';
      const partners = await adminService.getPartnersByTier(tier);
      res.json({ success: true, partners });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/broadcasts/history', verifyAdminToken, async (req, res) => {
    try {
      const history = await adminService.getBroadcastHistory();
      res.json({ success: true, history });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/broadcasts/queue', verifyAdminToken, async (req, res) => {
    try {
      const { messageTemplate, targetTier, targetPhone } = req.body;
      if (!messageTemplate || !messageTemplate.trim()) {
        return res.status(400).json({ error: 'Message template is required' });
      }

      let recipients = [];
      let targetPartners = [];

      if (targetPhone && targetPhone.trim()) {
        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
        const partnerJid = cleanPhone.startsWith('0') ? `234${cleanPhone.substring(1)}@s.whatsapp.net` : (cleanPhone.startsWith('234') ? `${cleanPhone}@s.whatsapp.net` : `234${cleanPhone}@s.whatsapp.net`);
        recipients = [partnerJid];
        targetPartners = [{ id: partnerJid, name: 'Target Partner', phone: cleanPhone }];
      } else {
        const tier = targetTier || 'ALL';
        targetPartners = await adminService.getPartnersByTier(tier);
        recipients = targetPartners.map(p => {
          const ph = (p.phone || p.id).replace(/[^0-9]/g, '');
          return ph.startsWith('0') ? `234${ph.substring(1)}@s.whatsapp.net` : (ph.startsWith('234') ? `${ph}@s.whatsapp.net` : `234${ph}@s.whatsapp.net`);
        });
      }

      if (recipients.length === 0) {
        return res.status(400).json({ error: 'No recipients found for the selected audience' });
      }

      await broadcastQueue.queueBroadcast('ADMIN', messageTemplate, recipients);

      res.json({
        success: true,
        queued: true,
        recipientCount: recipients.length,
        targetPartnersCount: targetPartners.length
      });
    } catch (error) {
      logger.error('Error queuing broadcast:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Memory cache for duplicate transaction prevention (bounded to 10,000 entries)
  const processedTxnRefs = new Set();

  // Squad Webhook (rate-limited: 30 req/min per IP)
  app.post('/webhook/squad', webhookLimiter, async (req, res) => {
    const signature = req.headers['x-squad-signature'];
    const payload = req.body || {};

    if (!squad.verifyWebhook(payload, signature)) {
      logger.warn('Invalid signature received for Squad Webhook');
      return res.status(400).send('Invalid signature');
    }

    // ── 1. Payload Normalization (Standard Checkout vs Squad Virtual Account Webhook) ──
    const rawTxnRef = payload.TransactionRef || payload.transaction_reference || payload.Body?.transaction_reference;
    const TransactionRef = rawTxnRef ? String(rawTxnRef).trim() : null;

    // Detect event: Standard checkout provides payload.Event; Virtual Account credits send channel: 'virtual-account' or virtual_account_number
    const isVirtualAccountCredit = payload.channel === 'virtual-account' || !!payload.virtual_account_number || !!payload.Body?.virtual_account_number;
    const Event = payload.Event || (isVirtualAccountCredit ? 'charge_successful' : null);

    // Extract amount: handle principal_amount ("59000.00"), Body.amount, or payload.amount
    const rawAmount = payload.Body?.amount ?? payload.principal_amount ?? payload.amount;
    const parsedAmount = rawAmount !== undefined && rawAmount !== null ? Number(rawAmount) : 0;

    // Normalize Body fields
    const Body = {
      ...(payload.Body || {}),
      amount: parsedAmount,
      virtual_account_number: payload.Body?.virtual_account_number || payload.virtual_account_number || payload.account_number,
      account_number: payload.Body?.account_number || payload.virtual_account_number || payload.account_number,
      customer_identifier: payload.Body?.customer_identifier || payload.customer_identifier,
      transaction_reference: TransactionRef,
      sender_name: payload.Body?.sender_name || payload.sender_name,
      transaction_date: payload.Body?.transaction_date || payload.transaction_date
    };

    // ── 2. Duplicate Transaction Checker (Idempotency) ──
    if (TransactionRef) {
      if (processedTxnRefs.has(TransactionRef)) {
        logger.warn(`[DUPLICATE-CHECKER] Memory suppression: transaction ${TransactionRef} already processed.`);
        return res.status(200).json({ status: 'success', message: 'Duplicate transaction ignored (idempotent)' });
      }

      if (db.processedTransactions) {
        try {
          const docSnap = await db.processedTransactions.doc(TransactionRef).get();
          if (docSnap.exists) {
            processedTxnRefs.add(TransactionRef);
            logger.warn(`[DUPLICATE-CHECKER] Database suppression: transaction ${TransactionRef} already processed.`);
            return res.status(200).json({ status: 'success', message: 'Duplicate transaction ignored (idempotent)' });
          }
        } catch (dbErr) {
          logger.warn(`[DUPLICATE-CHECKER] DB lookup error: ${dbErr.message}`);
        }
      }

      // Mark transaction reference in memory and persist in DB
      processedTxnRefs.add(TransactionRef);
      if (processedTxnRefs.size > 10000) {
        const first = processedTxnRefs.values().next().value;
        processedTxnRefs.delete(first);
      }
      if (db.processedTransactions) {
        db.processedTransactions.doc(TransactionRef).set({
          processedAt: new Date().toISOString(),
          amount: Body.amount,
          virtualAccountNumber: Body.virtual_account_number || null,
          channel: payload.channel || 'virtual-account',
          event: Event,
          rawPayload: payload
        }).catch(err => logger.warn(`Failed to persist processed transaction ${TransactionRef}:`, err.message));
      }
    }

    if (Event === 'charge_successful') {
      logger.info(`Received successful payment: ${TransactionRef} (Amount: ₦${Body.amount})`);

      try {
        // ── 0. Check for Matching Manual Order (Manual Storefront Mode) ──
        const virtualAccountNo = Body.virtual_account_number || Body.account_number;
        let matchedPartner = null;
        let matchedPartnerId = null;

        if (virtualAccountNo && db.users) {
          try {
            const userSnap = await db.users.where('virtualAccount.accountNumber', '==', virtualAccountNo).limit(1).get();
            if (!userSnap.empty) {
              matchedPartner = userSnap.docs[0].data();
              matchedPartnerId = userSnap.docs[0].id;
            }
          } catch (uErr) {
            logger.warn('Could not query user by virtual account:', uErr.message);
          }
        }

        let manualOrder = null;
        let manualOrderDocRef = null;

        if (matchedPartnerId && db.users) {
          try {
            const mOrderSnap = await db.users.doc(matchedPartnerId).collection('manualOrders')
              .where('status', '==', 'PENDING_PAYMENT')
              .where('amount', '==', Body.amount)
              .get();
            if (!mOrderSnap.empty) {
              const now = new Date();
              const validDoc = mOrderSnap.docs.find(d => {
                const data = d.data();
                return !data.expiresAt || new Date(data.expiresAt) > now;
              });
              if (validDoc) {
                manualOrder = validDoc.data();
                manualOrderDocRef = validDoc.ref;
              }
            }
          } catch (mErr) {
            logger.warn('Could not query partner manual orders:', mErr.message);
          }
        }

        if (!manualOrder && mockManualOrders) {
          const now = new Date();
          for (const [id, o] of mockManualOrders.entries()) {
            if (o.status === 'PENDING_PAYMENT' && o.amount === Body.amount) {
              if (!o.expiresAt || new Date(o.expiresAt) > now) {
                manualOrder = o;
                matchedPartnerId = o.partnerId;
                break;
              }
            }
          }
        }

        if (!manualOrder && db.users) {
          try {
            const anyOrderSnap = await db.collectionGroup('manualOrders')
              .where('status', '==', 'PENDING_PAYMENT')
              .where('amount', '==', Body.amount)
              .limit(1)
              .get();
            if (!anyOrderSnap.empty) {
              const validDoc = anyOrderSnap.docs[0];
              manualOrder = validDoc.data();
              manualOrderDocRef = validDoc.ref;
              matchedPartnerId = manualOrder.partnerId;
            }
          } catch (cgErr) {
            logger.warn('Could not query collectionGroup manualOrders:', cgErr.message);
          }
        }

        if (manualOrder) {
          logger.info(`Fulfilling Manual Order ${manualOrder.orderId} for partner ${matchedPartnerId}`);

          if (manualOrderDocRef) {
            await manualOrderDocRef.update({
              status: 'DISPENSING',
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }
          manualOrder.status = 'DISPENSING';

          try {
            await payflex.dispenseData(manualOrder.targetPhone, manualOrder.planSerial);

            const netProfit = +(manualOrder.amount - manualOrder.baseCost).toFixed(2);
            const userTier = matchedPartner?.donationTier || 'MEMBER';
            const settlement = wallet.calculateSettlement(netProfit, userTier);

            if (manualOrderDocRef) {
              await manualOrderDocRef.update({
                status: 'FULFILLED',
                fulfilledAt: new Date().toISOString(),
                settlement
              }).catch(() => {});
            }
            manualOrder.status = 'FULFILLED';
            if (mockManualOrders) mockManualOrders.set(manualOrder.orderId, manualOrder);

            if (db.ledger) {
              await db.ledger.add({
                type: 'COMPLETED_DATA',
                userId: matchedPartnerId,
                buyerPhone: manualOrder.targetPhone,
                orderId: manualOrder.orderId,
                amount: manualOrder.amount,
                settlement,
                status: 'COMPLETED',
                source: 'MANUAL_ORDER',
                squadTransactionRef: TransactionRef,
                createdAt: new Date().toISOString()
              }).catch(() => {});
            }

            if (db.users && matchedPartnerId && settlement.cdsShare > 0) {
              let prevCds = Number(matchedPartner?.totalCdsDonated) || 0;
              const newCds = +(prevCds + settlement.cdsShare).toFixed(2);
              await db.users.doc(matchedPartnerId).set({
                totalCdsDonated: admin.firestore.FieldValue.increment(settlement.cdsShare)
              }, { merge: true }).catch(() => {});
              handleMilestoneCheck(matchedPartnerId, prevCds, newCds, matchedPartner).catch(() => {});
            }

            if (sessionManager.motherSock) {
              const partnerJid = matchedPartnerId.includes('@') ? matchedPartnerId : `${matchedPartnerId}@s.whatsapp.net`;

              const confirmMsg = `✅ *ORDER ${manualOrder.orderId} FULFILLED!*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 *Customer:* ${manualOrder.targetPhone}\n` +
                `📦 *Plan:* ${manualOrder.planName}\n` +
                `💰 *Amount:* ₦${manualOrder.amount.toLocaleString()}\n` +
                `💵 *Your Earnings:* ₦${settlement.coMemberShare.toFixed(2)}\n` +
                `🎖️ *CDS Contribution:* ₦${settlement.cdsShare.toFixed(2)}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━`;

              const deliveryTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              const receiptMsg = `👇 *Forward this receipt to your customer:*\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `✅ *DATA DELIVERED!*\n\n` +
                `📱 *Number:* ${manualOrder.targetPhone}\n` +
                `📦 *Plan:* ${manualOrder.planName}\n` +
                `🕐 *Delivered:* ${deliveryTime}\n` +
                `🔖 *Ref:* ${manualOrder.orderId}\n\n` +
                `Powered by Clarion A.I. ⚡\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━`;

              await sessionManager.motherSock.sendMessage(partnerJid, { text: confirmMsg }).catch(() => {});
              await sessionManager.motherSock.sendMessage(partnerJid, { text: receiptMsg }).catch(() => {});
            }

            if (db.users && manualOrder.targetPhone) {
              try {
                const cleanCustomer = manualOrder.targetPhone.includes('@') ? manualOrder.targetPhone : `${manualOrder.targetPhone}@s.whatsapp.net`;
                await db.users.doc(matchedPartnerId).collection('contacts').doc(cleanCustomer).set({
                  totalSpent: admin.firestore.FieldValue.increment(manualOrder.amount),
                  totalOrders: admin.firestore.FieldValue.increment(1)
                }, { merge: true });
              } catch (e) {}
            }

            return res.status(200).json({ status: 'success', message: 'Manual order fulfilled' });
          } catch (dispenseErr) {
            logger.error(`Manual order ${manualOrder.orderId} dispense failed:`, dispenseErr.message);
            if (manualOrderDocRef) {
              await manualOrderDocRef.update({
                status: 'FAILED_DISPENSE',
                lastError: dispenseErr.message,
                updatedAt: new Date().toISOString()
              }).catch(() => {});
            }
            return res.status(500).json({ error: 'Manual order dispense failed', details: dispenseErr.message });
          }
        }

        let ledgerSnapshot = await db.ledger
          .where('status', '==', 'AWAITING_PAYMENT')
          .where('amount', '==', Body.amount)
          .limit(1)
          .get();

        if (ledgerSnapshot.empty) {
          ledgerSnapshot = await db.ledger
            .where('type', '==', 'PENDING_DATA')
            .where('amount', '==', Body.amount)
            .limit(1)
            .get();
        }

        if (!ledgerSnapshot.empty) {
          const order = ledgerSnapshot.docs[0].data();
          const orderId = ledgerSnapshot.docs[0].id;
          const destinationJid = order.buyerPhone.includes('@') ? order.buyerPhone : `${order.buyerPhone}@s.whatsapp.net`;

          // 1. Move to DISPENSING to prevent double-processing and confirm receipt
          await db.ledger.doc(orderId).update({
            status: 'DISPENSING',
            updatedAt: new Date().toISOString()
          });

          if (sessionManager.motherSock) {
            await sessionManager.motherSock.sendMessage(destinationJid, {
              text: `⏳ *Payment Received!*\n\nYour payment of *₦${order.amount.toLocaleString()}* has been confirmed. Fulfilling your order now.\n\n_If there is a slight network delay, please be patient._`
            }).catch(() => { });
          }

          try {
            // 2. Attempt Delivery according to product type
            let fulfillmentResult;
            if (order.type === 'PENDING_AIRTIME' || order.orderType === 'airtime') {
              const target = order.targetPhone || order.buyerPhone.split('@')[0];
              fulfillmentResult = await payflex.purchaseAirtime(order.network, target, order.amount);
              if (sessionManager.motherSock) {
                await sessionManager.motherSock.sendMessage(destinationJid, {
                  text: `✅ *Airtime Vended Successfully!*\n\n📱 *Recipient:* ${target}\n🌐 *Network:* ${(order.network || '').toUpperCase()}\n💰 *Amount:* ₦${order.amount.toLocaleString()}\n\nThank you for using Clarion A.I!`
                }).catch(() => {});
              }
            } else if (order.type === 'PENDING_EXAM_PIN' || order.orderType === 'exam_pin') {
              fulfillmentResult = await payflex.purchaseExamPin(order.examType);
              if (sessionManager.motherSock) {
                await sessionManager.motherSock.sendMessage(destinationJid, {
                  text: `🎓 *${fulfillmentResult.productName || 'Exam PIN'} Delivered!*\n\n🔑 *PIN:* \`${fulfillmentResult.pin}\`\n🔢 *Serial:* \`${fulfillmentResult.serialNumber}\`\n💰 *Amount:* ₦${order.amount.toLocaleString()}\n\nThank you for using Clarion A.I!`
                }).catch(() => {});
              }
            } else {
              // Data delivery
              fulfillmentResult = await payflex.dispenseData(order.buyerPhone.split('@')[0], order.planId || order.serial);
            }

            // 3. COMPLETE
            const netProfit = order.markup ?? +(Body.amount - (order.baseCost || Body.amount * 0.9)).toFixed(2);
            let userTier = order.donationTier;
            if (order.userId === 'HUB') {
              userTier = 'HUB';
            } else if (!userTier && db.users && order.userId) {
              try {
                const userDoc = await db.users.doc(order.userId).get();
                if (userDoc.exists) userTier = userDoc.data().donationTier;
              } catch (e) {}
            }
            const settlement = wallet.calculateSettlement(netProfit, userTier || 'MEMBER');

            await db.ledger.doc(orderId).update({
              status: 'COMPLETED',
              settlement,
              squadTransactionRef: TransactionRef,
              updatedAt: new Date().toISOString()
            });

            // Atomically increment CDS pool on user doc
            if (db.users && order.userId && order.userId !== 'HUB' && settlement.cdsShare > 0) {
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
              handleMilestoneCheck(order.userId, prevCds, newCds, userData).catch(() => {});
            }

            // Attempt to generate and send a receipt image to the buyer
            try {
              const receiptPath = await ReceiptGenerator.generate(order);
              if (receiptPath && sessionManager.motherSock) {
                await sessionManager.motherSock.sendMessage(destinationJid, {
                  image: fs.readFileSync(receiptPath),
                  caption: '📄 Your Clarion payment receipt is ready. Thank you for your purchase!'
                });
              }
            } catch (sendErr) {
              logger.warn(`Receipt send failed for order ${orderId}: ${sendErr.message}`);
            }

            // Add atomic increment for contacts collection
            if (db.users && order.buyerPhone) {
              try {
                const cleanCustomer = order.buyerPhone.includes('@') ? order.buyerPhone : `${order.buyerPhone}@s.whatsapp.net`;
                await db.users.doc(order.userId).collection('contacts').doc(cleanCustomer).set({
                  totalSpent: admin.firestore.FieldValue.increment(order.amount),
                  totalOrders: admin.firestore.FieldValue.increment(1)
                }, { merge: true });
              } catch (e) {
                logger.warn(`Failed to increment contact ${order.buyerPhone} stats: ${e.message}`);
              }
            }
            logger.info(`Order ${orderId} vended and settled successfully.`);

          } catch (dispenseError) {
            // 4. FAILED DISPENSE (Will be picked up by RetryQueue)
            logger.error(`Dispense failed for order ${orderId}: ${dispenseError.message}`);
            await db.ledger.doc(orderId).update({
              status: 'FAILED_DISPENSE',
              retryCount: 0,
              lastError: dispenseError.message,
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          // Direct wallet funding / Promo Fuel deposit
          logger.info(`Direct wallet funding / Promo Fuel detected for ₦${Body.amount}`);
          const virtualAccountNo = Body.virtual_account_number || Body.account_number;
          let matchedUser = null;
          let matchedUserId = null;

          if (virtualAccountNo && db.users) {
            try {
              const userSnap = await db.users.where('virtualAccount.accountNumber', '==', virtualAccountNo).limit(1).get();
              if (!userSnap.empty) {
                matchedUser = userSnap.docs[0].data();
                matchedUserId = userSnap.docs[0].id;
              }
            } catch (uErr) {
              logger.warn('Could not query user by virtual account:', uErr.message);
            }
          }

          if (matchedUserId) {
            const fundingRef = `PROMO_FUEL_${Date.now()}`;
            if (db.ledger) {
              await db.ledger.doc(fundingRef).set({
                type: 'WALLET_DEPOSIT',
                userId: matchedUserId,
                amount: Body.amount,
                squadTransactionRef: TransactionRef,
                settlement: {
                  coMemberShare: Body.amount,
                  systemShare: 0,
                  cdsShare: 0
                },
                status: 'COMPLETED',
                createdAt: new Date().toISOString()
              });
            }

            const partnerPhone = (matchedUser.phoneNumber || matchedUserId.split('@')[0]).replace(/[^0-9]/g, '');
            const isSame = checkIsSameNumber(matchedUserId, partnerPhone);
            const userJid = matchedUserId.includes('@') ? matchedUserId : `${matchedUserId}@s.whatsapp.net`;

            if (sessionManager.motherSock) {
              await sessionManager.motherSock.sendMessage(userJid, {
                text: `💰 *PROMO FUEL LOADED!* 🚀\n\n` +
                  `Your wallet has been credited with *₦${Body.amount.toLocaleString()}*.\n\n` +
                  `🎨 Generating your custom *Launch Giveaway Poster* now...`
              }).catch(() => {});

              try {
                const promoBuffer = await mediaGen.generateGiveawayPromoCard({
                  ...matchedUser,
                  phone: partnerPhone,
                  isSameNumber: isSame
                }, Body.amount);

                const giveawayStatusText = isSame
                  ? `🎉 *MY 24/7 DATA BOT IS OFFICIALLY LIVE!* 🚀\n\n` +
                    `To celebrate my launch, I’m giving away FREE 500MB Data to the first 5 people who test my automated bot right now!\n\n` +
                    `👉 *To claim: Just reply to ME right here with:* \n*DATA*\n\n` +
                    `Watch the bot reply and vend your data in 20 seconds! ⚡`
                  : `🎉 *MY 24/7 DATA BOT IS OFFICIALLY LIVE!* 🚀\n\n` +
                    `To celebrate my launch, I’m giving away FREE 500MB Data to the first 5 people who test my automated bot right now!\n\n` +
                    `👉 *To claim: Tap this link to message my bot:*\nhttps://wa.me/234${partnerPhone.slice(-10)}?text=DATA\n\n` +
                    `Or text *DATA* to 0${partnerPhone.slice(-10)}! ⚡`;

                await sessionManager.motherSock.sendMessage(userJid, {
                  image: promoBuffer,
                  caption: `🎁 *YOUR EXCLUSIVE LAUNCH GIVEAWAY POSTER IS READY!* 🎨\n\n` +
                    `📋 *Copy the text below and post it on your WhatsApp Status with this image:*`
                });

                await sessionManager.motherSock.sendMessage(userJid, { text: giveawayStatusText });
              } catch (posterErr) {
                logger.error('Failed to generate giveaway poster on wallet funding:', posterErr.message);
              }
            }
          }
        }
      } catch (error) {
        logger.error('Webhook processing failed:', error);
      }
    } else if (Event === 'transfer_successful') {
      logger.info(`Received successful disbursement: ${TransactionRef}`);
      try {
        await wallet.updateWithdrawalStatus(TransactionRef, 'SUCCESS');
      } catch (err) {
        logger.error('Error handling successful disbursement webhook', err);
      }
    } else if (Event === 'transfer_failed' || Event === 'transfer_reversed') {
      logger.info(`Received failed/reversed disbursement: ${TransactionRef}`);
      try {
        await wallet.updateWithdrawalStatus(TransactionRef, 'FAILED');
      } catch (err) {
        logger.error('Error handling failed disbursement webhook', err);
      }
    }
    res.sendStatus(200);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Boot logic
  try {
    await payflex.getAvailablePlans();

    if (config.mockMode) {
      try {
        if (db.ledger) {
          const ledgerCheck = await db.ledger.limit(1).get();
          if (ledgerCheck.empty) {
            logger.info('MOCK: Seeding initial ledger data...');
            await db.ledger.add({
              type: 'COMPLETED_DATA',
              userId: 'mock_user_1',
              buyerPhone: '2348000000000@s.whatsapp.net',
              planId: '1',
              amount: 290,          // 270 wholesale + 20 tiered markup
              markup: 20,
              baseCost: 270,
              status: 'COMPLETED',
              settlement: { coMemberShare: 10, systemShare: 6, cdsShare: 4, totalProfit: 20 },
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (ledgerError) {
        logger.warn('MOCK: Could not seed ledger (this is OK in mock mode):', ledgerError.message);
      }
    }

    app.listen(config.port, "0.0.0.0", () => {
      logger.info(`Server running on http://localhost:${config.port}`);

      // Initialize Bots in the background so they don't block the preview
      (async () => {
        try {
          await sessionManager.initMotherBot();
          startWeeklyReportJob();
          startStatusPostJob();
          broadcastQueue.start();

          // Wire up RetryQueue customer notification callback to Proxy Workers
          retryQueue.onOrderUpdate = async (event) => {
            const { type, order, message } = event;
            const targetJid = order.buyerPhone.includes('@') ? order.buyerPhone : `${order.buyerPhone}@s.whatsapp.net`;

            // Try pushing via ProxyWorker if alive, else fallback to MotherBot
            const worker = Array.from(sessionManager.sessions.values())
              .find(w => w.workerData?.user?.uid === order.userId);

            if (worker) {
              if (type === 'OWNER_ALERT') {
                worker.postMessage({ type: 'notify_owner', message });
              } else {
                worker.postMessage({ type: 'notify_customer', targetJid, message });
              }
            } else if (sessionManager.motherSock) {
              // Fallback: send directly through Hub
              await sessionManager.motherSock.sendMessage(
                type === 'OWNER_ALERT' ? order.userId : targetJid,
                { text: message }
              ).catch(() => { });
            }
          };
          retryQueue.start();

        } catch (botError) {
          logger.error({ err: botError }, 'Background Bot Initialization failed');
        }
      })();
    });
  } catch (error) {
    logger.error('Boot process failed:', error);
  }
}

startServer();
