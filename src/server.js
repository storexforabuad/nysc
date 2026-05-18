import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { config, logger } from './config/env.js';
import monnify from './services/monnify.js';
import payflex from './services/payflex.js';
import { db } from './services/firebase.js';
import sessionManager from './bot/SessionManager.js';
import mediaGen from './services/mediaGen.js';

async function startServer() {
  const app = express();
  app.use(express.json());

  // API routes go here FIRST
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Monnify Webhook
  app.post('/monnify-webhook', async (req, res) => {
    const signature = req.headers['monnify-signature'];
    const payload = req.body;

    if (!monnify.verifyWebhook(payload, signature)) {
      logger.warn('Invalid signature received for Monnify Webhook');
      return res.status(400).send('Invalid signature');
    }

    const { eventType, eventData } = payload;

    if (eventType === 'SUCCESSFUL_TRANSACTION' && eventData.paymentStatus === 'PAID') {
      logger.info(`Received successful payment: ${eventData.transactionReference}`);
      
      try {
        const ledgerSnapshot = await db.ledger
          .where('type', '==', 'PENDING_DATA')
          .where('amount', '==', eventData.amountPaid)
          .limit(1)
          .get();

        if (!ledgerSnapshot.empty) {
          const order = ledgerSnapshot.docs[0].data();
          const orderId = ledgerSnapshot.docs[0].id;

          await payflex.dispenseData(order.buyerPhone.split('@')[0], order.planId);

          const netProfit = (eventData.amountPaid * 0.1); 
          const coMemberShare = netProfit * 0.50;
          const systemShare = netProfit * 0.30;
          const cdsShare = netProfit * 0.20;

          await db.ledger.doc(orderId).update({
            status: 'COMPLETED',
            settlement: { coMemberShare, systemShare, cdsShare, totalProfit: netProfit },
            updatedAt: new Date().toISOString()
          });

          logger.info(`Order ${orderId} vended and settled successfully.`);
        }
      } catch (error) {
        logger.error('Webhook processing failed:', error);
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
    await payflex.fetchPlans();

    if (config.mockMode) {
      const ledgerCheck = await db.ledger.limit(1).get();
      if (ledgerCheck.empty) {
        logger.info('MOCK: Seeding initial ledger data...');
        await db.ledger.add({
          type: 'COMPLETED_DATA',
          userId: 'mock_user_1',
          buyerPhone: '2348000000000@s.whatsapp.net',
          planId: '1',
          amount: 250,
          status: 'COMPLETED',
          settlement: { coMemberShare: 12.5, systemShare: 7.5, cdsShare: 5, totalProfit: 25 },
          createdAt: new Date().toISOString()
        });
      }
    }

    app.listen(config.port, "0.0.0.0", () => {
      logger.info(`Server running on http://localhost:${config.port}`);
      
      // Initialize Bots in the background so they don't block the preview
      (async () => {
        try {
          await sessionManager.initMotherBot();
          await sessionManager.initProxyBots();
        } catch (botError) {
          logger.error('Background Bot Initialization failed:', botError);
        }
      })();
    });
  } catch (error) {
    logger.error('Boot process failed:', error);
  }
}

startServer();
