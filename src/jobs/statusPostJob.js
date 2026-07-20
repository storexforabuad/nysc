import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import payflex from '../services/payflex.js';
import PriceCardGenerator from '../services/PriceCardGenerator.js';
import { config, logger } from '../config/env.js';
import sessionManager from '../bot/SessionManager.js';

const MEDIA_ROOT = path.join(process.cwd(), 'src', 'media');
const PRICE_CARD_DIR = path.join(MEDIA_ROOT, 'price_cards');
const RECEIPTS_DIR = path.join(MEDIA_ROOT, 'receipts');
const RECEIPT_POSTED_DIR = path.join(RECEIPTS_DIR, 'posted');
const STATUS_LIBRARY_DIR = path.join(MEDIA_ROOT, 'status_library');

const ensureMediaDirs = () => {
  [PRICE_CARD_DIR, RECEIPTS_DIR, RECEIPT_POSTED_DIR, STATUS_LIBRARY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
};

const getFiles = (dir, ext = '.jpg') => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.toLowerCase().endsWith(ext.toLowerCase()))
    .map(file => path.join(dir, file));
};

const sendStatusToWorkers = async (imagePaths, caption) => {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    logger.warn('No status images available to send.');
    return;
  }

  if (!sessionManager.sessions || sessionManager.sessions.size === 0) {
    logger.warn('No active ProxyBot sessions available to post status.');
    return;
  }

  for (const worker of sessionManager.sessions.values()) {
    try {
      worker.postMessage({ type: 'status', imagePaths, caption });
    } catch (err) {
      logger.error('Failed to post status to worker:', err.message);
    }
  }
};

const cleanupOldReceipts = () => {
  const threshold = Date.now() - 48 * 60 * 60 * 1000;
  [RECEIPTS_DIR, RECEIPT_POSTED_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < threshold) {
          fs.unlinkSync(filePath);
          logger.info(`Cleaned up old receipt media: ${filePath}`);
        }
      } catch (err) {
        logger.warn(`Could not clean up receipt file ${file}: ${err.message}`);
      }
    });
  });
};

const sendWeeklyPriceCards = async () => {
  try {
    const plans = await payflex.getAvailablePlans();

    if (!plans || plans.length === 0) {
      logger.warn('No plans available for weekly price card generation.');
      return;
    }

    const generatedPaths = await PriceCardGenerator.generateWeeklyCards(plans);
    if (generatedPaths.length === 0) {
      logger.warn('Price card generation produced no files.');
      return;
    }

    logger.info(`Generated ${generatedPaths.length} weekly price card(s).`);
  } catch (err) {
    logger.error('Weekly price card generation failed:', err.message);
  }
};

const sendPriceCardStatus = async () => {
  const priceCards = getFiles(PRICE_CARD_DIR, '.jpg');
  if (priceCards.length === 0) {
    logger.warn('No price cards found for status posting.');
    return;
  }

  await sendStatusToWorkers(priceCards, '🚀 Latest data prices are live! Reply DATA to buy now.');
};

const sendReceiptStatus = async () => {
  const receipts = getFiles(RECEIPTS_DIR, '.jpg');
  if (receipts.length === 0) {
    logger.info('No fresh receipts to post as status.');
    return;
  }

  await sendStatusToWorkers(receipts, '📸 Live social proof — transactions processed successfully!');

  receipts.forEach((receiptPath) => {
    const fileName = path.basename(receiptPath);
    const destination = path.join(RECEIPT_POSTED_DIR, fileName);
    try {
      if (fs.existsSync(receiptPath)) {
        fs.renameSync(receiptPath, destination);
      }
    } catch (err) {
      logger.warn(`Could not move receipt to posted folder: ${err.message}`);
    }
  });
};

const sendPromoStatus = async () => {
  const promoFiles = getFiles(STATUS_LIBRARY_DIR, '.png').concat(getFiles(STATUS_LIBRARY_DIR, '.jpg'));
  if (promoFiles.length === 0) {
    logger.warn('No promotional status assets found in status_library.');
    return;
  }

  const selected = promoFiles[Math.floor(Math.random() * promoFiles.length)];
  await sendStatusToWorkers([selected], '✨ Clarion Status update — stay connected to the best data offers.');
};

export function startStatusPostJob() {
  if (config.mockMode && process.env.TEST_CRON !== 'true') {
    logger.info('Skipping status job initialization in mock mode (set TEST_CRON=true to override).');
    return;
  }

  ensureMediaDirs();

  cron.schedule('0 0 * * 0', async () => {
    logger.info('Running weekly price card generation job.');
    await sendWeeklyPriceCards();
  }, { timezone: 'Africa/Lagos' });

  cron.schedule('0 7 * * *', async () => {
    logger.info('Posting daily price card status.');
    await sendPriceCardStatus();
  }, { timezone: 'Africa/Lagos' });

  cron.schedule('30 12 * * *', async () => {
    logger.info('Posting midday receipt status.');
    await sendReceiptStatus();
  }, { timezone: 'Africa/Lagos' });

  cron.schedule('0 18 * * *', async () => {
    logger.info('Posting evening promo status.');
    await sendPromoStatus();
  }, { timezone: 'Africa/Lagos' });

  cron.schedule('0 21 * * *', async () => {
    logger.info('Posting night receipt status.');
    await sendReceiptStatus();
  }, { timezone: 'Africa/Lagos' });

  cron.schedule('0 2 * * *', async () => {
    logger.info('Running receipt cleanup job.');
    cleanupOldReceipts();
  }, { timezone: 'Africa/Lagos' });

  logger.info('Status post CRON jobs scheduled.');
}
