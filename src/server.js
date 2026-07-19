import express from 'express';
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
import broadcastQueue from './services/BroadcastQueue.js';
import rateLimit from 'express-rate-limit';

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

  // Squad Webhook (rate-limited: 30 req/min per IP)
  app.post('/webhook/squad', webhookLimiter, async (req, res) => {
    const signature = req.headers['x-squad-signature'];
    const payload = req.body;

    if (!squad.verifyWebhook(payload, signature)) {
      logger.warn('Invalid signature received for Squad Webhook');
      return res.status(400).send('Invalid signature');
    }

    const { Event, TransactionRef, Body } = payload;

    if (Event === 'charge_successful') {
      logger.info(`Received successful payment: ${TransactionRef}`);

      try {
        const ledgerSnapshot = await db.ledger
          .where('type', '==', 'PENDING_DATA')
          .where('amount', '==', Body.amount)
          .limit(1)
          .get();

        if (!ledgerSnapshot.empty) {
          const order = ledgerSnapshot.docs[0].data();
          const orderId = ledgerSnapshot.docs[0].id;

          await payflex.dispenseData(order.buyerPhone.split('@')[0], order.planId);

          // Use tiered markup saved with the order; fallback for legacy records
          const netProfit = order.markup ?? +(Body.amount - order.baseCost).toFixed(2);
          const coMemberShare = +(netProfit * 0.50).toFixed(2); // Proxy Bot Owner
          const systemShare = +(netProfit * 0.30).toFixed(2); // Platform
          const cdsShare = +(netProfit * 0.20).toFixed(2); // CDS Group

          await db.ledger.doc(orderId).update({
            status: 'COMPLETED',
            settlement: { coMemberShare, systemShare, cdsShare, totalProfit: netProfit },
            updatedAt: new Date().toISOString()
          });

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
          broadcastQueue.start();
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
