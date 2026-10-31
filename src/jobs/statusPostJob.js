import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import payflex from '../services/payflex.js';
import PriceCardGenerator from '../services/PriceCardGenerator.js';
import CaptionService from '../services/CaptionService.js';
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

const sendStatusToWorkers = async (imageItems) => {
  const items = Array.isArray(imageItems) ? imageItems : [];
  if (items.length === 0) {
    logger.warn('No status images available to send.');
    return;
  }

  if (!sessionManager.sessions || sessionManager.sessions.size === 0) {
    logger.warn('No active ProxyBot sessions available to post status.');
    return;
  }

  for (const worker of sessionManager.sessions.values()) {
    if (!worker || typeof worker.postMessage !== 'function') continue;
    try {
      worker.postMessage({ type: 'status', imageItems: items });
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

  const captions = await CaptionService.getStatusCaptions();
  const items = priceCards.map((filePath) => {
    const baseName = path.basename(filePath).toLowerCase();
    let network = 'mtn';
    if (baseName.includes('airtel')) network = 'airtel';
    if (baseName.includes('glo')) network = 'glo';
    if (baseName.includes('9mobile')) network = '9mobile';

    return {
      imagePath: filePath,
      caption: captions[network] || 'Fast • Reliable • Affordable'
    };
  });

  await sendStatusToWorkers(items);
};

const sendReceiptStatus = async () => {
  const receipts = getFiles(RECEIPTS_DIR, '.jpg');
  if (receipts.length === 0) {
    logger.info('No fresh receipts to post as status.');
    return;
  }

  const captions = await CaptionService.getStatusCaptions();
  const receiptCaption = captions.receipt || 'Trusted proxybot social proof.';
  const items = receipts.map((receiptPath) => ({ imagePath: receiptPath, caption: receiptCaption }));

  await sendStatusToWorkers(items);

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

// 3x Daily Schedule Matrix (7 Days x 3 Slots) with Sprinkles Collection Rotated into Afternoon Slots
const STATUS_SCHEDULE = {
  // 0: Sunday
  0: {
    morning: "✨ Happy Sunday! 🙏\n\nStay connected with loved ones and stream your favorite services with MTN & Glo data from ₦400/GB!\n\n👉 Reply *DATA* to order in seconds",
    afternoon: "💚 Smart data that gives back 🇳🇬\n\nEvery purchase on this line funds grassroots community projects. Fast, reliable MTN & Glo from ₦400 per GIG.\n\n👉 Reply *DATA* to support & recharge",
    evening: "🔋 Prepare for Monday with a loaded line! 🚀\n\nDon't start the new week with 0MB. Instant MTN & Glo data delivered automatically from just ₦400/GB!\n\n👉 Reply *DATA 500* or *DATA 1000* to recharge now"
  },
  // 1: Monday
  1: {
    morning: "⚡ New week, fresh gigabytes! 🚀\n\nDon't let your work or calls pause. Instant MTN & Glo data delivered in seconds — starting from just ₦400/GB!\n\n👉 Reply *DATA* to browse all plans",
    afternoon: "📱 Data exhausted during morning hustle? ⏳\n\nNo need to open bank apps or wait around. Fast automated top-up right here on WhatsApp!\n\n👉 Reply *DATA 500* or *DATA 1000* for instant refill!",
    evening: "🌙 Unwind without buffering tonight! 🎬\n\nAffordable MTN & Glo data for your TikTok, YouTube & WhatsApp calls. From just ₦400 per GIG!\n\n👉 Reply *DATA* to get yours in 15 seconds"
  },
  // 2: Tuesday (Afternoon has Sprinkles C: Commands Cheat Sheet)
  2: {
    morning: "⚡ Fast, reliable MTN & Glo data ready 24/7! 📶\n\nAutomated AI vending means you receive your data in seconds, day or night. Starting at just ₦400/GB.\n\n👉 Reply *DATA* to test our instant delivery!",
    afternoon: "🤖 Quick Guide: How to use this 24/7 AI Storefront 🔑\n\nText any of these keywords in this chat anytime:\n\n• *DATA* — View all MTN & Glo plans (from ₦400/GB)\n• *DATA 500* — View plans closest to ₦500 budget\n• *FUND* — Load your Clarion Wallet for 1-click orders\n• *CANCEL* — Abort an ongoing order\n• *INFO* — See how purchases fund NYSC community projects\n\nTry it now — just reply *DATA* to test! ⚡",
    evening: "💰 Stop overpaying for data! 📉\n\nGet verified 30-day MTN & Glo data packages starting at just ₦400 per GIG.\n\n👉 Reply *DATA 500* or *DATA 1000* to see what your budget gets you!"
  },
  // 3: Wednesday (Afternoon has Sprinkles A: Gift Data in 2 Ways)
  3: {
    morning: "⚡ Midweek data check! 🔋\n\nAre your gigabytes running low? Top up your MTN or Glo line automatically — starting at just ₦400 per GIG!\n\n👉 Reply *DATA* to view all packages",
    afternoon: "🎁 Surprise someone with data today! ⚡\n\nYou can easily send MTN & Glo data to friends, parents, or your MiFi in 2 easy ways:\n\n1️⃣ *By Command:* Reply with budget & number\n👉 *DATA 500 080XXXXXXXX* or *BUY 1 080XXXXXXXX*\n\n2️⃣ *By Contact Card:* Simply share the person's contact in this chat! 📲\n\nThe AI bot automatically detects the network and delivers the data in 15 seconds! 🚀",
    evening: "🌙 Heavy browsing tonight? 🍿\n\nEnjoy affordable MTN & Glo monthly bundles from ₦400/GB. Stream, game & chat freely!\n\n👉 Reply *DATA* to grab yours right now"
  },
  // 4: Thursday (Afternoon has Sprinkles E: CDS Community Development Transparency)
  4: {
    morning: "🔋 CDS Thursday Special! 🇳🇬\n\nMassive discounts on MTN & Glo data for everyone today — starting at just ₦400 per GIG!\n\n👉 Reply *DATA* to view today's CDS rates!",
    afternoon: "🇳🇬 Empowering Communities, One Gigabyte at a Time 🏫\n\nWhenever you purchase data here:\n• You get verified, low-cost MTN & Glo data instantly\n• A portion of the proceeds is donated to grassroots NYSC CDS projects (schools, health, & youth skills)\n\n👉 Reply *INFO* to learn more, or reply *DATA* to support today! 💚",
    evening: "⚡ Wrap up your Thursday with full connectivity! 📲\n\nAffordable MTN & Glo data that doesn't burn your pocket. Instant delivery from ₦400 per GIG.\n\n👉 Reply *DATA* to reload in seconds"
  },
  // 5: Friday (Afternoon has Sprinkles D: 1-Click Wallet Loading)
  5: {
    morning: "🎉 Happy Friday! 🥳\n\nGet your weekend data locked in early. Affordable MTN & Glo bundles delivered instantly from just ₦400/GB!\n\n👉 Reply *DATA* to see our rates",
    afternoon: "💡 Smart Tip: Skip opening your banking app every time! 🏦\n\nLoad your Clarion Wallet once and enjoy 1-click instant vending 24/7:\n\n👉 Reply *FUND 1000* or *FUND 2000* to top up\n👉 Any order you place vends automatically in 1 second! ⚡\n\n_Fast • Seamless • Always Reliable._",
    evening: "🍿 Movie night or social weekend? 🎬\n\nStream seamlessly on MTN & Glo with high-speed data starting at only ₦400 per GIG!\n\n👉 Reply *DATA* to connect right now"
  },
  // 6: Saturday (Afternoon has Sprinkles B: Data for MiFi / Router / 2nd SIM)
  6: {
    morning: "⚡ Saturday morning data deals! ☕\n\nAffordable MTN & Glo data packages active 24/7 — starting from ₦400 per GIG!\n\n👉 Reply *DATA* to browse and order in seconds",
    afternoon: "📶 Need data on your WiFi router, MiFi, or 2nd phone? 🔌\n\nYou don't need to remove SIM cards or open other apps.\n\n👉 Simply reply:\n*DATA [budget] [router number]*\n_(e.g. DATA 1000 08051234567)_\n\nInstant delivery straight to your device 24/7! ⚡",
    evening: "🌙 Weekend night data made cheap! ⚡\n\nStay connected all night with heavily discounted MTN & Glo bundles from ₦400 per GIG.\n\n👉 Reply *DATA* to get yours delivered instantly"
  }
};

/**
 * Resolves effective status post frequency (1, 2, or 3).
 * Child/referral proxies automatically inherit their parent store's frequency setting.
 */
export const getEffectiveStatusFrequency = async (user) => {
  if (!user) return 3;
  if (user.parentId) {
    try {
      const parentDoc = await sessionManager.getUser(user.parentId);
      if (parentDoc && parentDoc.statusFrequency) {
        return Math.max(1, Math.min(3, parseInt(parentDoc.statusFrequency)));
      }
    } catch (e) {}
  }
  return Math.max(1, Math.min(3, parseInt(user.statusFrequency || 3)));
};

/**
 * Dispatches a scheduled status slot ('morning', 'afternoon', or 'evening')
 * respecting Day 0 exclusivity, active promos, and parent/squad frequency limits.
 */
export const sendScheduledSlotStatus = async (slotKey = 'morning') => {
  if (!sessionManager.sessions || sessionManager.sessions.size === 0) return;

  const dayOfWeek = new Date().getDay(); // 0 (Sun) - 6 (Sat)
  const todaySlots = STATUS_SCHEDULE[dayOfWeek];
  const statusText = todaySlots ? todaySlots[slotKey] : null;

  if (!statusText) {
    logger.warn(`No status text defined for slot: ${slotKey} on day: ${dayOfWeek}`);
    return;
  }

  // Minimum frequency required for this slot to run
  // Slot 1 (morning): frequency >= 1
  // Slot 3 (evening): frequency >= 2
  // Slot 2 (afternoon): frequency >= 3
  const requiredFreq = slotKey === 'morning' ? 1 : slotKey === 'evening' ? 2 : 3;

  for (const [uid, worker] of sessionManager.sessions.entries()) {
    if (!worker || typeof worker.postMessage !== 'function') continue;
    try {
      const userDoc = await sessionManager.getUser(uid);

      // 1. Skip if user has an active promo running
      if (userDoc?.activePromo?.status === 'ACTIVE' && userDoc?.activePromo?.claimsRemaining > 0) {
        continue;
      }

      // 2. Skip on Day 0: launch status remains exclusive for the first 24 hours
      if (userDoc?.pairedAt && new Date(userDoc.pairedAt).toDateString() === new Date().toDateString()) {
        logger.info(`[STATUS] Skipping ${slotKey} status for ${uid} — Day 0 launch status is active.`);
        continue;
      }

      // 3. Squad & Parent Frequency Gate
      const effectiveFreq = await getEffectiveStatusFrequency(userDoc);
      if (effectiveFreq < requiredFreq) {
        logger.info(`[STATUS] Skipping ${slotKey} slot for ${uid} — effective frequency is ${effectiveFreq} (requires ${requiredFreq})`);
        continue;
      }

      worker.postMessage({ type: 'text_status', text: statusText });
      logger.info(`[STATUS] Dispatched ${slotKey} (${requiredFreq}/3) data text status to ${uid}`);
    } catch (err) {
      logger.error(`Failed to send ${slotKey} status to worker for user ${uid}:`, err.message);
    }
  }
};

const sendDailyTextStatus = async () => {
  // Legacy / fallback trigger maps to morning slot
  await sendScheduledSlotStatus('morning');
};

export function startStatusPostJob() {
  ensureMediaDirs();

  // Slot 1: Morning 9:00 AM Lagos Time
  cron.schedule('0 9 * * *', async () => {
    logger.info('Posting Slot 1 (9:00 AM) data text status.');
    await sendScheduledSlotStatus('morning');
  }, { timezone: 'Africa/Lagos' });

  // Slot 2: Afternoon 1:30 PM Lagos Time (Rotates Sprinkles Collection)
  cron.schedule('30 13 * * *', async () => {
    logger.info('Posting Slot 2 (1:30 PM) Sprinkles & Midday text status.');
    await sendScheduledSlotStatus('afternoon');
  }, { timezone: 'Africa/Lagos' });

  // Slot 3: Evening 7:30 PM Lagos Time
  cron.schedule('30 19 * * *', async () => {
    logger.info('Posting Slot 3 (7:30 PM) evening data text status.');
    await sendScheduledSlotStatus('evening');
  }, { timezone: 'Africa/Lagos' });

  logger.info(`Status post CRON jobs scheduled (3x Daily: 9:00 AM, 1:30 PM, 7:30 PM Lagos Time Active).`);
}

export async function triggerManualStatusBroadcast(type = 'price_card', slot = 'morning') {
  logger.info(`Manual status broadcast triggered: ${type}`);
  if (type === 'price_card') {
    await sendPriceCardStatus();
  } else if (type === 'text') {
    await sendScheduledSlotStatus(slot);
  } else if (type === 'promo') {
    await sendPromoStatus();
  } else if (type === 'receipt') {
    await sendReceiptStatus();
  }
}

export {
  sendWeeklyPriceCards,
  sendPriceCardStatus,
  sendDailyTextStatus,
  sendReceiptStatus,
  sendPromoStatus,
  cleanupOldReceipts
};
