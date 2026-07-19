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
import adminService from './services/AdminService.js';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

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
