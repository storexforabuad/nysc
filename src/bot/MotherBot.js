import { config, logger } from '../config/env.js';
import admin, { db } from '../services/firebase.js';
import squad from '../services/SquadService.js';
import payflex from '../services/payflex.js';
import sessionManager, { handleOnboardingWizardInput } from './SessionManager.js';
import wallet, { WITHDRAWAL_FEES, PARTNERSHIP_TIERS, BOT_MODES, SUBSCRIPTION_PLANS } from '../services/WalletService.js';
import reportService from '../services/ReportService.js';
import broadcastQueue from '../services/BroadcastQueue.js';
import mediaGen from '../services/mediaGen.js';
import { detectNetwork, parseNyscBatch } from '../utils/networkUtils.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import QRCode from 'qrcode';
import { mockCdsProposals } from '../services/AdminService.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const DESIGNS_DIR = path.resolve('storage/designs');
const PITCHES_DIR = path.resolve('storage/pitches');
if (!fs.existsSync(DESIGNS_DIR)) fs.mkdirSync(DESIGNS_DIR, { recursive: true });
if (!fs.existsSync(PITCHES_DIR)) fs.mkdirSync(PITCHES_DIR, { recursive: true });

export const mockPitches = new Map();
export const mockDesigns = new Map();
export const mockContributors = new Map();

// ── Inbound message rate limiter: 5 messages per 10 seconds per contact ──
const motherMessageLimiter = new RateLimiterMemory({ points: 5, duration: 10 });

const STATES = {
  START: 'START',
  AWAITING_PORTAL_STATE_CODE: 'AWAITING_PORTAL_STATE_CODE',
  AWAITING_PORTAL_STATE_CODE_CONFIRM: 'AWAITING_PORTAL_STATE_CODE_CONFIRM',
  PORTAL_MENU: 'PORTAL_MENU',
  AWAITING_EARN_CHOICE: 'AWAITING_EARN_CHOICE',
  AWAITING_PITCH_SUBMISSION: 'AWAITING_PITCH_SUBMISSION',
  AWAITING_DESIGN_SUBMISSION: 'AWAITING_DESIGN_SUBMISSION',
  AWAITING_CONTRIBUTOR_SUBMISSION: 'AWAITING_CONTRIBUTOR_SUBMISSION',
  AWAITING_ADMIN_APPROVAL: 'AWAITING_ADMIN_APPROVAL',
  AWAITING_NYSC_CODE: 'AWAITING_NYSC_CODE',
  AWAITING_TIER_SELECTION: 'AWAITING_TIER_SELECTION',
  AWAITING_INITIAL_BANK: 'AWAITING_INITIAL_BANK',
  AWAITING_INITIAL_BANK_CONFIRM: 'AWAITING_INITIAL_BANK_CONFIRM',
  AWAITING_FRANCHISE_NAME: 'AWAITING_FRANCHISE_NAME',
  AWAITING_PROXY_NUMBER: 'AWAITING_PROXY_NUMBER',
  AWAITING_QR_DELIVERY_NUMBER: 'AWAITING_QR_DELIVERY_NUMBER',
  AWAITING_QR_SCAN: 'AWAITING_QR_SCAN',
  AWAITING_DETAILS: 'AWAITING_DETAILS',
  COMPLETED: 'COMPLETED',
  AWAITING_WITHDRAW_DETAILS: 'AWAITING_WITHDRAW_DETAILS',
  AWAITING_WITHDRAW_CONFIRM: 'AWAITING_WITHDRAW_CONFIRM',
  AWAITING_UPDATE_BANK: 'AWAITING_UPDATE_BANK',
  AWAITING_UPDATE_BANK_CONFIRM: 'AWAITING_UPDATE_BANK_CONFIRM',
  AWAITING_BROADCAST_CONTACTS: 'AWAITING_BROADCAST_CONTACTS',
  AWAITING_CONTACT_ACTION: 'AWAITING_CONTACT_ACTION',
  AWAITING_DATA_PLAN_SELECT: 'AWAITING_DATA_PLAN_SELECT',
  AWAITING_PAYMENT_METHOD: 'AWAITING_PAYMENT_METHOD',
  AWAITING_MB_CARD_AMOUNT: 'AWAITING_MB_CARD_AMOUNT',
  AWAITING_CDS_PROPOSAL_DETAILS: 'AWAITING_CDS_PROPOSAL_DETAILS'
};

/**
 * Truncates a name to fit NIBSS virtual account limits (max 20 chars).
 * Strategy:
 *   1. If full name <= 20 chars -> use as-is
 *   2. If first 2 names <= 20 chars -> use first 2 names
 *   3. Otherwise -> use first name + "Store"
 */
function truncateForNIBSS(fullName) {
  if (!fullName) return 'Store';
  const clean = fullName.trim();
  if (clean.length <= 20) return clean;

  const parts = clean.split(/\s+/);
  const twoNames = parts.slice(0, 2).join(' ');
  if (twoNames.length <= 20) return twoNames;

  const firstName = parts[0];
  const withStore = firstName + ' Store';
  if (withStore.length <= 20) return withStore;

  return firstName.substring(0, 20);
}

export function getPortalMenuText(stateCode) {
  return `📡 *CLARION A.I* · NYSC Hub 🇳🇬\n` +
    `\`${stateCode || 'Active'}\` · _Verified Operator_\n` +
    `──────────────\n\n` +
    `1 · 🧠 *LEARN*\n` +
    `Camp survival, PPA guides & high-income skills\n\n` +
    `2 · 💼 *EARN*\n` +
    `24/7 digital telecom franchise, automated retail & jobs\n\n` +
    `3 · 🏗️ *BUILD*\n` +
    `Venture foundry, production & startup grants\n\n` +
    `4 · 🛍️ *MERCH*\n` +
    `Clarion Supply Co. · Corps member apparel & kits\n\n` +
    `5 · 🎪 *EVENTS*\n` +
    `Camp pop-ups, exclusive drops & community meetups\n\n` +
    `6 · 💚 *IMPACT*\n` +
    `Community development fund & corporate partners\n\n` +
    `──────────────\n` +
    `_Reply 1–6 to enter any department._`;
}

export function getLearnMenuText() {
  return `🧠 *CLARION LEARNING LAB & NYSC COMPASS*\n` +
    `_Master your service year. Prepare for the global market._\n` +
    `──────────────\n\n` +
    `Everything you need to thrive before, during, and after NYSC:\n\n` +
    `💻 *1. Featured Free Learning Asset:*\n` +
    `• *The Odin Project* (https://www.theodinproject.com)\n` +
    `  The gold standard in free, open-source Full-Stack Web Development curriculum (HTML, CSS, JavaScript, React & Node.js). Zero fluff, hands-on portfolio projects.\n\n` +
    `🇳🇬 *2. The Complete NYSC Playbook:*\n` +
    `• *Camp Survival:* Packing checklists, drills, allowances, and posting hacks.\n` +
    `• *PPA Navigation:* Relocation criteria, accommodation rights, and monthly clearance.\n` +
    `• *CDS Excellence:* Planning impactful community projects to qualify for State Honors.\n\n` +
    `🤝 *Are you an Educator or Tutor?*\n` +
    `If you have high-yield learning resources, course guides, or want to contribute educational assets to fellow corps members:\n` +
    `👉 *Reply SUBMIT to send learning assets or links for review!*\n\n` +
    `──────────────\n` +
    `• Reply *0* to return to Main Menu\n` +
    `• Reply *2* to explore *EARN* pathways`;
}

export function getEarnMenuText() {
  return `💼 *CLARION EARNING HUB*\n` +
    `_Multiple pathways to financial independence during and after your service year._\n` +
    `──────────────\n\n` +
    `Choose your preferred income stream:\n\n` +
    `1️⃣ ⚡ *24/7 Automated Telecom Franchise*\n` +
    `   Run a personal data, airtime, exam PINs (WAEC/NECO), electricity & cable TV bot on WhatsApp with ₦0 capital.\n\n` +
    `2️⃣ 🛍️ *Compass™ Online Storefronts*\n` +
    `   Sell your physical or digital products via WhatsApp & Web with automated bot checkout.\n\n` +
    `3️⃣ 🤝 *Creator Partner Program*\n` +
    `   Earn weekly cash rewards recommending Clarion products.\n\n` +
    `4️⃣ 📋 *NYSC Job Board & Talent Placement*\n` +
    `   Direct corporate match with top companies, remote micro-gigs & PPA placement.\n\n` +
    `──────────────\n` +
    `👉 *Reply 1, 2, 3, or 4 to proceed:*\n` +
    `• Reply *0* to return to Main Menu`;
}

export function getBuildMenuText() {
  return `🏗️ *STARTUP ACCELERATOR, PRODUCTION & DISTRIBUTION FOUNDRY*\n` +
    `_We provide the physical space, the production line, and nationwide distribution._ 🌍🔨\n` +
    `──────────────\n\n` +
    `Clarion doesn't just offer advice. *We produce and distribute your creations:*\n\n` +
    `🏭 *1. The Clarion Creative Hub & Space:*\n` +
    `• A physical creative building with dedicated workstations, audio recording booths, and merchandise production lines.\n` +
    `• In-house industrial screen-printing inks, embroidery machines, photobooths, label presses & packaging logistics.\n\n` +
    `🎨 *2. Creative Production & Amplification:*\n` +
    `• 🎤 *Recording Artists & Podcasters:* Curated official Clarion playlists on *Spotify, Apple Music, YouTube Music & Audiomack* to amplify your tracks and podcasts!\n` +
    `• 🎬 *Filmmakers & Creators:* Official Clarion YouTube channel & studio showcase for corps filmmakers, vloggers & comedy creators.\n` +
    `• 🧵 *Fashion Brands:* Fabric sourcing, bulk precision cutting, printing & distribution via Clarion storefronts.\n\n` +
    `🚀 *3. Startup Accelerator & Grants:*\n` +
    `• Seed micro-grants *(₦50k – ₦250k or more)* for working prototypes built during service.\n` +
    `• Compass™ headless open-source e-commerce API access.\n\n` +
    `──────────────\n` +
    `👉 *Have a startup or creative venture?*\n` +
    `• Reply *PITCH* to submit your Executive Summary (PDF or text) for review & grants!\n` +
    `• Reply *0* to return to Main Menu`;
}

export function getMerchMenuText() {
  return `🛍️ *CLARION SUPPLY CO. | OFFICIAL NYSC GEAR & JERSEYS*\n` +
    `_Premium kit for corps life — 50% designed by corps members._ 🎒\n` +
    `──────────────\n\n` +
    `Standard camp kits wear out in weeks. Clarion Supply Co. engineers durable, weather-tested streetwear and tournament gear built for Nigerian conditions:\n\n` +
    `🧵 *The 50% Creator Collaboration Pledge:*\n` +
    `Up to *50% of all items* are designed in partnership with talented corps member designers, tailors, and visual artists. Every order directly funds a fellow corper!\n\n` +
    `🎖️ *Honors Gifting & Drops:*\n` +
    `Exceptional franchise vendors, CDS champions, and camp leaders will be gifted exclusive merch drops *100% free*! The rest of the community can access via limited online drops, camp pop-ups, and community raffles.\n\n` +
    `📦 *The Drop Catalog (Concept Images Dropping Soon!):*\n` +
    `⚽ *Tournament Sports Kits:* Breathable Football, Volleyball & Basketball Jerseys for *Team A & Team B*!\n` +
    `🧥 *Tactical Bomber Jackets:* Heavy rain, morning dew & harmattan wind protection.\n` +
    `👕 *Vintage Raglan & Ringer Tees:* Heavyweight cotton streetwear with subtle NYSC pride.\n` +
    `🎒 *Bags & Totes:* Padded laptop tech backpacks & reinforced canvas tote bags.\n` +
    `📓 *Writing Materials:* Debossed hardcover service journal & executive pen.\n` +
    `🍶 *Insulated Water Bottles:* 24hr cold retention for hot parade afternoons.\n` +
    `🧢 *Hats & Headwear:* Distressed dad caps & tactical bucket hats.\n` +
    `...and many more to come! ✨\n\n` +
    `──────────────\n` +
    `📢 *SUBMISSIONS NOW OPEN FOR SEASON 1 (S1)!*\n` +
    `👉 *Designers:* Reply *DESIGN* to review S1 production rules & submit sketches!\n` +
    `👉 *Corps Members:* Reply *ALERT* to be the first to view concept images & pre-orders!\n` +
    `• Reply *0* to return to Main Menu`;
}

export function getEventsMenuText() {
  return `🎪 *CLARION EVENTS, DROPS & PROJECT UPDATES*\n` +
    `_The heartbeat of the Clarion community across Nigeria._ 📅\n` +
    `──────────────\n\n` +
    `Stay plugged into what is happening across camps, states, and virtual stages:\n\n` +
    `📢 *Active Project Dispatches:*\n` +
    `Community development is already underway across multiple states — funding solar installations at corpers' lodges, upgrading rural school libraries, and supporting sanitation drives. Transparent metrics will be published live as each project wraps!\n\n` +
    `🎟️ *Upcoming Drops & Activations:*\n` +
    `• ⚽ *Jerseys & Bomber Jacket Concept Drop:* First look and pre-orders launching soon!\n` +
    `• 🎪 *Camp Pop-Ups:* Free merchandise giveaways and raffle activations during orientation camp!\n` +
    `• 🎙️ *Clarion Founders' AMA:* Live virtual audio space on Twitter/X with the Lead Architect (MGL).\n\n` +
    `──────────────\n` +
    `👉 *Reply ALERT to get calendar reminders before drops go live!*\n` +
    `• Reply *0* to return to Main Menu\n` +
    `• Reply *2* to start earning now`;
}

export function getImpactMenuText() {
  return `💚 *THE CLARION COMMUNITY FUND & PARTNER NETWORK*\n` +
    `_Radical transparency. Measurable grassroots empowerment._ 🇳🇬\n` +
    `──────────────\n\n` +
    `Every transaction on Clarion routes *20% to 80%* of vendor profits directly into community development.\n\n` +
    `📊 *Impact Tracking & Transparency:*\n` +
    `All project funding is tracked and audited publicly. Verified real-time stats (total funds raised, school classrooms touched, lodges powered by solar, and micro-grants disbursed) will be displayed on this dashboard as initial projects complete. We are starting immediately! 🚀\n\n` +
    `🤝 *BECOME A CORPORATE OR ALUMNI PARTNER:*\n` +
    `Are you a company, NGO, or proud NYSC alumnus looking to give back?\n` +
    `• Sponsor an LGA community development project.\n` +
    `• Sponsor official Clarion Merch gear giveaways for corps members.\n` +
    `• Sponsor data or recharge card giveaways for camp orientation batches.\n` +
    `• Sponsor youth tech hackathons and skills acquisition boot camps.\n\n` +
    `👉 *Reply PARTNER to connect directly with our partnerships desk!*\n\n` +
    `💚 *Direct Community Donation:*\n` +
    `Transfer directly to the custody account:\n` +
    `🏦 *Bank:* HabariPay (GTCO)\n` +
    `🔢 *Account:* 5005005594\n` +
    `👤 *Account Name:* CLARION DIGITAL HUB\n\n` +
    `_Donors receive an official personalized "Clarion Community Champion" badge!_ 🎨\n\n` +
    `──────────────\n` +
    `• Reply *0* to return to Main Menu\n` +
    `• Reply *2* to start your Franchise and auto-contribute!`;
}

// Central ClarionHub Virtual Account for public orders (Live GTCO collection account from Squad)
export const CENTRAL_HUB_ACCOUNT = {
  bankName: 'HabariPay (GTCO)',
  accountNumber: '5005005594',
  accountName: 'CLARION DIGITAL HUB'
};

/**
 * Helper to determine if a corps member is running their proxy bot
 * directly on the same phone number they use to chat with MotherBot.
 */
export function checkIsSameNumber(userJid, botPhoneNumber) {
  if (!userJid || !botPhoneNumber) return false;
  const userDigits = String(userJid).replace(/[^0-9]/g, '');
  const botDigits = String(botPhoneNumber).replace(/[^0-9]/g, '');
  if (userDigits.length < 10 || botDigits.length < 10) return false;
  return userDigits.slice(-10) === botDigits.slice(-10);
}

// In-memory fallback if Firestore is slow/down
export const mockUserStore = new Map();
export const mockManualOrders = new Map();

/**
 * Simulates WhatsApp typing indicator ("composing") before sending responses.
 */
export const simulateTyping = async (sock, toJid, durationMs = 1500) => {
  if (!sock || !toJid) return;
  try {
    await sock.sendPresenceUpdate('composing', toJid);
    await new Promise(r => setTimeout(r, durationMs));
    await sock.sendPresenceUpdate('paused', toJid);
  } catch (e) {
    // Gracefully ignore presence update errors
  }
};

const startQRImageDelivery = async (sock, from, user, saveUser) => {
  const targetNumber = user.phoneNumber;
  const deliveryJid = user.qrDeliveryJid || from;

  try {
    await sessionManager.startQRPairingForUser(
      {
        ...user,
        ownerJid: from,
        motherJid: from,
        uid: targetNumber.includes('@') ? targetNumber : `${targetNumber}@s.whatsapp.net`
      },
      async (rawQR) => {
        try {
          const qrBuffer = await QRCode.toBuffer(rawQR, { width: 600, margin: 2 });

          await sock.sendMessage(deliveryJid, {
            image: qrBuffer,
            caption: `📸 *Scan this QR Code with your Bot Phone (+${targetNumber})!*\n\n1. Open WhatsApp on *+${targetNumber}*\n2. Go to *Settings > Linked Devices > Link a Device*\n3. Point your camera at this QR image on this screen!\n\n⏱️ *Expires in 60 seconds. Reply RESEND to get a fresh code.*`
          });

          if (deliveryJid !== from) {
            await sock.sendMessage(from, {
              text: `📤 *QR image sent to +${deliveryJid.split('@')[0]}!* Open that phone and scan the image with your bot phone (*+${targetNumber}*).`
            });
          }
        } catch (imgErr) {
          logger.error('Error generating/sending QR image:', imgErr);
          await sock.sendMessage(from, { text: '❌ Error generating QR code image. Reply *RESEND* to try again.' });
        }
      }
    );
  } catch (err) {
    logger.error('QR Pairing Error:', err);
    await saveUser({ ...user, state: STATES.AWAITING_PROXY_NUMBER });
    await sock.sendMessage(from, { text: '❌ Failed to generate QR code. Please try typing your bot phone number again (e.g. 08012345678).' });
  }
};

export const handleMotherMessage = async (sock, msg) => {
  const from = msg.key.remoteJid;

  // Rate limit check
  try {
    await motherMessageLimiter.consume(from);
  } catch (rejRes) {
    logger.warn(`[RATE-LIMIT] Mother Bot message throttled for ${from}`);
    return;
  }

  const messageContent = msg.message?.ephemeralMessage?.message ||
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.editedMessage?.message ||
    msg.message;

  const text = messageContent?.conversation ||
    messageContent?.extendedTextMessage?.text ||
    messageContent?.text ||
    messageContent?.listResponseMessage?.title ||
    messageContent?.buttonsResponseMessage?.selectedDisplayText ||
    '';
  const pushName = msg.pushName || 'Co-member';

  if (!text && !msg.message?.contactMessage && !msg.message?.contactsArrayMessage) {
    if (!msg.message?.protocolMessage) {
      logger.info({ msg: msg.message }, 'Received non-text message');
    }
    return;
  }
  if (msg.key?.fromMe) return; // Ignore outgoing messages sent by the bot/admin
  if (from.endsWith('@g.us')) return; // Ignore group messages

  try {
    let userData;
    let userRef;

    if (db.users) {
      userRef = db.users.doc(from);
      try {
        const userDoc = await userRef.get().catch(() => null);
        userData = userDoc?.exists ? userDoc.data() : (mockUserStore.get(from) || { state: STATES.START, uid: from });
      } catch (e) {
        userData = mockUserStore.get(from) || { state: STATES.START, uid: from };
      }
    } else {
      userData = mockUserStore.get(from) || { state: STATES.START, uid: from };
    }

    const command = text.trim();

    const saveUser = async (data) => {
      mockUserStore.set(from, data);
      if (userRef) {
        await userRef.set(data, { merge: true }).catch(err => logger.warn('Firestore write failed, using memory:', err.message));
      }
    };

    logger.info(`Mother Bot handling message from ${pushName} (${userData.state})`);

    // ── Admin Chat Mode: bot goes silent so admin can chat manually ──
    if (userData.adminMode === true) {
      if (command.toLowerCase() === 'exit' || command.toLowerCase() === 'exitadmin') {
        await saveUser({ ...userData, adminMode: false });
        return sock.sendMessage(from, {
          text: `🤖 *Clarion A.I. is back online!*\n\nReply *MENU* to access your portal, or send your *NYSC State Code* to get started.`
        });
      }
      return; // Silent — admin is chatting manually
    }

    // Simulate typing presence on WhatsApp before generating response
    await simulateTyping(sock, from, 1500);

    const isGlobalMenu = command.toLowerCase() === 'menu' || command.toLowerCase() === 'portal';
    if (isGlobalMenu) {
      // Trust partners who have fully onboarded (COMPLETED state) or confirmed via portal gate
      const isVerified = userData.stateCodeConfirmed || userData.state === STATES.COMPLETED;
      if (isVerified) {
        userData.state = STATES.PORTAL_MENU;
        await saveUser(userData);
        return sock.sendMessage(from, { text: getPortalMenuText(userData.stateCode) });
      } else {
        userData.state = STATES.AWAITING_PORTAL_STATE_CODE;
        await saveUser(userData);
        return sock.sendMessage(from, {
          text: `📡 *CLARION A.I* · NYSC Enterprise 🇳🇬\n` +
            `_Official Operating System · SAED × CDS_\n` +
            `──────────────\n\n` +
            `Welcome, Patriot. 🫡\n\n` +
            `Clarion is engineered to turn your service year into wealth, high-income skills, and community impact.\n\n` +
            `To activate your private portal, reply with your *NYSC State Code*:\n\n` +
            `_(e.g. \`KD/26A/1234\` or \`LA/25B/5678\`)_\n\n` +
            `──────────────\n` +
            `💬 _Need support? Reply *ADMIN* to speak with a human._`
        });
      }
    }

    if (userData.state === STATES.START) {
      // Fast-path: already verified partner returning to portal
      if (userData.stateCodeConfirmed || userData.verifiedName) {
        userData.state = STATES.PORTAL_MENU;
        await saveUser(userData);
        return sock.sendMessage(from, { text: getPortalMenuText(userData.stateCode) });
      }

      // Public Airtime (Card) check
      const cardRegex = /^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
      if (cardRegex.test(command)) {
        const match = command.match(cardRegex);
        const amount = match && match[1] ? parseInt(match[1]) : null;
        let targetPhone = match && match[2] ? match[2] : from.split('@')[0];

        if (!amount) {
          await saveUser({ ...userData, state: STATES.AWAITING_MB_CARD_AMOUNT, previousState: STATES.START });
          return sock.sendMessage(from, {
            text: `📲 *Clarion Airtime Top-up*\n\nHow much airtime would you like to buy?\n\nReply:\n👉 *CARD [amount]* (e.g. *CARD 500* for this number)\n👉 *CARD [amount] [phone]* (e.g. *CARD 500 08012345678* to gift someone)`
          });
        }

        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const network = detectNetwork(targetPhone) || 'mtn';

        if (amount < 50 || amount > 50000) {
          return sock.sendMessage(from, { text: '❌ Airtime amount must be between ₦50 and ₦50,000.' });
        }

        const orderRef = `CLARION_AIR_${Date.now()}`;
        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'PENDING_AIRTIME',
            userId: 'HUB',
            buyerPhone: from,
            targetPhone,
            network,
            amount,
            donationTier: 'HUB',
            status: 'AWAITING_PAYMENT',
            createdAt: new Date().toISOString()
          }).catch(() => { });
        }

        return sock.sendMessage(from, {
          text: `📲 *Clarion Airtime Order Confirmation*\n\n` +
            `📱 *Recipient:* ${targetPhone}\n` +
            `🌐 *Network:* ${network.toUpperCase()}\n` +
            `💰 *Amount:* ₦${amount.toLocaleString()}\n\n` +
            `💳 *Payment Transfer Details:*\n` +
            `🏦 *Bank:* ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
            `🔢 *Account Number:* ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
            `👤 *Account Name:* ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
            `_Transfer exactly ₦${amount.toLocaleString()} to receive instant airtime top-up._`
        });
      }

      // Public Data plans check
      const dataRegex = /^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i;
      if (dataRegex.test(command)) {
        const match = command.match(dataRegex);
        const targetPrice = match && match[1] ? parseInt(match[1]) : null;
        let targetPhone = match && match[2] ? match[2] : from.split('@')[0];
        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const network = detectNetwork(targetPhone) || 'mtn';
        const plans = await payflex.getAvailablePlans();
        let filtered = plans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));

        if (targetPrice) {
          filtered.sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice));
          filtered = filtered.slice(0, 4);
          filtered.sort((a, b) => a.sellPrice - b.sellPrice);
        } else {
          filtered = filtered.slice(0, 6);
        }

        let menuText = `👋 Welcome to *Clarion A.I.* Digital Hub!\n\n🔎 Network Detected: *${network.toUpperCase()}* for ${targetPhone}\n\n`;
        filtered.forEach(p => {
          menuText += `👉 *${p.name}* = ₦${p.sellPrice}\n`;
        });
        menuText += `\n💳 *Payment Transfer Details:*\n` +
          `🏦 Bank: ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
          `🔢 Account Number: ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
          `👤 Account Name: ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
          `_Transfer the exact amount for your chosen plan to receive instant data delivery._`;

        return sock.sendMessage(from, { text: menuText });
      }

      // Public Exam PIN check
      const pinRegex = /^\.?pin(?:\s+(waec|neco))?$/i;
      if (pinRegex.test(command)) {
        const match = command.match(pinRegex);
        const exam = match && match[1] ? match[1].toUpperCase() : null;
        const examProducts = payflex.getExamProducts();

        if (!exam) {
          let msg = `🎓 *Clarion Exam Result Checker PINs*\n\nAvailable PINs:\n`;
          for (const [k, v] of Object.entries(examProducts)) {
            msg += `👉 *PIN ${k}* — ₦${v.sellPrice.toLocaleString()} (${v.name})\n`;
          }
          msg += `\nReply *PIN WAEC* or *PIN NECO* to purchase.`;
          return sock.sendMessage(from, { text: msg });
        }

        const prod = examProducts[exam];
        const orderRef = `CLARION_PIN_${Date.now()}`;
        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'PENDING_EXAM_PIN',
            userId: 'HUB',
            buyerPhone: from,
            examType: exam,
            amount: prod.sellPrice,
            donationTier: 'HUB',
            status: 'AWAITING_PAYMENT',
            createdAt: new Date().toISOString()
          }).catch(() => { });
        }

        return sock.sendMessage(from, {
          text: `🎓 *${prod.name} Confirmation*\n\n` +
            `💰 *Price:* ₦${prod.sellPrice.toLocaleString()}\n\n` +
            `💳 *Payment Transfer Details:*\n` +
            `🏦 *Bank:* ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
            `🔢 *Account Number:* ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
            `👤 *Account Name:* ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
            `_Transfer exactly ₦${prod.sellPrice.toLocaleString()} to receive your PIN & Serial Number instantly._`
        });
      }

      // ── Screen 0: Welcome Gate ─────────────────────────────
      // Only show to users who send an explicit greeting or trigger word.
      // Silently ignore everything else (existing contacts' casual replies).
      const greetingTrigger = /^(hi|hey|hello|salam|salaam|assalam|yo|sup|holla|howdy|start|connect\s*000|helo|hai|oya|good\s*(morning|afternoon|evening|day)|register|join|begin|enter|open|access|clarion|nysc|menu|portal|who are you|what is this|bot)$/i;

      if (!greetingTrigger.test(command.trim())) {
        // Not a known trigger — silently ignore. Don't spam existing contacts.
        return;
      }

      const screen0Text = `📡 *CLARION A.I* · NYSC Enterprise 🇳🇬\n` +
        `_Official Operating System · SAED × CDS_\n` +
        `──────────────\n\n` +
        `Welcome, Patriot. 🫡\n\n` +
        `Clarion is engineered to turn your service year into wealth, high-income skills, and community impact.\n\n` +
        `To activate your private portal, reply with your *NYSC State Code*:\n\n` +
        `_(e.g. \`KD/26A/1234\` or \`LA/25B/5678\`)_\n\n` +
        `──────────────\n` +
        `💬 _Need support? Reply *ADMIN* to speak with a human._`;

      await saveUser({ ...userData, state: STATES.AWAITING_PORTAL_STATE_CODE });
      return sock.sendMessage(from, { text: screen0Text });
    }
    else if (userData.state === STATES.AWAITING_MB_CARD_AMOUNT) {
      const match = command.match(/^(?:card\s+|airtime\s+)?(\d+)(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i);
      if (!match) {
        return sock.sendMessage(from, {
          text: '❌ Invalid format. Please reply with the amount of airtime you need, e.g. *500* or *500 08012345678*:'
        });
      }

      const amount = parseInt(match[1]);
      let targetPhone = match[2] || userData.phoneNumber || from.split('@')[0];
      if (targetPhone.startsWith('234') && targetPhone.length === 13) {
        targetPhone = '0' + targetPhone.slice(3);
      }
      const network = detectNetwork(targetPhone) || 'mtn';

      if (amount < 50 || amount > 50000) {
        return sock.sendMessage(from, { text: '❌ Airtime amount must be between ₦50 and ₦50,000.' });
      }

      // Restore user state
      const returnState = userData.previousState || (userData.verifiedName ? STATES.COMPLETED : STATES.START);
      await saveUser({ ...userData, state: returnState, previousState: null });

      // If registered corps member with balance, vend from wallet
      if (returnState === STATES.COMPLETED) {
        const balance = await wallet.getBalance(from);
        if (balance >= amount) {
          await sock.sendMessage(from, { text: `⏳ *Processing Airtime Top-up...*\nDeducting ₦${amount.toLocaleString()} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, amount, `Airtime: ₦${amount} to ${targetPhone} (${network.toUpperCase()})`, { network, targetPhone, amount });
            const result = await payflex.purchaseAirtime(network, targetPhone, amount);
            const newBal = (balance - amount).toFixed(2);
            return sock.sendMessage(from, {
              text: `✅ *Airtime Vended Successfully!*\n\n📱 *Recipient:* ${targetPhone}\n🌐 *Network:* ${network.toUpperCase()}\n💰 *Amount:* ₦${amount.toLocaleString()}\n💳 *Paid via:* Clarion Wallet\n🪙 *Remaining Balance:* ₦${newBal}\n🧾 *Ref:* ${result.reference}`
            });
          } catch (err) {
            logger.error('Error vending airtime to partner:', err.message);
            return sock.sendMessage(from, { text: `❌ Airtime delivery failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour current Clarion balance is *₦${balance.toFixed(2)}*, but this airtime order requires *₦${amount.toLocaleString()}*.\n\nTo fund your wallet, transfer to your collection account:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}\n👤 *Name:* ${userData.virtualAccount?.accountName || userData.verifiedName}`
          });
        }
      } else {
        // Public customer
        const orderRef = `CLARION_AIR_${Date.now()}`;
        if (db.ledger) {
          await db.ledger.doc(orderRef).set({
            type: 'PENDING_AIRTIME',
            userId: 'HUB',
            buyerPhone: from,
            targetPhone,
            network,
            amount,
            donationTier: 'HUB',
            status: 'AWAITING_PAYMENT',
            createdAt: new Date().toISOString()
          }).catch(() => { });
        }

        return sock.sendMessage(from, {
          text: `📲 *Clarion Airtime Order Confirmation*\n\n` +
            `📱 *Recipient:* ${targetPhone}\n` +
            `🌐 *Network:* ${network.toUpperCase()}\n` +
            `💰 *Amount:* ₦${amount.toLocaleString()}\n\n` +
            `💳 *Payment Transfer Details:*\n` +
            `🏦 *Bank:* ${CENTRAL_HUB_ACCOUNT.bankName}\n` +
            `🔢 *Account Number:* ${CENTRAL_HUB_ACCOUNT.accountNumber}\n` +
            `👤 *Account Name:* ${CENTRAL_HUB_ACCOUNT.accountName}\n\n` +
            `_Transfer exactly ₦${amount.toLocaleString()} to receive instant airtime top-up._`
        });
      }
    }
    else if (userData.state === STATES.AWAITING_CDS_PROPOSAL_DETAILS) {
      if (command.toLowerCase() === 'cancel') {
        await saveUser({ ...userData, state: STATES.COMPLETED });
        return sock.sendMessage(from, { text: '↩️ CDS proposal application cancelled.' });
      }

      const match = command.match(/^(\d+)\s+(.+)$/s);
      if (!match) {
        return sock.sendMessage(from, {
          text: `❌ *Invalid Format*\n\nPlease reply with the grant amount and project details:\n👉 *[Amount] [Project Title & Summary]*\n\n*Example:* 50000 Corpers Lodge Water Borehole Repair\n\n_Reply CANCEL to exit._`
        });
      }

      const grantAmount = parseInt(match[1]);
      const projectDetails = match[2].trim();
      const rawStateCode = (userData.stateCode || 'NYSC').replace(/[^a-zA-Z0-9]/g, '');
      const proposalId = `CDS-${rawStateCode}-${Math.floor(1000 + Math.random() * 9000)}`;

      const tier = (userData.donationTier || 'MEMBER').toUpperCase();
      const priorityMap = { PIONEER: 100, LORD: 90, MASTER: 70, MEMBER: 50 };
      const priorityScore = priorityMap[tier] || 50;

      const newProposal = {
        id: proposalId,
        proposalId,
        userId: from,
        verifiedName: userData.verifiedName || userData.name || 'Corps Member',
        stateCode: userData.stateCode || 'NYSC',
        donationTier: tier,
        priorityScore,
        grantAmountRequested: grantAmount,
        title: projectDetails.split('\n')[0].slice(0, 60),
        description: projectDetails,
        status: 'PENDING',
        submittedAt: new Date().toISOString()
      };

      if (db.cdsProposals) {
        await db.cdsProposals.doc(proposalId).set(newProposal).catch(err => {
          logger.warn('Firestore proposal save failed, using memory:', err.message);
        });
      }
      mockCdsProposals.set(proposalId, newProposal);

      await saveUser({ ...userData, state: STATES.COMPLETED });

      return sock.sendMessage(from, {
        text: `✅ *CDS Micro-Grant Proposal Submitted!*\n\n` +
          `🔖 *Tracking ID:* \`${proposalId}\`\n` +
          `💰 *Grant Requested:* ₦${grantAmount.toLocaleString()}\n` +
          `📋 *Project:* ${newProposal.title}\n` +
          `🎖️ *Priority Standing:* ${PARTNERSHIP_TIERS[tier]?.name || tier} (${priorityScore}/100 Priority)\n\n` +
          `_Your application has been submitted to the Clarion CDS Allocation Board. You can type *CDS STATUS* anytime to check review status._`
      });
    }
    else if (userData.state === STATES.AWAITING_PORTAL_STATE_CODE) {
      // ADMIN keyword — hand off to manual chat
      if (command.toLowerCase() === 'admin') {
        await saveUser({ ...userData, adminMode: true, state: STATES.START });
        return sock.sendMessage(from, {
          text: `✅ *Connecting you to the Clarion team...*\n\nA team member will respond shortly on this line.\n\n_Reply *EXIT* at any time to return to the automated portal._`
        });
      }

      const stateCodeRegex = /^[A-Z]{2}\/\d{2}[A-C]\/\d{4}$/i;
      const cleanCode = command.toUpperCase().trim();
      if (!stateCodeRegex.test(cleanCode)) {
        return sock.sendMessage(from, {
          text: `❌ *Invalid State Code format.*\n\nPlease use the official format: *KD/26A/1234* or *LA/25B/5678*:`
        });
      }

      await saveUser({
        ...userData,
        pendingStateCode: cleanCode,
        state: STATES.AWAITING_PORTAL_STATE_CODE_CONFIRM
      });

      return sock.sendMessage(from, {
        text: `🔒 *IDENTITY VERIFICATION*\n` +
          `──────────────\n\n` +
          `Please confirm your service details:\n\n` +
          `👤 *State Code:* \`${cleanCode}\`\n` +
          `🎖️ *Status:* Active Corps Member\n\n` +
          `──────────────\n` +
          `🛡️ *Security Notice:*\n` +
          `Your State Code binds permanently to your verified BVN, payout bank, and franchise license. Using another corps member's code results in immediate permanent revocation.\n\n` +
          `──────────────\n` +
          `Is this your correct State Code?\n\n` +
          `👉 Reply *YES* to activate your portal\n` +
          `👉 Reply *RETRY* to change code`
      });
    }
    else if (userData.state === STATES.AWAITING_PORTAL_STATE_CODE_CONFIRM) {
      const resp = command.toLowerCase().trim();
      if (resp === 'yes' || resp === 'y' || resp === '1') {
        const confirmedCode = userData.pendingStateCode || userData.stateCode;
        await saveUser({
          ...userData,
          stateCode: confirmedCode,
          stateCodeConfirmed: true,
          pendingStateCode: null,
          state: STATES.PORTAL_MENU
        });

        return sock.sendMessage(from, { text: getPortalMenuText(confirmedCode) });
      } else if (resp === 'retry' || resp === 'no' || resp === 'n' || resp === '2') {
        await saveUser({
          ...userData,
          state: STATES.AWAITING_PORTAL_STATE_CODE,
          pendingStateCode: null
        });

        return sock.sendMessage(from, {
          text: `Please reply with your correct *NYSC State Code*:\n_(Example: KD/26A/1234 or LA/25B/5678)_`
        });
      } else {
        return sock.sendMessage(from, {
          text: `Please reply *YES* to confirm your State Code (*${userData.pendingStateCode || userData.stateCode}*) or *RETRY* to re-enter.`
        });
      }
    }
    else if (userData.state === STATES.PORTAL_MENU) {
      const lower = command.toLowerCase().trim();
      if (lower === '1' || lower === 'learn') {
        return sock.sendMessage(from, { text: getLearnMenuText() });
      } else if (lower === '2' || lower === 'earn') {
        await saveUser({ ...userData, state: STATES.AWAITING_EARN_CHOICE });
        return sock.sendMessage(from, { text: getEarnMenuText() });
      } else if (lower === '3' || lower === 'build') {
        return sock.sendMessage(from, { text: getBuildMenuText() });
      } else if (lower === '4' || lower === 'merch') {
        return sock.sendMessage(from, { text: getMerchMenuText() });
      } else if (lower === '5' || lower === 'events') {
        return sock.sendMessage(from, { text: getEventsMenuText() });
      } else if (lower === '6' || lower === 'impact') {
        return sock.sendMessage(from, { text: getImpactMenuText() });
      } else if (lower === '0' || lower === 'menu') {
        return sock.sendMessage(from, { text: getPortalMenuText(userData.stateCode) });
      } else if (lower === 'pitch') {
        await saveUser({ ...userData, state: STATES.AWAITING_PITCH_SUBMISSION });
        return sock.sendMessage(from, {
          text: `📄 *CLARION VENTURE & ACCELERATOR SUBMISSION*\n` +
            `──────────────\n\n` +
            `We review applications weekly for grant funding, studio time, and production sponsorship.\n\n` +
            `Please send your pitch in one of two ways right now:\n` +
            `1️⃣ *Send a PDF document* of your Executive Summary / Deck.\n` +
            `2️⃣ *Or simply type out your summary here* (Problem, Solution, Team, What you need).\n\n` +
            `──────────────\n` +
            `• Reply *CANCEL* to exit back to the Build Hub`
        });
      } else if (lower === 'design') {
        await saveUser({ ...userData, pendingDesigns: [], state: STATES.AWAITING_DESIGN_SUBMISSION });
        return sock.sendMessage(from, {
          text: `🎨 *SEASON 1 (S1) DESIGNER COLLABORATION RULES*\n` +
            `──────────────\n\n` +
            `Are you a corps member fashion designer, illustrator, or tailor? If your design is selected:\n` +
            `✅ We manufacture it in our physical production space.\n` +
            `✅ We handle national distribution and delivery.\n` +
            `✅ You earn direct profit royalties on every single piece sold!\n\n` +
            `📐 *S1 Submission Guidelines:*\n` +
            `1. *Production Feasibility:* Must be easy to manufacture and source locally in Nigeria.\n` +
            `2. *Color Palette:* Must utilize Clarion signature colors (Clarion Orange, Forest Green, Cream, or Clean White) alongside the Clarion logo.\n` +
            `3. *Allowed Categories:* Bomber jackets, raglan/ringer tees, sports jerseys (Team A/B), tote bags, caps, or water bottle graphics.\n\n` +
            `👉 *Upload your sketches, mockup images, or PDF documents now!*\n` +
            `_(You can send multiple files. When you have sent all files, reply *DONE* to submit)._\n\n` +
            `──────────────\n` +
            `• Reply *CANCEL* to return to Merch Store`
        });
      } else if (lower === 'submit') {
        await saveUser({ ...userData, state: STATES.AWAITING_CONTRIBUTOR_SUBMISSION });
        return sock.sendMessage(from, {
          text: `🤝 *EDUCATIONAL ASSET & GUIDE SUBMISSION*\n` +
            `──────────────\n\n` +
            `Are you an educator, tutor, or experienced corper?\n\n` +
            `Please reply with your learning link, course outline, or curriculum summary for review:\n\n` +
            `──────────────\n` +
            `• Reply *CANCEL* to return to Main Menu`
        });
      } else if (lower === 'partner') {
        return sock.sendMessage(from, {
          text: `🤝 *CLARION PARTNERSHIPS DESK*\n` +
            `──────────────\n\n` +
            `Thank you for your interest in partnering with Clarion A.I. to empower Nigerian corps members!\n\n` +
            `Our corporate and alumni partnerships team has been notified. A team lead will connect directly with you on this line (+${from.split('@')[0]}).\n\n` +
            `You can also reach our partnership office at *partners@clarion.ng*.\n\n` +
            `──────────────\n` +
            `• Reply *MENU* to return to Main Portal`
        });
      } else if (lower.startsWith('alert')) {
        return sock.sendMessage(from, {
          text: `🔔 *NOTIFICATION PREFERENCES SAVED!*\n` +
            `──────────────\n\n` +
            `You will receive high-priority dispatches and drop alerts directly on this WhatsApp line.\n\n` +
            `──────────────\n` +
            `• Reply *MENU* to return to Main Portal`
        });
      } else {
        return sock.sendMessage(from, {
          text: `👉 Please reply with *1*, *2*, *3*, *4*, *5*, or *6* to select a department:\n\n• Reply *MENU* to view main options.`
        });
      }
    }
    else if (userData.state === STATES.AWAITING_EARN_CHOICE) {
      const lower = command.toLowerCase().trim();
      if (lower === '0' || lower === 'menu') {
        await saveUser({ ...userData, state: STATES.PORTAL_MENU });
        return sock.sendMessage(from, { text: getPortalMenuText(userData.stateCode) });
      } else if (lower === '1') {
        const batchInfo = parseNyscBatch(userData.stateCode);
        if (batchInfo.isActiveCohort) {
          await saveUser({ ...userData, state: STATES.AWAITING_TIER_SELECTION });
          const tierPrompt = `⚡ *CLARION TELECOM FRANCHISE SETUP*\n` +
            `_Turn your WhatsApp into an automated digital enterprise._\n` +
            `──────────────\n\n` +
            `Identity Verified: *${userData.stateCode}* (Active Cohort 🟢)\n\n` +
            `Here is what Clarion sets up for your line:\n` +
            `✅ Automated delivery of MTN, Airtel, Glo & 9mobile data & airtime.\n` +
            `✅ Instant WAEC/NECO Exam PINs, Electricity Units & Cable TV subscriptions.\n` +
            `✅ Dedicated bank virtual collection account in your brand name.\n` +
            `✅ Daily automated profits sent to your payout bank.\n\n` +
            `🎖️ *Step 1: Choose your Clarion Partnership Tier:*\n\n` +
            `*1* - Clarion Member (Donate 20% to Community Fund) [Default]\n` +
            `*2* - Clarion Master (Donate 50% to Community Fund)\n` +
            `*3* - Clarion Lord (Donate 80% to Community Fund)\n` +
            `*4* - Clarion Pioneer Class (Founding Batch: Donate 20% + Awarded Lord Rank & Privileges) 🚀\n\n` +
            `👉 *Reply 1, 2, 3, or 4 to proceed:*\n` +
            `• Reply *0* to return to EARN menu`;
          return sock.sendMessage(from, { text: tierPrompt });
        } else {
          await saveUser({ ...userData, alumniTerminalQueue: true });
          const alumniPrompt = `⚡ *CLARION TELECOM FRANCHISE QUEUE*\n` +
            `_Active Batch Allocation Notice_\n` +
            `──────────────\n\n` +
            `Identity Verified: *${userData.stateCode || 'Patriot'}* (Senior Patriot / Alum 🎖️)\n\n` +
            `Due to exceptional network server demand, instant WhatsApp automated vending terminal licenses are currently reserved for actively serving corps members *(Batch 26+)*.\n\n` +
            `*Good News:* We have placed your profile on our *VIP Priority Terminal Queue*! You will receive first notification when the next terminal server allocation opens for alumni.\n\n` +
            `Meanwhile, your full portal access is active! Explore Compass™ storefronts, the Creator Foundry, and community projects.\n\n` +
            `──────────────\n` +
            `• Reply *0* to return to Earning Hub\n` +
            `• Reply *MENU* to return to Main Portal`;
          return sock.sendMessage(from, { text: alumniPrompt });
        }
      } else if (lower === '2') {
        const compassText = `🛍️ *COMPASS™ SOCIAL COMMERCE STOREFRONTS*\n` +
          `_Sell anything on WhatsApp, Instagram & TikTok with automated bot fulfillment._\n` +
          `──────────────\n\n` +
          `Built on the open-source **Compass™ e-commerce engine (Est. 2025)**:\n` +
          `• Turn your personal side-hustle (thrift, fashion, baked goods, gadgets, digital art) into a real web storefront.\n` +
          `• Orders come in from the web or social media; your Clarion bot collects payment, tracks stock, and dispatches automatically.\n` +
          `• Zero platform fee for verified corps members.\n\n` +
          `Status: *Private cohort testing. Public rollout opening soon!* 🚀\n\n` +
          `──────────────\n` +
          `👉 *Reply ALERT to join the VIP early-access queue and get notified first!*\n` +
          `• Reply *0* to return to Earning Hub`;
        return sock.sendMessage(from, { text: compassText });
      } else if (lower === '3') {
        const affiliateText = `🤝 *CLARION AFFILIATE & CREATOR NETWORK*\n` +
          `_Monetize your network across your platoon, CDS, and camp batch._\n` +
          `──────────────\n\n` +
          `How it works:\n` +
          `• Get a personalized affiliate code and referral storefront link.\n` +
          `• Earn cash bonuses when fellow corpers activate their digital storefronts.\n` +
          `• Earn direct profit percentages when anyone orders Clarion Merch Drops through your link.\n` +
          `• Instant weekly payouts straight to your locked bank account.\n\n` +
          `Status: *Opening alongside Merch Concept Drop 01!* 🎟️\n\n` +
          `──────────────\n` +
          `👉 *Reply ALERT to get your custom referral link reserved!*\n` +
          `• Reply *0* to return to Earning Hub`;
        return sock.sendMessage(from, { text: affiliateText });
      } else if (lower === '4') {
        const jobText = `📋 *CLARION JOB BOARD & TALENT NETWORK*\n` +
          `_Connecting exceptional corps members with top Nigerian companies._\n` +
          `──────────────\n\n` +
          `Finding high-paying post-NYSC roles or remote gigs shouldn't be stressful:\n` +
          `• *Direct Corporate Match:* Fast-track pipelines to verified hiring partners in FinTech, Logistics, EdTech & FMCG.\n` +
          `• *Remote Micro-Gigs:* Paid freelance projects curated specifically for serving corps members.\n` +
          `• *Lord & Master Tier Priority:* Clarion vendors in higher tiers get automatic priority CV forwarding to corporate HR desks.\n\n` +
          `Status: *Vetting employer partners. Launching soon!* 🏢\n\n` +
          `──────────────\n` +
          `Want early access to openings?\n` +
          `• Reply *ALERT 1* — Notify me for Remote Micro-Gigs\n` +
          `• Reply *ALERT 2* — Notify me for Corporate Full-Time Jobs\n` +
          `• Reply *ALERT ALL* — Notify me for all openings\n` +
          `• Reply *0* to return to Earning Hub`;
        return sock.sendMessage(from, { text: jobText });
      } else if (lower.startsWith('alert')) {
        return sock.sendMessage(from, {
          text: `🔔 *NOTIFICATION PREFERENCES SAVED!*\n──────────────\nYou will receive high-priority dispatches and drop alerts directly on this WhatsApp line.\n──────────────\n• Reply *0* to return to Earning Hub\n• Reply *MENU* to view Main Portal`
        });
      } else {
        return sock.sendMessage(from, {
          text: `❌ Invalid selection.\n\nPlease reply *1*, *2*, *3*, or *4* to choose an income stream, or *0* to return to the Main Portal.`
        });
      }
    }
    else if (userData.state === STATES.AWAITING_PITCH_SUBMISSION) {
      if (command.toLowerCase() === 'cancel') {
        await saveUser({ ...userData, state: STATES.PORTAL_MENU });
        return sock.sendMessage(from, { text: getBuildMenuText() });
      }

      let fileSavedPath = null;
      const isDoc = !!(msg.message?.documentMessage || msg.message?.documentWithCaptionMessage || msg.message?.imageMessage);
      if (isDoc) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const fileName = `${from.replace(/[^0-9]/g, '')}_${Date.now()}.pdf`;
          const fullPath = path.join(PITCHES_DIR, fileName);
          fs.writeFileSync(fullPath, buffer);
          fileSavedPath = fullPath;
        } catch (e) {
          logger.warn(`Could not save pitch media file: ${e.message}`);
        }
      }

      const pitchId = `CLARION-PITCH-${Math.floor(1000 + Math.random() * 9000)}`;
      const pitchEntry = {
        id: pitchId,
        pitchId,
        userId: from,
        stateCode: userData.stateCode || 'NYSC',
        verifiedName: userData.verifiedName || userData.name || 'Corps Member',
        summary: command || (isDoc ? 'Document attached' : 'Pitch Submission'),
        filePath: fileSavedPath,
        status: 'PENDING',
        submittedAt: new Date().toISOString()
      };

      if (db.pitches) {
        await db.pitches.doc(pitchId).set(pitchEntry).catch(err => logger.warn(`Firestore pitch save failed: ${err.message}`));
      }
      mockPitches.set(pitchId, pitchEntry);

      await saveUser({ ...userData, state: STATES.PORTAL_MENU });

      return sock.sendMessage(from, {
        text: `✅ *PITCH RECEIVED & LOGGED!*\n` +
          `──────────────\n\n` +
          `Reference ID: *${pitchId}*\n` +
          `Your executive summary has been logged into the Clarion Ventures Dashboard for review.\n\n` +
          `We will notify you right here on WhatsApp once reviewed!\n\n` +
          `──────────────\n` +
          `• Reply *0* to explore other departments\n` +
          `• Reply *MENU* to view Main Portal`
      });
    }
    else if (userData.state === STATES.AWAITING_DESIGN_SUBMISSION) {
      if (command.toLowerCase() === 'cancel') {
        await saveUser({ ...userData, pendingDesigns: [], state: STATES.PORTAL_MENU });
        return sock.sendMessage(from, { text: getMerchMenuText() });
      }

      if (command.toLowerCase() === 'done') {
        const files = userData.pendingDesigns || [];
        if (files.length === 0 && command.length < 5) {
          return sock.sendMessage(from, {
            text: `❌ No design files received yet. Please send an image sketch or mockup first, or reply *CANCEL*:`
          });
        }

        const designId = `CLARION-DESIGN-${Math.floor(1000 + Math.random() * 9000)}`;
        const designEntry = {
          id: designId,
          designId,
          userId: from,
          stateCode: userData.stateCode || 'NYSC',
          verifiedName: userData.verifiedName || userData.name || 'Corps Member',
          files,
          submittedAt: new Date().toISOString(),
          status: 'PENDING'
        };

        if (db.merchDesigns) {
          await db.merchDesigns.doc(designId).set(designEntry).catch(err => logger.warn(`Firestore merch design save failed: ${err.message}`));
        }
        mockDesigns.set(designId, designEntry);

        await saveUser({ ...userData, pendingDesigns: [], state: STATES.PORTAL_MENU });

        return sock.sendMessage(from, {
          text: `✅ *SEASON 1 DESIGN SUBMISSION LOGGED!*\n` +
            `──────────────\n\n` +
            `Reference ID: *${designId}*\n` +
            `Attached Files: ${files.length} design asset(s) stored.\n\n` +
            `Your submission has been cataloged in the Clarion Creative Foundry production queue.\n\n` +
            `📸 *Tip:* Screenshot this confirmation card to share on your Status or portfolio!\n\n` +
            `If selected for Season 1 sampling, our team will message you right here to onboard you for manufacturing and royalty payouts.\n\n` +
            `──────────────\n` +
            `• Reply *0* to return to Merch Store\n` +
            `• Reply *MENU* to view Main Portal`
        });
      }

      const isMedia = !!(msg.message?.imageMessage || msg.message?.documentMessage || msg.message?.documentWithCaptionMessage);
      if (isMedia) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          const ext = msg.message?.imageMessage ? 'jpg' : 'pdf';
          const fileName = `${from.replace(/[^0-9]/g, '')}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
          const fullPath = path.join(DESIGNS_DIR, fileName);
          fs.writeFileSync(fullPath, buffer);

          const curDesigns = userData.pendingDesigns || [];
          curDesigns.push(fullPath);
          await saveUser({ ...userData, pendingDesigns: curDesigns });

          return sock.sendMessage(from, {
            text: `📥 *Asset Received (${curDesigns.length} attached)*\nSend another file, or reply *DONE* when finished to finalize your submission!`
          });
        } catch (e) {
          logger.warn(`Could not save merch design asset: ${e.message}`);
          return sock.sendMessage(from, { text: `❌ Could not download asset: ${e.message}. Please try resending.` });
        }
      } else {
        return sock.sendMessage(from, {
          text: `👉 Please upload an image sketch, mockup, or PDF document.\nWhen you have finished sending all files, reply *DONE* to complete your submission, or *CANCEL* to exit.`
        });
      }
    }
    else if (userData.state === STATES.AWAITING_CONTRIBUTOR_SUBMISSION) {
      if (command.toLowerCase() === 'cancel') {
        await saveUser({ ...userData, state: STATES.PORTAL_MENU });
        return sock.sendMessage(from, { text: getLearnMenuText() });
      }

      const contribId = `CONTRIB-${Math.floor(1000 + Math.random() * 9000)}`;
      const contribEntry = {
        id: contribId,
        contribId,
        userId: from,
        stateCode: userData.stateCode || 'NYSC',
        verifiedName: userData.verifiedName || userData.name || 'Educator',
        content: command,
        submittedAt: new Date().toISOString()
      };

      mockContributors.set(contribId, contribEntry);
      await saveUser({ ...userData, state: STATES.PORTAL_MENU });

      return sock.sendMessage(from, {
        text: `✅ *LEARNING ASSET SUBMITTED!*\n` +
          `──────────────\n\n` +
          `Reference ID: *${contribId}*\n` +
          `Thank you for contributing to the Clarion corps member knowledge base! Our editorial team will review your asset and index it in the next directory update.\n\n` +
          `──────────────\n` +
          `• Reply *0* to return to Main Menu`
      });
    }
    else if (userData.state === STATES.AWAITING_NYSC_CODE) {
      const stateCodeRegex = /^[A-Z]{2}\/\d{2}[A-C]\/\d{4}$/i;
      if (!stateCodeRegex.test(command)) {
        return sock.sendMessage(from, { text: '❌ Invalid State Code format. Please use the format: NY/24A/1234' });
      }

      await saveUser({
        ...userData,
        stateCode: command.toUpperCase(),
        state: STATES.AWAITING_TIER_SELECTION
      });

      const tierPrompt = `🎖️ *Choose your Clarion Partnership Tier:*\n\n` +
        `*1* - Clarion Member (Donate 20% to CDS) [Default]\n` +
        `*2* - Clarion Master (Donate 50% to CDS)\n` +
        `*3* - Clarion Lord (Donate 80% to CDS)\n` +
        `*4* - Clarion Pioneer Class (Founding Batch: Donate 20% to CDS + Awarded Clarion Lord Rank & All Privileges) 🚀\n\n` +
        `Reply *1*, *2*, *3*, or *4* to proceed:`;

      return sock.sendMessage(from, { text: tierPrompt });
    }
    else if (userData.state === STATES.AWAITING_TIER_SELECTION) {
      let selectedTier = 'MEMBER';
      let rankBadge = 'MEMBER';

      if (command === '1' || command.toLowerCase().includes('member')) {
        selectedTier = 'MEMBER';
        rankBadge = 'MEMBER';
      } else if (command === '2' || command.toLowerCase().includes('master')) {
        selectedTier = 'MASTER';
        rankBadge = 'MASTER';
      } else if (command === '3' || command.toLowerCase().includes('lord')) {
        selectedTier = 'LORD';
        rankBadge = 'LORD';
      } else if (command === '4' || command.toLowerCase().includes('pioneer')) {
        selectedTier = 'PIONEER';
        rankBadge = 'LORD';
      } else {
        return sock.sendMessage(from, { text: '❌ Invalid selection. Please reply *1*, *2*, *3*, or *4* to choose your tier:' });
      }

      const tierInfo = PARTNERSHIP_TIERS[selectedTier];
      await saveUser({
        ...userData,
        donationTier: selectedTier,
        rankBadge: rankBadge,
        state: STATES.AWAITING_INITIAL_BANK
      });

      return sock.sendMessage(from, {
        text: `🎖️ *Tier Selected: ${tierInfo.name}* (${tierInfo.displayDonate} CDS Donation)\n\n` +
          `🏦 *Bank Account Setup & Verification*\n\n` +
          `To ensure automated profit cashouts, please provide your payout bank details. Your account holder name will be verified via bank lookup and permanently locked to your Clarion enterprise.\n\n` +
          `Please reply with your *Bank Name* and *10-digit Account Number* (e.g. *GTBank 0123456789* or *Access Bank 0123456789*):`
      });
    }
    else if (userData.state === STATES.AWAITING_INITIAL_BANK) {
      let bankName = '';
      let accountNumber = '';

      const spaceMatch = command.match(/^(.+?)\s*(\d{10})$/);
      if (spaceMatch) {
        bankName = spaceMatch[1].trim();
        accountNumber = spaceMatch[2];
      } else {
        const noSpaceMatch = command.match(/^([a-zA-Z\s]+?)(\d{10})$/);
        if (noSpaceMatch) {
          bankName = noSpaceMatch[1].trim();
          accountNumber = noSpaceMatch[2];
        }
      }

      if (!bankName || !accountNumber) {
        return sock.sendMessage(from, {
          text: '❌ Could not read bank details.\n\nPlease reply with your Bank Name and 10-digit Account Number.\nExample: *GTBank 0123456789*'
        });
      }

      await sock.sendMessage(from, { text: '🔍 Verifying account details with bank servers...' });
      const banks = await squad.getBanks();
      const normBank = bankName.toLowerCase().replace(/[^a-z0-9]/g, '');
      let matchedBank = banks.find(b => {
        const normB = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normB === normBank || normB.includes(normBank) || normBank.includes(normB);
      });

      if (!matchedBank) {
        if (config.mockMode || config.squad?.secretKey?.includes('sandbox')) {
          matchedBank = { name: bankName.toUpperCase(), code: '000' };
        } else {
          const supported = banks.slice(0, 10).map(b => b.name).join(', ');
          return sock.sendMessage(from, {
            text: `❌ Bank "${bankName}" not recognized.\n\nSupported banks include: ${supported}, etc.\nPlease try again:`
          });
        }
      }

      try {
        const accountInfo = await squad.validateBankAccount(matchedBank.code, accountNumber);
        const verifiedName = accountInfo.accountName;

        // Store pending (uncommitted) bank details for confirmation
        await saveUser({
          ...userData,
          pendingBank: {
            bankName: matchedBank.name,
            bankCode: matchedBank.code,
            accountNumber,
            accountName: verifiedName
          },
          state: STATES.AWAITING_INITIAL_BANK_CONFIRM
        });

        return sock.sendMessage(from, {
          text: `🔍 *Account Verified with Bank Servers:*\n\n` +
            `👤 *Account Name:* ${verifiedName}\n` +
            `🏦 *Bank:* ${matchedBank.name}\n` +
            `🔢 *Account Number:* ${accountNumber}\n\n` +
            `Is this your correct bank account?\n` +
            `• Reply *YES* to confirm\n` +
            `• Reply *RETRY* to enter a different account`
        });
      } catch (err) {
        logger.error('Initial bank validation failed:', err.message);
        return sock.sendMessage(from, {
          text: '❌ Could not verify bank account. Please check your bank name and account number, then try again:'
        });
      }
    }
    // ── AWAITING_INITIAL_BANK_CONFIRM ──
    else if (userData.state === STATES.AWAITING_INITIAL_BANK_CONFIRM) {
      if (command === 'retry' || command === 'no' || command === '2') {
        await saveUser({ ...userData, state: STATES.AWAITING_INITIAL_BANK, pendingBank: null });
        return sock.sendMessage(from, {
          text: '🔄 No problem! Please re-enter your *Bank Name* and *10-digit Account Number*:\n\nExample: *GTBank 0123456789*'
        });
      }

      if (command !== 'yes' && command !== '1') {
        return sock.sendMessage(from, {
          text: 'Reply *YES* to confirm this account, or *RETRY* to enter different details.'
        });
      }

      // Lock the verified name and bank details
      const { bankName: pBankName, bankCode: pBankCode, accountNumber: pAccountNumber, accountName: pAccountName } = userData.pendingBank;

      await saveUser({
        ...userData,
        verifiedName: pAccountName,
        bankDetails: { bankName: pBankName, bankCode: pBankCode, accountNumber: pAccountNumber, accountName: pAccountName },
        pendingBank: null,
        state: STATES.AWAITING_FRANCHISE_NAME
      });

      return sock.sendMessage(from, {
        text: `✅ *Bank Account Locked!*\n\n` +
          `🏢 *Name Your Digital Franchise Storefront (Optional)*\n\n` +
          `Every Clarion partner operates their own digital telecom enterprise. ` +
          `What would you like your storefront to be called?\n\n` +
          `Examples: _Apex Telecom_, _Khadija Subz_, _Bello Data Hub_\n\n` +
          `• Reply with your *Franchise Name* (Max 20 characters)\n` +
          `• Or reply *SKIP* to use your personal name\n` +
          `  _(Clarion AI - ${pAccountName})_`
      });
    }
    // ── AWAITING_FRANCHISE_NAME ──
    else if (userData.state === STATES.AWAITING_FRANCHISE_NAME) {
      let franchiseName = null;
      let brandName = '';

      if (command === 'skip' || command === '0') {
        // Use verified name, truncated smartly for banking systems
        brandName = 'Clarion AI - ' + truncateForNIBSS(userData.verifiedName);
      } else {
        // Sanitize: strip emojis/special chars, max 20 chars
        let cleanName = text.trim().replace(/[^a-zA-Z0-9\s\-]/g, '').substring(0, 20).trim();
        if (cleanName.length < 2) {
          return sock.sendMessage(from, {
            text: '❌ Name too short. Please enter at least 2 characters, or reply *SKIP*:'
          });
        }
        franchiseName = cleanName;
        brandName = 'Clarion AI - ' + cleanName;
      }

      await sock.sendMessage(from, {
        text: `⏳ Creating your dedicated collection account for *${brandName}*...`
      });

      try {
        // Create Squad Virtual Account with brand name
        const account = await squad.createVirtualAccount(
          brandName,
          `${from.split('@')[0]}@nyscbot.com`,
          from.split('@')[0]
        );

        await saveUser({
          ...userData,
          name: userData.verifiedName,
          franchiseName,
          brandName,
          virtualAccount: account,
          state: STATES.AWAITING_PROXY_NUMBER
        });

        return sock.sendMessage(from, {
          text: `🎊 *Enterprise Identity Setup Complete!*\n\n` +
            `🏢 *Franchise:* ${brandName}\n` +
            `👤 *Verified Operator:* ${userData.verifiedName} (Permanently Locked)\n` +
            `🏦 *Payout Bank:* ${userData.bankDetails.bankName} (${userData.bankDetails.accountNumber})\n` +
            `💳 *Clarion Collection Acct:* ${account.bankName} - ${account.accountNumber}\n` +
            `🎖️ *Tier:* ${PARTNERSHIP_TIERS[userData.donationTier || 'MEMBER'].name}\n\n` +
            `*Final Step:* To activate your Digital Storefront, please reply with the WhatsApp number you want your Bot to run on (e.g. 08012345678):`
        });
      } catch (err) {
        logger.error('Virtual account creation failed during franchise setup:', err.message);
        return sock.sendMessage(from, {
          text: '❌ Could not create your collection account. Please try again by replying with your franchise name, or reply *SKIP*:'
        });
      }
    }
    else if (userData.state === STATES.AWAITING_PROXY_NUMBER || command.toUpperCase().startsWith('PAIR')) {
      let rawNumber = command.toUpperCase().startsWith('PAIR') ? command.split(/\s+/)[1] : command;
      rawNumber = rawNumber ? rawNumber.replace(/\D/g, '') : '';

      if (rawNumber.length < 10) {
        return sock.sendMessage(from, { text: `❌ Phone Number Required. Please reply with the number you want your Bot to run on (e.g. 08012345678):` });
      }

      // Normalize Nigerian local numbers: 080... -> 23480...
      if (rawNumber.startsWith('0') && rawNumber.length === 11) {
        rawNumber = '234' + rawNumber.substring(1);
        logger.info(`Normalized local number to ${rawNumber}`);
      }

      let targetNumber = rawNumber;

      await saveUser({
        ...userData,
        phoneNumber: targetNumber,
        phoneJid: `${targetNumber}@s.whatsapp.net`,
        state: STATES.AWAITING_QR_DELIVERY_NUMBER
      });

      return sock.sendMessage(from, {
        text: `📱 *Where should we send your QR activation code image?*\n\nTo scan the QR code, the image needs to be displayed on a screen nearby (so your bot phone *+${targetNumber}* can scan it).\n\n• Reply *SAME* to receive the QR image right here in this chat.\n• Or reply with a *Phone Number* (e.g. 08012345678 - personal phone, laptop, or friend's WhatsApp) to receive the image there instead.`
      });
    }
    else if (userData.state === STATES.AWAITING_QR_DELIVERY_NUMBER) {
      let deliveryJid = from;

      if (command.toUpperCase() !== 'SAME') {
        let rawNum = command.replace(/\D/g, '');
        if (rawNum.startsWith('0') && rawNum.length === 11) {
          rawNum = '234' + rawNum.substring(1);
        }
        if (rawNum.length < 10) {
          return sock.sendMessage(from, { text: '❌ Invalid phone number. Reply *SAME* to send here, or enter a valid 11-digit phone number:' });
        }
        deliveryJid = `${rawNum}@s.whatsapp.net`;
      }

      const updatedUser = { ...userData, qrDeliveryJid: deliveryJid, state: STATES.AWAITING_QR_SCAN };
      await saveUser(updatedUser);

      await sock.sendMessage(from, { text: `⏳ Generating your activation QR code image for *+${userData.phoneNumber}*...\n\nPlease stand by!` });

      await startQRImageDelivery(sock, from, updatedUser, saveUser);
    }
    else if (userData.state === STATES.AWAITING_QR_SCAN) {
      const isCompletedCommand = /^(?:promo|fuel|giveaway|balance|bal|orders|order|check|kit|launch|help|commands|\?|mode|upgrade|downgrade|withdraw|impact|profile|rank|history|tx|vip|cds)/i.test(command);
      const isAlreadyPaired = Boolean(userData.pairedAt || userData.botMode || sessionManager.sessions.has(userData.phoneJid || userData.phoneNumber || from));

      if (isCompletedCommand || isAlreadyPaired) {
        userData.state = STATES.COMPLETED;
        userData.botMode = userData.botMode || 'manual';
        await saveUser(userData);
      } else if (command.toUpperCase() === 'RESEND' || command.toUpperCase() === 'RETRY') {
        await sock.sendMessage(from, { text: `⏳ Regenerating a fresh QR code image...` });
        await startQRImageDelivery(sock, from, userData, saveUser);
        return;
      } else {
        const destNum = (userData.qrDeliveryJid || from).split('@')[0];
        return sock.sendMessage(from, {
          text: `📱 Your activation QR code image was sent to *+${destNum}*.\n\nOpen WhatsApp on *+${destNum}*, display the image on screen, and scan it with your bot phone (*+${userData.phoneNumber}*).\n\nReply *RESEND* if the code expired!`
        });
      }
    }

    // ── Shared contact extraction helper (accessible from all states) ──
    const extractContacts = () => {
      let extractedNumbers = [];
      const contactMsg = msg.message?.contactMessage;
      const contactsArray = msg.message?.contactsArrayMessage?.contacts;
      if (contactMsg) {
        const vcard = contactMsg.vcard;
        const jidMatch = vcard?.match(/waid=(\d+)/i);
        const numMatch = vcard?.match(/TEL.*?:(.*)/i);
        if (jidMatch) extractedNumbers.push(jidMatch[1]);
        else if (numMatch) extractedNumbers.push(numMatch[1]);
      } else if (contactsArray) {
        contactsArray.forEach(c => {
          const vcard = c.vcard;
          const jidMatch = vcard?.match(/waid=(\d+)/i);
          const numMatch = vcard?.match(/TEL.*?:(.*)/i);
          if (jidMatch) extractedNumbers.push(jidMatch[1]);
          else if (numMatch) extractedNumbers.push(numMatch[1]);
        });
      }
      if (command && extractedNumbers.length === 0) {
        const digitSequences = command.match(/(?:\+?\d[\d\-\s]{7,}\d)/g);
        if (digitSequences) extractedNumbers.push(...digitSequences);
      }
      return extractedNumbers.map(rawNum => {
        let clean = rawNum.replace(/\D/g, '');
        if (clean.length === 11 && clean.startsWith('0')) clean = '234' + clean.substring(1);
        return clean ? clean + '@s.whatsapp.net' : null;
      }).filter(Boolean);
    };

    // If user is in any state and drops a contact, intercept for vend checkout
    const isPortalBrowsingState = [
      STATES.PORTAL_MENU, STATES.AWAITING_EARN_CHOICE
    ].includes(userData.state);
    const sharedContactsEarly = extractContacts();
    if (isPortalBrowsingState && sharedContactsEarly.length > 0 && userData.verifiedName) {
      const activeContact = sharedContactsEarly[0];
      const hasBroadcasted = (userData.broadcastHistory || []).includes(activeContact);
      await saveUser({ ...userData, state: STATES.AWAITING_CONTACT_ACTION, activeContact, previousPortalState: userData.state });
      if (hasBroadcasted) {
        return sock.sendMessage(from, {
          text: `📲 *Contact received: +${activeContact.split('@')[0]}*\n\nWhat would you like to do?\n*1* — Purchase data for this number\n*2* — Buy recharge card / airtime\n\nReply *CANCEL* to abort.`
        });
      } else {
        return sock.sendMessage(from, {
          text: `📲 *Contact received: +${activeContact.split('@')[0]}*\n\nWhat would you like to do?\n*1* — Send Broadcast message\n*2* — Purchase data for this number\n*3* — Buy recharge card / airtime\n\nReply *CANCEL* to abort.`
        });
      }
    }

    if (userData.state === STATES.COMPLETED || userData.state === STATES.AWAITING_WITHDRAW_DETAILS || userData.state === STATES.AWAITING_WITHDRAW_CONFIRM || userData.state === STATES.AWAITING_BROADCAST_CONTACTS || userData.state === STATES.AWAITING_CONTACT_ACTION || userData.state === STATES.AWAITING_DATA_PLAN_SELECT || userData.state === STATES.AWAITING_PAYMENT_METHOD) {

      // ── Onboarding Wizard Interceptor (if partner is completing setup) ──
      if (userData.onboardingStep !== null && userData.onboardingStep !== undefined) {
        const handled = await handleOnboardingWizardInput(sock, from, userData, command);
        if (handled) return;
      }

      if (userData.state === STATES.AWAITING_BROADCAST_CONTACTS) {
        const template = `Big news! 🚀 I just launched my automated 24/7 Data Bot powered by Clarion A.I (NYSC SAED Project). Get your MTN, Airtel, and Glo data instantly, at either official rates or cheaper! 🔥\n\nThe bot runs on this my number, but it ignores normal chat. To talk to the bot, you MUST trigger it!\n\nJust reply to me with:\n*Data 500* - To see deals around ₦500\n*Data 1000* - To see deals around ₦1000\n\nThe best part? Every time you buy, you're helping fund NYSC community projects! 🇳🇬 Try it right now!`;

        let validJids = extractContacts();
        if (validJids.length > 0) {
          let whitelist = userData.tempWhitelist || [];
          let added = 0;
          let invalid = 0;

          if (validJids.length > 2) {
            await sock.sendMessage(from, { text: `⏳ Verifying ${validJids.length} contacts with WhatsApp servers...` });
          }

          for (let targetJid of validJids) {
            if (!whitelist.includes(targetJid)) {
              // Verify number directly on WhatsApp platform
              const [result] = await sock.onWhatsApp(targetJid).catch(() => []);
              if (result && result.exists) {
                whitelist.push(targetJid);
                added++;
              } else {
                invalid++;
              }
            }
          }

          let responseText = '';
          if (added > 0) {
            await saveUser({ ...userData, tempWhitelist: whitelist });
            responseText = `✅ Added ${added} valid number(s). (Total: ${whitelist.length})\n`;
          } else {
            responseText = `No valid new numbers were added.\n`;
          }

          if (invalid > 0) {
            responseText += `⚠️ Skipped ${invalid} number(s) that are NOT registered on WhatsApp to protect your account.\n`;
          }

          responseText += `\nKeep sharing more contacts, or reply *DONE* to send the broadcast!`;
          return sock.sendMessage(from, { text: responseText.trim() });
        } else if (command.toUpperCase() === 'DONE' || command.toUpperCase() === 'YES') {
          const whitelist = userData.tempWhitelist || [];
          const userPhoneJid = from.split('@')[0] + '@s.whatsapp.net';

          if (whitelist.length === 0) {
            await saveUser({ ...userData, state: STATES.COMPLETED });
            return sock.sendMessage(from, { text: '✅ Launch broadcast skipped.\n\nYou are fully set up! Type *BALANCE* or *HISTORY* anytime to manage your enterprise.' });
          }

          await broadcastQueue.queueBroadcast(userPhoneJid, template, whitelist);
          const previousBroadcasts = userData.broadcastHistory || [];
          const updatedHistory = [...new Set([...previousBroadcasts, ...whitelist])];
          await saveUser({ ...userData, state: STATES.COMPLETED, tempWhitelist: [], broadcastHistory: updatedHistory });
          return sock.sendMessage(from, { text: `✅ *Broadcast queued to your ${whitelist.length} selected contacts!*\n\nCommunications will be dispatched safely.\n\nYour enterprise is fully active! Type *BALANCE* or *HISTORY* anytime to manage your store.` });
        } else if (command.toUpperCase() === 'SKIP' || command.toUpperCase() === 'NO') {
          await saveUser({ ...userData, state: STATES.COMPLETED, tempWhitelist: [] });
          return sock.sendMessage(from, { text: '✅ Enterprise launch broadcast skipped.\n\nYour digital storefront is fully set up! Type *BALANCE* or *HISTORY* anytime.' });
        } else {
          return sock.sendMessage(from, { text: 'Please send contact cards/numbers to add to your broadcast list, or reply *DONE* to begin, or *SKIP*.' });
        }
      }

      // ── VIP command ────────────────────────────────────────
      else if (userData.state === STATES.COMPLETED && command.toLowerCase() === 'vip') {
        const vipData = await reportService.getVIPCustomers(from);
        if (!vipData || vipData.list.length === 0) {
          return sock.sendMessage(from, { text: '📭 Cannot generate VIP report: No completed customer orders yet.' });
        }

        let msg = `🏆 *Your VIP Customers*\n\n`;
        const medals = ['🥇', '🥈', '🥉'];
        vipData.list.forEach((cust, index) => {
          msg += `${medals[index]} +${cust.phone} — ₦${cust.amount} (${cust.orders} orders)\n`;
        });

        msg += `\n*Total Enterprise Revenue:* ₦${vipData.totalRevenue} across ${vipData.totalOrders} orders`;

        return sock.sendMessage(from, { text: msg });
      }

      // ── AWAITING CONTACT ACTIONS & DATA CHECKOUT ───────────
      else if (userData.state === STATES.COMPLETED && extractContacts().length > 0) {
        const sharedJids = extractContacts();
        const activeContact = sharedJids[0];

        const hasBroadcasted = (userData.broadcastHistory || []).includes(activeContact);
        await saveUser({ ...userData, state: STATES.AWAITING_CONTACT_ACTION, activeContact });

        if (hasBroadcasted) {
          return sock.sendMessage(from, {
            text: `📲 *Contact received: +${activeContact.split('@')[0]}*\n\nWhat would you like to do?\n*1* — Purchase data for this number\n*2* — Buy recharge card / airtime\n\nReply *CANCEL* to abort.`
          });
        } else {
          return sock.sendMessage(from, {
            text: `📲 *Contact received: +${activeContact.split('@')[0]}*\n\nWhat would you like to do?\n*1* — Send Broadcast message\n*2* — Purchase data for this number\n*3* — Buy recharge card / airtime\n\nReply *CANCEL* to abort.`
          });
        }
      }
      else if (userData.state === STATES.AWAITING_CONTACT_ACTION) {
        if (command === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null });
          return sock.sendMessage(from, { text: '❌ Action cancelled.' });
        }

        const hasBroadcasted = (userData.broadcastHistory || []).includes(userData.activeContact);

        if (command === '1' && !hasBroadcasted) {
          // Broadcast
          const template = `Big news! 🚀 I just launched my automated 24/7 Data Bot powered by Clarion A.I (NYSC SAED Project). Get your MTN, Airtel, and Glo data instantly, at either official rates or cheaper! 🔥\n\nThe bot runs on this my number, but it ignores normal chat. To talk to the bot, you MUST trigger it!\n\nJust reply to me with:\n*Data 500* - To see deals around ₦500\n*Data 1000* - To see deals around ₦1000\n\nThe best part? Every time you buy, you're helping fund NYSC community projects! 🇳🇬 Try it right now!`;
          const userPhoneJid = from.split('@')[0] + '@s.whatsapp.net';
          await broadcastQueue.queueBroadcast(userPhoneJid, template, [userData.activeContact]);
          const updatedHistory = [...new Set([...(userData.broadcastHistory || []), userData.activeContact])];
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, broadcastHistory: updatedHistory });
          return sock.sendMessage(from, { text: `✅ Broadcast queued for +${userData.activeContact.split('@')[0]}.` });
        }
        else if (command === '2' || (command === '1' && hasBroadcasted)) {
          // Data Purchase flow
          await sock.sendMessage(from, { text: '⏳ Detecting network & parsing plans...' });
          const network = detectNetwork(userData.activeContact);
          const allPlans = await payflex.getAvailablePlans();
          let plans = network ? allPlans.filter(p => p.network.includes(network) || (network === 'mtn' && p.network.includes('mtn_'))) : allPlans;

          if (plans.length === 0) {
            await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null });
            return sock.sendMessage(from, { text: '❌ Could not find plans for this network. Action cancelled.' });
          }

          const topMenu = network ? `📶 *Auto-Detected Network:* ${network.toUpperCase()}` : `🌐 Available Plans`;
          let displayPlans = plans;
          if (!network) displayPlans = plans.slice(0, 10);

          let menuText = `${topMenu}\n\n`;
          displayPlans.forEach(plan => {
            menuText += `🔹 *${plan.name}* - ₦${plan.sellPrice}\n   Reply *${plan.serial}* to select.\n`;
          });
          menuText += '\nReply *CANCEL* to abort.';

          await saveUser({ ...userData, state: STATES.AWAITING_DATA_PLAN_SELECT, activeContactNetwork: network });
          return sock.sendMessage(from, { text: menuText });
        }
        else if (command === '3' || (command === '2' && hasBroadcasted)) {
          // Recharge / Airtime flow
          const targetPhone = userData.activeContact.split('@')[0];
          const network = detectNetwork(targetPhone) || 'mtn';
          const restoreState = userData.previousPortalState || STATES.COMPLETED;
          await saveUser({ ...userData, state: restoreState, activeContact: null, previousPortalState: null });
          return sock.sendMessage(from, {
            text: `📲 *Clarion Airtime Top-up*\n\n` +
              `📱 *Recipient:* 0${targetPhone.slice(-10)}\n` +
              `🌐 *Network:* ${network.toUpperCase()} (auto-detected)\n\n` +
              `How much airtime would you like to send?\n` +
              `👉 *Reply CARD [amount]* to confirm\n` +
              `_(e.g. CARD 500 to top up ₦500)_\n\n` +
              `Or reply *CARD [amount] [phone]* to send to a different number.`
          });
        }

        return sock.sendMessage(from, { text: '❌ Invalid option. Reply *1*, *2*, or *3* — or *CANCEL* to abort.' });
      }
      else if (userData.state === STATES.AWAITING_DATA_PLAN_SELECT) {
        if (command === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null });
          return sock.sendMessage(from, { text: '❌ Action cancelled.' });
        }
        const plans = await payflex.getAvailablePlans();
        const selectedPlan = plans.find(p => p.serial.toString() === command);
        if (!selectedPlan) return sock.sendMessage(from, { text: '❌ Invalid serial. Try again or reply *CANCEL*.' });

        const balance = await wallet.getBalance(from);
        const canUseWallet = balance >= selectedPlan.basePrice;

        await saveUser({ ...userData, state: STATES.AWAITING_PAYMENT_METHOD, selectedDataPlan: selectedPlan.serial });

        let promptText = `🛒 *Order Preview*\nPlan: ${selectedPlan.name}\nCost: ₦${selectedPlan.basePrice}\nProfit Markup: ₦${selectedPlan.sellPrice - selectedPlan.basePrice}\n\nYour Profit Wallet: ₦${balance.toFixed(2)}\n\n`;

        if (canUseWallet) {
          promptText += `Options:\n*1* - Pay from Profit Wallet\n*2* - Pay via Squad Transfer\n\nReply *1* or *2* (or *CANCEL*)`;
        } else {
          promptText += `*Insufficient funds in Profit Wallet.* To proceed, you must use Transfer.\n\nReply *2* to Pay via Squad Transfer (or *CANCEL*)`;
        }
        return sock.sendMessage(from, { text: promptText });
      }
      else if (userData.state === STATES.AWAITING_PAYMENT_METHOD) {
        if (command === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, selectedDataPlan: null });
          return sock.sendMessage(from, { text: '❌ Action cancelled.' });
        }

        const plans = await payflex.getAvailablePlans();
        const selectedPlan = plans.find(p => p.serial.toString() === userData.selectedDataPlan.toString());
        const balance = await wallet.getBalance(from);

        if (command === '1') {
          if (balance < selectedPlan.basePrice) {
            return sock.sendMessage(from, { text: '❌ Wallet balance changed/insufficient. Action cancelled.' });
          }
          await sock.sendMessage(from, { text: '⏳ Dispensing data...' });
          try {
            await payflex.dispenseData(userData.activeContact.split('@')[0], selectedPlan.serial.toString());
            const profitStr = (selectedPlan.sellPrice - selectedPlan.basePrice).toFixed(2);
            if (db.ledger) {
              await db.ledger.add({
                type: 'COMPLETED_DATA', // Mocks a fulfilled order so profit is captured
                userId: userData.uid,
                buyerPhone: userData.activeContact.split('@')[0],
                planId: selectedPlan.id,
                amount: selectedPlan.sellPrice,
                settlement: {
                  coMemberShare: parseFloat(profitStr)
                },
                status: 'COMPLETED',
                createdAt: new Date().toISOString()
              });
              // Lower wallet balance
              await db.ledger.add({
                type: 'WITHDRAWAL',
                userId: userData.uid,
                amount: selectedPlan.basePrice,
                status: 'SUCCESS', // Implicitly successful local spend
                transferRef: `DATA_PURCHASE_${Date.now()}`,
                createdAt: new Date().toISOString()
              });
            }

            // Increment contacts collection here
            if (db.users && userData.activeContact) {
              try {
                const uId = userData.uid || from;
                const cleanCustomer = userData.activeContact.includes('@') ? userData.activeContact : `${userData.activeContact}@s.whatsapp.net`;
                await db.users.doc(uId).collection('contacts').doc(cleanCustomer).set({
                  totalSpent: admin.firestore.FieldValue.increment(selectedPlan.sellPrice),
                  totalOrders: admin.firestore.FieldValue.increment(1)
                }, { merge: true });
              } catch (e) {
                logger.warn(`Failed to increment contact ${userData.activeContact} stats: ${e.message}`);
              }
            }

            await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, selectedDataPlan: null });
            const successMessage = `✅ *Data Vended Successfully!*\n\nThanks for supporting the hustle! Your purchase just contributed to funding NYSC community projects (lodge renovations, extra camp kits, etc) today. 🇳🇬\n\n🤝 To buy next time, simply text *Data [Amount]* (e.g. Data 500).`;
            return sock.sendMessage(from, { text: `${successMessage}\n\n[Profit of ₦${profitStr} registered to your wallet]` });
          } catch (err) {
            return sock.sendMessage(from, { text: `❌ Data vending failed: ${err.message}` });
          }
        } else if (command === '2') {
          // Send Virtual Account info
          await saveUser({ ...userData, state: STATES.COMPLETED, activeContact: null, selectedDataPlan: null });
          const paymentInstruction = `💳 *Squad Transfer*\n\nPlease transfer *₦${selectedPlan.sellPrice}* to your collection account below to complete this manual purchase:\n\nBank: ${userData.virtualAccount.bankName}\nAccount: ${userData.virtualAccount.accountNumber}\nName: Clarion - ${userData.name}\n\n✅ Data will be dispensed upon payment detection.`;
          return sock.sendMessage(from, { text: paymentInstruction });
        } else {
          return sock.sendMessage(from, { text: 'Invalid option ' + command });
        }
      }

      // ── CHECK Command (Manual Mode: Query Plans by Network Prefix & Size/Budget) ──
      else if (userData.state === STATES.COMPLETED && /^check\s+(0\d{3})\s+([\d]+(?:gb|mb)?|all)$/i.test(command)) {
        const checkMatch = command.match(/^check\s+(0\d{3})\s+([\d]+(?:gb|mb)?|all)$/i);
        const prefix = checkMatch[1];
        const queryArg = checkMatch[2].toLowerCase();

        // 1. Detect network from prefix
        const network = detectNetwork(prefix);
        if (!network) {
          return sock.sendMessage(from, {
            text: `❌ Could not detect network for prefix *${prefix}*.\nPlease check the 4-digit prefix (e.g. 0803, 0802, 0805, 0809).`
          });
        }

        const allPlans = await payflex.getAvailablePlans();
        const networkPlans = allPlans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));

        if (networkPlans.length === 0) {
          return sock.sendMessage(from, {
            text: `❌ No plans currently available for *${network.toUpperCase()}*.`
          });
        }

        let matchedPlans = [];

        if (queryArg === 'all') {
          matchedPlans = networkPlans.slice().sort((a, b) => a.sellPrice - b.sellPrice).slice(0, 15);
        } else if (queryArg.endsWith('gb') || queryArg.endsWith('mb')) {
          const exactMatches = networkPlans.filter(p => p.name.toLowerCase().includes(queryArg));
          if (exactMatches.length > 0) {
            matchedPlans = exactMatches.sort((a, b) => a.sellPrice - b.sellPrice);
          } else {
            const targetVal = parseFloat(queryArg);
            const isGb = queryArg.endsWith('gb');
            const targetMb = isGb ? targetVal * 1024 : targetVal;

            const parsePlanMb = (name) => {
              const gbM = name.match(/(\d+(?:\.\d+)?)\s*gb/i);
              if (gbM) return parseFloat(gbM[1]) * 1024;
              const mbM = name.match(/(\d+(?:\.\d+)?)\s*mb/i);
              if (mbM) return parseFloat(mbM[1]);
              return 0;
            };

            matchedPlans = networkPlans
              .map(p => ({ plan: p, mb: parsePlanMb(p.name) }))
              .filter(p => p.mb > 0)
              .sort((a, b) => Math.abs(a.mb - targetMb) - Math.abs(b.mb - targetMb))
              .slice(0, 5)
              .map(p => p.plan)
              .sort((a, b) => a.sellPrice - b.sellPrice);
          }
        } else {
          const budget = parseFloat(queryArg);
          matchedPlans = networkPlans
            .slice()
            .sort((a, b) => Math.abs(a.sellPrice - budget) - Math.abs(b.sellPrice - budget))
            .slice(0, 5)
            .sort((a, b) => a.sellPrice - b.sellPrice);
        }

        if (matchedPlans.length === 0) {
          matchedPlans = networkPlans.slice(0, 5);
        }

        let msg = `📶 *${network.toUpperCase()} Plans for Prefix ${prefix}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        matchedPlans.forEach(p => {
          msg += `👉 *${p.name}* — ₦${p.sellPrice.toLocaleString()}\n`;
        });
        msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 *To create an order:* \n` +
          `Text *ORDER [Size/Price] [Phone]*\n` +
          `Example: *ORDER 1GB ${prefix}1234567* (network auto-detected!)`;

        return sock.sendMessage(from, { text: msg });
      }

      // ── ORDER Command (Manual Mode: Network auto-detected from phone, optional override) ──
      else if (userData.state === STATES.COMPLETED && /^order(?:\s+(mtn|airtel|glo|9mobile))?\s+([\d]+(?:gb|mb)?|\d+)\s+(0\d{10}|\+?234\d{10})$/i.test(command)) {
        const orderMatch = command.match(/^order(?:\s+(mtn|airtel|glo|9mobile))?\s+([\d]+(?:gb|mb)?|\d+)\s+(0\d{10}|\+?234\d{10})$/i);
        let reqNetwork = orderMatch[1] ? orderMatch[1].toLowerCase() : null;
        const planArg = orderMatch[2].toLowerCase();
        let targetPhone = orderMatch[3];

        if (targetPhone.startsWith('+234')) {
          targetPhone = '0' + targetPhone.slice(4);
        } else if (targetPhone.startsWith('234')) {
          targetPhone = '0' + targetPhone.slice(3);
        }

        const detectedNet = detectNetwork(targetPhone);

        // Auto-detect network from phone if not explicitly provided
        if (!reqNetwork) {
          reqNetwork = detectedNet;
          if (!reqNetwork) {
            return sock.sendMessage(from, {
              text: `❌ Could not auto-detect network for ${targetPhone}.\nPlease specify network: *ORDER [network] ${planArg} ${targetPhone}*`
            });
          }
        }

        let warningText = '';
        if (detectedNet && detectedNet !== reqNetwork) {
          warningText = `⚠️ *Note:* ${targetPhone} appears to be ${detectedNet.toUpperCase()}, but ordering on ${reqNetwork.toUpperCase()} as requested.\n\n`;
        }

        const allPlans = await payflex.getAvailablePlans();
        const networkPlans = allPlans.filter(p => p.network.toLowerCase().includes(reqNetwork));
        if (networkPlans.length === 0) {
          return sock.sendMessage(from, { text: `❌ No plans found for ${reqNetwork.toUpperCase()}.` });
        }

        let selectedPlan = null;
        if (planArg.endsWith('gb') || planArg.endsWith('mb')) {
          selectedPlan = networkPlans.find(p => p.name.toLowerCase().includes(planArg));
          if (!selectedPlan) {
            const targetVal = parseFloat(planArg);
            const isGb = planArg.endsWith('gb');
            const targetMb = isGb ? targetVal * 1024 : targetVal;
            const parsePlanMb = (name) => {
              const gbM = name.match(/(\d+(?:\.\d+)?)\s*gb/i);
              if (gbM) return parseFloat(gbM[1]) * 1024;
              const mbM = name.match(/(\d+(?:\.\d+)?)\s*mb/i);
              if (mbM) return parseFloat(mbM[1]);
              return 0;
            };
            const sorted = networkPlans
              .map(p => ({ plan: p, diff: Math.abs(parsePlanMb(p.name) - targetMb) }))
              .sort((a, b) => a.diff - b.diff);
            selectedPlan = sorted[0]?.plan;
          }
        } else {
          const targetPrice = parseFloat(planArg);
          selectedPlan = networkPlans.find(p => p.sellPrice === targetPrice) ||
            networkPlans.slice().sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice))[0];
        }

        if (!selectedPlan) {
          return sock.sendMessage(from, {
            text: `❌ Could not find a suitable ${reqNetwork.toUpperCase()} plan for "${planArg}".\nText *CHECK ${targetPhone.slice(0, 4)} ALL* to see available plans.`
          });
        }

        const orderId = `MO-${Math.floor(1000 + Math.random() * 9000)}`;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
        const partnerUid = userData.uid || from;
        const partnerName = userData.verifiedName || userData.name || 'Vendor';
        const virtualAcct = userData.virtualAccount || CENTRAL_HUB_ACCOUNT;

        const manualOrderData = {
          orderId,
          partnerId: partnerUid,
          type: 'data',
          network: reqNetwork.toUpperCase(),
          planSerial: selectedPlan.serial,
          planName: selectedPlan.name,
          amount: selectedPlan.sellPrice,
          baseCost: selectedPlan.basePrice,
          targetPhone,
          status: 'PENDING_PAYMENT',
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString()
        };

        if (db.users) {
          try {
            await db.users.doc(partnerUid).collection('manualOrders').doc(orderId).set(manualOrderData);
          } catch (e) {
            logger.warn(`Could not save manual order in Firestore: ${e.message}`);
          }
        }
        mockManualOrders.set(orderId, manualOrderData);

        const expiryTimeStr = expiresAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        const partnerBlock = `${warningText}✅ *Order ${orderId} Created*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📦 *Plan:* ${selectedPlan.name}\n` +
          `📱 *Customer:* ${targetPhone}\n` +
          `💰 *Price:* ₦${selectedPlan.sellPrice.toLocaleString()}\n` +
          `💵 *Your Profit:* ₦${(selectedPlan.sellPrice - selectedPlan.basePrice).toLocaleString()}\n` +
          `⏰ *Expires:* ${expiryTimeStr} (in 30 mins)\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👇 *Forward the message below to your customer:*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💳 *Payment Transfer Details*\n` +
          `🏦 *Bank:* ${virtualAcct.bankName}\n` +
          `🔢 *Account:* ${virtualAcct.accountNumber}\n` +
          `👤 *Name:* ${virtualAcct.accountName || `Clarion - ${partnerName}`}\n` +
          `💰 *Amount:* ₦${selectedPlan.sellPrice.toLocaleString()} exactly\n\n` +
          `⚡ Once paid, your *${selectedPlan.name}* will be delivered automatically to *${targetPhone}* in under 20 seconds!\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

        return sock.sendMessage(from, { text: partnerBlock });
      }

      // ── ORDERS Command (Manual Mode: List recent manual orders) ──
      else if (userData.state === STATES.COMPLETED && /^orders$/i.test(command)) {
        const partnerUid = userData.uid || from;
        let orders = [];

        if (db.users) {
          try {
            const snap = await db.users.doc(partnerUid).collection('manualOrders')
              .orderBy('createdAt', 'desc')
              .limit(10)
              .get();
            orders = snap.docs.map(d => d.data());
          } catch (e) {
            logger.warn(`Could not query manual orders: ${e.message}`);
          }
        }

        if (orders.length === 0) {
          orders = Array.from(mockManualOrders.values())
            .filter(o => o.partnerId === partnerUid)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);
        }

        if (orders.length === 0) {
          return sock.sendMessage(from, {
            text: `📭 *No Manual Orders Found*\n\nYou haven't created any customer orders yet.\n\nText *ORDER [size] [phone]* (e.g. *ORDER 1GB 08012345678*) to create one!`
          });
        }

        let ordersMsg = `📋 *Your Recent Customer Orders*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        const now = new Date();

        orders.forEach(o => {
          let statusEmoji = '⏳';
          let statusLabel = 'PENDING';
          const isExpired = new Date(o.expiresAt) < now;

          if (o.status === 'FULFILLED') {
            statusEmoji = '✅';
            statusLabel = 'FULFILLED';
          } else if (o.status === 'CANCELLED') {
            statusEmoji = '🚫';
            statusLabel = 'CANCELLED';
          } else if (o.status === 'EXPIRED' || (o.status === 'PENDING_PAYMENT' && isExpired)) {
            statusEmoji = '❌';
            statusLabel = 'EXPIRED';
          }

          ordersMsg += `${statusEmoji} *${o.orderId}* | ${o.network} ${o.planName}\n` +
            `   📱 ${o.targetPhone} | ₦${o.amount.toLocaleString()} (${statusLabel})\n\n`;
        });

        ordersMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Text *CANCEL [orderId]* to cancel a pending order.`;

        return sock.sendMessage(from, { text: ordersMsg.trim() });
      }

      // ── CANCEL [orderId] Command (Manual Mode: Cancel pending order) ──
      else if (userData.state === STATES.COMPLETED && /^cancel\s+(MO-\d+)$/i.test(command)) {
        const orderIdMatch = command.match(/^cancel\s+(MO-\d+)$/i);
        const orderId = orderIdMatch[1].toUpperCase();
        const partnerUid = userData.uid || from;

        let order = null;
        let docRef = null;

        if (db.users) {
          try {
            docRef = db.users.doc(partnerUid).collection('manualOrders').doc(orderId);
            const snap = await docRef.get();
            if (snap.exists) order = snap.data();
          } catch (e) { }
        }

        if (!order) {
          order = mockManualOrders.get(orderId);
        }

        if (!order || order.partnerId !== partnerUid) {
          return sock.sendMessage(from, { text: `❌ Order *${orderId}* not found.` });
        }

        if (order.status !== 'PENDING_PAYMENT') {
          return sock.sendMessage(from, {
            text: `❌ Order *${orderId}* cannot be cancelled because its status is *${order.status}*.`
          });
        }

        order.status = 'CANCELLED';
        order.cancelledAt = new Date().toISOString();

        if (docRef) {
          await docRef.update({ status: 'CANCELLED', cancelledAt: order.cancelledAt }).catch(() => { });
        }
        mockManualOrders.set(orderId, order);

        return sock.sendMessage(from, {
          text: `✅ Order *${orderId}* has been cancelled.`
        });
      }

      // ── UPGRADE Command (Upgrade to Autonomous Mode) ──
      else if (userData.state === STATES.COMPLETED && /^upgrade(?:\s+(confirm|monthly))?$/i.test(command)) {
        const upMatch = command.match(/^upgrade(?:\s+(confirm|monthly))?$/i);
        const isConfirming = Boolean(upMatch[1]);
        const balance = await wallet.getBalance(from);

        const currentMode = userData.botMode || BOT_MODES.MANUAL;
        const now = new Date();
        const activeSub = userData.subscription;
        const isCurrentlyAutonomous = currentMode === BOT_MODES.AUTONOMOUS && activeSub?.expiresAt && new Date(activeSub.expiresAt) > now;
        const planConfig = SUBSCRIPTION_PLANS.MONTHLY;

        if (!isConfirming) {
          let msg = `⚡ *CLARION AI UPGRADE*\n` +
            `_Run a 24/7 automated data business — zero manual effort._\n` +
            `──────────────\n\n` +
            `Here is what happens when you sell *manually:*\n\n` +
            `😰 Your customer messages you first.\n` +
            `😰 They send payment *after* you send the data.\n` +
            `😰 Some say _"I'll send later."_ Then they go quiet. 🫠\n` +
            `😰 You chase them. It gets awkward. You lose a friend and ₦500.\n` +
            `😰 You can only serve people when *you* are awake.\n\n` +
            `Here is what happens when your *Clarion AI* handles it:\n\n` +
            `✅ Customer types *DATA* or *DATA 500* at 3am.\n` +
            `✅ AI shows plans instantly.\n` +
            `✅ Customer picks one and transfers payment directly.\n` +
            `✅ Data vends *automatically* the moment payment hits.\n` +
            `✅ No debt. No awkward chats. No missed orders. Ever.\n\n` +
            `──────────────\n` +
            `💳 *Activate AI Automation — ₦${planConfig.price.toLocaleString()}/month*\n\n` +
            `💰 *Your Wallet Balance:* ₦${balance.toFixed(2)}\n`;

          if (isCurrentlyAutonomous) {
            const expDate = new Date(activeSub.expiresAt).toLocaleDateString('en-GB');
            const subLabel = activeSub.plan === 'FREE_GRANT' ? 'Complimentary Free AI Grant' : activeSub.plan;
            msg += `\n✨ *Currently Active:* ${subLabel} until ${expDate}\n_Upgrading now extends by 30 days._\n`;
          }

          if (balance < planConfig.price) {
            const virtualAcct = userData.virtualAccount || CENTRAL_HUB_ACCOUNT;
            msg += `\n⚠️ *Fund your wallet first:*\n` +
              `🏦 HabariPay GTCO · \`${virtualAcct.accountNumber}\`\n` +
              `👤 ${virtualAcct.accountName || userData.verifiedName}\n\n` +
              `_Transfer ₦${planConfig.price.toLocaleString()} then reply *UPGRADE CONFIRM*._`;
          } else {
            msg += `\n👉 Reply *UPGRADE CONFIRM* to activate.`;
          }

          return sock.sendMessage(from, { text: msg });
        }

        if (balance < planConfig.price) {
          const virtualAcct = userData.virtualAccount || CENTRAL_HUB_ACCOUNT;
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nThe ${planConfig.label} requires *₦${planConfig.price.toLocaleString()}*, but your wallet balance is *₦${balance.toFixed(2)}*.\n\nFund your wallet by transferring to your store account:\n🏦 *Bank:* ${virtualAcct.bankName}\n🔢 *Account:* ${virtualAcct.accountNumber}\n👤 *Name:* ${virtualAcct.accountName || userData.verifiedName}\n\nOnce transferred, reply *UPGRADE CONFIRM* again!`
          });
        }

        // Deduct from wallet
        await wallet.recordSubscriptionDebit(from, planConfig.price, 'MONTHLY', { durationDays: planConfig.durationDays });

        // Calculate start and end date (extend if already active)
        let baseDate = now;
        if (isCurrentlyAutonomous && activeSub?.expiresAt) {
          baseDate = new Date(activeSub.expiresAt);
        }
        const expiresAt = new Date(baseDate.getTime() + planConfig.durationDays * 24 * 60 * 60 * 1000);

        const newSub = {
          plan: 'MONTHLY',
          price: planConfig.price,
          durationDays: planConfig.durationDays,
          startedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          autoRenew: true
        };

        const updatedUser = {
          ...userData,
          botMode: BOT_MODES.AUTONOMOUS,
          subscription: newSub
        };

        await saveUser(updatedUser);

        const expFormatted = expiresAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        const confirmMsg = `🎉 *Autonomous Mode Activated!* 🚀\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Your ProxyBot is now running *24/7 in Autonomous Mode* (${planConfig.label})!\n\n` +
          `⚡ *What happens next:*\n` +
          `• When customers text *DATA*, *CARD*, or *PIN*, your bot responds instantly\n` +
          `• Full automated catalogs & payment generation\n` +
          `• Instant data delivery upon transfer\n\n` +
          `📅 *Valid Until:* ${expFormatted}\n` +
          `🔄 *Auto-Renewal:* Enabled (renews from wallet on expiry)\n\n` +
          `_Text *MODE* anytime to check your subscription, or *DOWNGRADE* to revert to manual._`;

        return sock.sendMessage(from, { text: confirmMsg });
      }

      // ── DOWNGRADE Command (Cancel recurring subscription, disable at end of billing cycle) ──
      else if (userData.state === STATES.COMPLETED && /^downgrade$/i.test(command)) {
        if (userData.botMode === BOT_MODES.MANUAL || !userData.botMode) {
          return sock.sendMessage(from, {
            text: `ℹ️ Your store is already in *Manual Mode*.\n\nProxyBot is silent and you handle customer chats manually.\nText *UPGRADE* to activate 24/7 automation!`
          });
        }

        const activeSub = userData.subscription;
        const now = new Date();
        const isNotExpired = activeSub?.expiresAt && new Date(activeSub.expiresAt) > now;

        if (isNotExpired && activeSub.autoRenew === false) {
          const expDate = new Date(activeSub.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          return sock.sendMessage(from, {
            text: `ℹ️ *Auto-renewal is already cancelled.*\n\nYour Autonomous Mode will remain active until *${expDate}* (end of current billing cycle). After that date, your store will automatically switch to Manual Mode.`
          });
        }

        if (isNotExpired) {
          // Keep autonomous until expiresAt, but cancel recurring billing
          const updatedUser = {
            ...userData,
            subscription: {
              ...(userData.subscription || {}),
              autoRenew: false
            }
          };
          await saveUser(updatedUser);

          const expDate = new Date(activeSub.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          return sock.sendMessage(from, {
            text: `🛑 *Auto-Renewal Cancelled*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `You have successfully cancelled subscription renewal.\n\n` +
              `✨ *Good news:* You've already paid for your current cycle, so your ProxyBot will stay *24/7 Autonomous until ${expDate}*!\n\n` +
              `After *${expDate}*, your store will switch to *Manual Mode* without charging your wallet again.\n\n` +
              `_Changed your mind? Text *UPGRADE* anytime to keep automation going._`
          });
        }

        // If subscription has already passed expiry, revert to manual immediately
        const updatedUser = {
          ...userData,
          botMode: BOT_MODES.MANUAL,
          subscription: {
            ...(userData.subscription || {}),
            autoRenew: false
          }
        };
        await saveUser(updatedUser);

        return sock.sendMessage(from, {
          text: `🛑 *Switched to Manual Mode*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Your ProxyBot is now silent. You will handle customer inquiries manually and process sales using MotherBot:\n\n` +
            `👉 *CHECK [prefix] [size]* — Find prices\n` +
            `👉 *ORDER [size] [phone]* — Generate order & payment details\n\n` +
            `_Text *UPGRADE* anytime to reactivate 24/7 automation._`
        });
      }

      // ── ANNOUNCE Command (Toggle new contact introductory announcement) ──
      else if (userData.state === STATES.COMPLETED && /^announce(?:\s+(on|off))?$/i.test(command)) {
        const sub = command.split(/\s+/)[1]?.toLowerCase();
        let newState;
        if (sub === 'on') newState = true;
        else if (sub === 'off') newState = false;
        else newState = !(userData.announceNewContacts !== false);

        await saveUser({ ...userData, announceNewContacts: newState });

        return sock.sendMessage(from, {
          text: newState
            ? `✅ *ANNOUNCE: ON*\n──────────────\n\nNew contacts will receive a friendly welcome note explaining that your line is AI-powered and that normal chatting still works perfectly.`
            : `🔕 *ANNOUNCE: OFF*\n──────────────\n\nFirst-contact welcome messages are paused. Your bot will only respond when keywords are used.`
        });
      }

      // ── HELP / COMMANDS Command ──
      else if (userData.state === STATES.COMPLETED && /^(?:help|commands|\?)$/i.test(command)) {
        const isAutonomous = userData.botMode === BOT_MODES.AUTONOMOUS;
        const modeBadge = isAutonomous ? '*AUTONOMOUS* 🤖' : '*MANUAL* 👤';

        const helpMsg = `❓ *COMMAND DIRECTORY*\n` +
          `_Mode: ${modeBadge}_\n` +
          `──────────────\n\n` +
          `🛒 *Sales & Storefront*\n` +
          `· *CHECK [prefix] [size]* — e.g. CHECK 0801 1GB\n` +
          `· *ORDER [size] [phone]* — e.g. ORDER 1GB 08012345678\n` +
          `· *ORDERS* — View pending & recent orders\n` +
          `· *CANCEL [MO-ID]* — Cancel an unpaid order\n\n` +
          `🤖 *Automation*\n` +
          `· *MODE* — Check bot mode & subscription status\n` +
          `· *UPGRADE* — Activate 24/7 AI automation (₦950/mo)\n` +
          `· *DOWNGRADE* — Cancel auto-renew at billing cycle end\n` +
          `· *ANNOUNCE* — First-contact welcome toggle (ON/OFF)\n\n` +
          `💰 *Wallet & Earnings*\n` +
          `· *BALANCE* — Check profit balance & cashouts\n` +
          `· *WITHDRAW [amount]* — Cash out to your bank\n` +
          `· *HISTORY* — View transaction log\n\n` +
          `📢 *Growth & Marketing*\n` +
          `· *KIT* — Promotional status text & share card\n` +
          `· *PROMO* — Launch giveaway poster & promo fuel\n` +
          `· *GIFT [phone] [plan]* — Gift data to a friend\n\n` +
          `🎖️ *Community & Impact*\n` +
          `· *RANK* / *PROFILE* — NYSC Franchise License\n` +
          `· *IMPACT* — CDS donation milestone score\n` +
          `· *CDS APPLY* — Apply for a community micro-grant\n` +
          `· *CDS STATUS* — Check grant application status\n\n` +
          `──────────────\n` +
          `👉 Reply any command above to proceed. ⚡`;

        return sock.sendMessage(from, { text: helpMsg });
      }

      // ── MODE Command (Check current bot operating mode & subscription status) ──
      else if (userData.state === STATES.COMPLETED && /^mode$/i.test(command)) {
        const currentMode = userData.botMode || BOT_MODES.MANUAL;
        const sub = userData.subscription;
        const now = new Date();

        if (currentMode === BOT_MODES.AUTONOMOUS && sub?.expiresAt) {
          const expDate = new Date(sub.expiresAt);
          const isExpired = now > expDate;
          const daysLeft = Math.max(0, Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)));

          if (!isExpired) {
            const planTitle = sub.plan === 'FREE_GRANT' ? 'Complimentary Free AI Grant' : sub.plan;
            const announceStatus = userData.announceNewContacts !== false ? 'ENABLED 📢' : 'OFF 🔕';
            return sock.sendMessage(from, {
              text: `⚙️ *AUTOPILOT CONTROLS*\n` +
                `_Manage your ProxyBot AI response engine._\n` +
                `──────────────\n\n` +
                `Status: *AUTONOMOUS ACTIVE* 🤖\n` +
                `Plan: ${planTitle} · ${daysLeft} days left\n` +
                `Expires: ${expDate.toLocaleDateString('en-GB')}\n` +
                `Auto-Renew: ${sub.autoRenew !== false ? '✅ Active' : '❌ Inactive'}\n` +
                `First-Contact Intro: *${announceStatus}*\n\n` +
                `· Reply *DOWNGRADE* — Switch to manual mode\n` +
                `· Reply *UPGRADE* — Extend automation\n` +
                `· Reply *ANNOUNCE ON/OFF* — Toggle welcome messages\n\n` +
                `──────────────\n` +
                `· Reply *0* for Main Menu`
            });
          }
        }

        const announceStatus = userData.announceNewContacts !== false ? 'ENABLED 📢' : 'OFF 🔕';
        return sock.sendMessage(from, {
          text: `⚙️ *AUTOPILOT CONTROLS*\n` +
            `_Manage your ProxyBot AI response engine._\n` +
            `──────────────\n\n` +
            `Status: *MANUAL (Free)* 👤\n` +
            `First-Contact Intro: *${announceStatus}*\n\n` +
            `Your ProxyBot is silent. You handle customers manually:\n` +
            `· *CHECK 0801 1GB* — Look up plans\n` +
            `· *ORDER 1GB 08012345678* — Create order\n` +
            `· *ORDERS* — View recent orders\n\n` +
            `· Reply *UPGRADE* — Activate 24/7 AI automation (₦950/mo)\n` +
            `· Reply *ANNOUNCE ON/OFF* — Toggle welcome messages\n\n` +
            `──────────────\n` +
            `· Reply *0* for Main Menu`
        });
      }

      // ── BALANCE command ────────────────────────────────────
      else if ((userData.state === STATES.COMPLETED && command.toLowerCase() === 'balance') || (userData.state === STATES.COMPLETED && command.toLowerCase() === 'bal')) {
        const balance = await wallet.getBalance(from);

        const history = await wallet.getTransactionHistory(from);
        const pendingWithdrawals = history.filter(tx => tx.type === 'WITHDRAWAL' && tx.status === 'PENDING');
        const pendingSum = pendingWithdrawals.reduce((sum, tx) => sum + tx.amount, 0);

        let text = `💰 *Your Wallet Balance*\n\nAvailable: *₦${balance.toFixed(2)}*\n\n`;
        if (pendingSum > 0) {
          text += `⏳ Pending Withdrawals: *₦${pendingSum.toFixed(2)}*\n\n`;
        }
        text += `Type *WITHDRAW [amount]* to cash out.\nType *HISTORY* to view recent transactions.`;

        return sock.sendMessage(from, { text });
      }

      // ── HISTORY command ────────────────────────────────────
      else if (command.toLowerCase() === 'history' || command.toLowerCase() === 'tx') {
        const history = await wallet.getTransactionHistory(from);
        if (history.length === 0) {
          return sock.sendMessage(from, { text: '📭 No recent transactions found.' });
        }

        let historyMsg = `📜 *Recent Transactions*\n\n`;
        history.forEach(tx => {
          const date = new Date(tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          if (tx.type === 'WITHDRAWAL') {
            const icon = tx.status === 'SUCCESS' ? '✅' : tx.status === 'PENDING' ? '⏳' : '❌';
            historyMsg += `${icon} *Out* | ${date}\n   Amt: ₦${tx.amount.toFixed(2)} (${tx.status})\n   Ref: ${tx.transferRef}\n\n`;
          } else if (tx.type === 'COMPLETED_DATA' || (tx.type === 'PENDING_DATA' && tx.status === 'COMPLETED')) {
            const profit = tx.settlement?.coMemberShare || 0;
            historyMsg += `📥 *In*  | ${date}\n   Profit: ₦${profit.toFixed(2)}\n   Plan: ${tx.planId || 'Data'}\n\n`;
          }
        });
        return sock.sendMessage(from, { text: historyMsg.trim() });
      }

      // ── TEST REPORT command ────────────────────────────────
      else if (command.toLowerCase() === '.testreport') {
        const stats = await reportService.generateWeeklyStats(from);

        if (!stats) {
          return sock.sendMessage(from, { text: '📭 Cannot generate test report: You have absolutely zero activity in the last 7 days.' });
        }

        const badgeTitle = stats.impactMilestone?.current
          ? `${stats.impactMilestone.current.badge} ${stats.impactMilestone.current.title}`
          : '🌱 Community Contributor';

        let msg = `📈 *Your Weekly Clarion Enterprise Report*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📊 *This Week's Sales*\n` +
          `• Total Orders: ${stats.totalOrders}\n` +
          `• Data Orders: ${stats.dataOrders || 0}\n` +
          `• Airtime Orders: ${stats.airtimeOrders || 0}\n` +
          `• Exam PINs Sold: ${stats.examPinOrders || 0}\n` +
          `• Gross Revenue: ₦${stats.grossRevenue.toLocaleString()}\n` +
          `• Your Net Profit: ₦${stats.netProfit.toLocaleString()}\n` +
          `• Active Customers: ${stats.activeCustomers}\n\n` +
          `🏆 *Your NYSC CDS Impact*\n` +
          `• Standing: ${badgeTitle}\n` +
          `• Total Donated to Date: ₦${(stats.totalCdsDonated || 0).toLocaleString()}\n`;

        if (stats.impactMilestone?.next) {
          msg += `• Next Milestone: ${stats.impactMilestone.next.badge} ${stats.impactMilestone.next.title} (₦${stats.impactMilestone.next.threshold.toLocaleString()})\n\n`;
        } else {
          msg += `• 💎 Maximum NYSC Hero of Service Impact Achieved!\n\n`;
        }

        if (stats.topCustomers && stats.topCustomers.length > 0) {
          msg += `👑 *Top VIP Customers This Week*\n`;
          stats.topCustomers.slice(0, 3).forEach((c, idx) => {
            const maskedPhone = c.phone.length > 7
              ? `${c.phone.substring(0, 4)}****${c.phone.substring(c.phone.length - 4)}`
              : c.phone;
            msg += `${idx + 1}. ${maskedPhone} — ₦${c.amount.toLocaleString()} (${c.orders} orders)\n`;
          });
          msg += `\n`;
        }

        msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `_Keep building your digital enterprise! Have a highly profitable weekend._ 🚀`;

        return sock.sendMessage(from, { text: msg });
      }

      // ── SYNC PLANS command (admin only) ─────────────────────
      else if (command.toLowerCase() === '.syncplans') {
        await sock.sendMessage(from, { text: '⏳ Syncing plans from Peyflex API...' });
        try {
          const plans = await payflex.syncPlans();
          return sock.sendMessage(from, { text: `✅ *Plans Synced Successfully!*\n\n${plans.length} plans updated in Firestore with the latest tiered pricing.\n\nMarkup tiers applied:\n• < ₦500 → +₦15\n• ₦500–₦999 → +₦20\n• ₦1000–₦2999 → +₦50\n• ₦3000+ → +₦100` });
        } catch (err) {
          return sock.sendMessage(from, { text: `❌ Sync failed: ${err.message}` });
        }
      }

      // ── WITHDRAW command (Streamlined with Permanent Bank Lock) ──
      else if (command.toLowerCase().startsWith('withdraw')) {
        const amountStr = command.split(/\s+/)[1];
        const amount = parseFloat(amountStr);

        if (!amount || isNaN(amount)) {
          return sock.sendMessage(from, {
            text: '❌ Please specify an amount.\n\nExample: *WITHDRAW 2000*'
          });
        }
        if (amount < WITHDRAWAL_FEES.MIN_WITHDRAWAL) {
          return sock.sendMessage(from, {
            text: `❌ Minimum withdrawal is *₦${WITHDRAWAL_FEES.MIN_WITHDRAWAL}*.`
          });
        }

        const balance = await wallet.getBalance(from);
        if (balance <= 0) {
          return sock.sendMessage(from, {
            text: `⚠️ *WITHDRAWAL LOCKED*\n──────────────\n\nYour current wallet balance is *₦${balance.toFixed(2)}* (recovering subscription renewal on credit).\n\nProcess customer sales or top up your wallet to clear the balance.`
          });
        }
        if (amount > balance) {
          return sock.sendMessage(from, {
            text: `❌ Insufficient balance.\n\nYour balance is *₦${balance.toFixed(2)}* but you requested *₦${amount.toFixed(2)}*.`
          });
        }

        // Zero Repetitive Typing: If bank details are already locked on file
        if (userData.bankDetails && userData.bankDetails.accountNumber) {
          const bank = userData.bankDetails;
          const netPayout = +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2);

          await saveUser({
            ...userData,
            state: STATES.AWAITING_WITHDRAW_CONFIRM,
            pendingWithdrawAmount: amount,
            pendingBank: bank
          });

          return sock.sendMessage(from, {
            text: `💸 *Confirm Payout Transfer*\n\n` +
              `Transfer *₦${amount.toFixed(2)}* (Net *₦${netPayout.toFixed(2)}* after ₦${WITHDRAWAL_FEES.TOTAL.toFixed(0)} fee) to your verified account:\n\n` +
              `👤 *Name:* ${bank.accountName || userData.verifiedName}\n` +
              `🏦 *Bank:* ${bank.bankName}\n` +
              `🔢 *Account:* ${bank.accountNumber}\n\n` +
              `Reply *YES* to confirm transfer or *CANCEL* to abort.`
          });
        }

        // Fallback for legacy users without locked bank details: prompt once and lock
        await saveUser({ ...userData, state: STATES.AWAITING_WITHDRAW_DETAILS, pendingWithdrawAmount: amount });
        return sock.sendMessage(from, {
          text: `💸 *Withdrawal Request: ₦${amount.toFixed(2)}*\n\nPlease provide your payout bank details:\n\nReply with your *Bank Name* and *Account Number* (e.g. *GTBank 0123456789*):\n\nType *CANCEL* to abort.`
        });
      }

      // ── AWAITING_WITHDRAW_DETAILS (Fallback for unconfigured accounts) ──
      else if (userData.state === STATES.AWAITING_WITHDRAW_DETAILS) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, { text: '❌ Withdrawal cancelled.' });
        }

        let bankName = '';
        let accountNumber = '';

        const spaceMatch = command.match(/^(.+?)\s*(\d{10})$/);
        if (spaceMatch) {
          bankName = spaceMatch[1].trim();
          accountNumber = spaceMatch[2];
        } else {
          const noSpaceMatch = command.match(/^([a-zA-Z\s]+?)(\d{10})$/);
          if (noSpaceMatch) {
            bankName = noSpaceMatch[1].trim();
            accountNumber = noSpaceMatch[2];
          }
        }

        if (!bankName || !accountNumber) {
          return sock.sendMessage(from, {
            text: '❌ Could not read your bank details.\n\nPlease reply like: *GTBank 0123456789*\n(Bank name followed by 10-digit account number)'
          });
        }

        await sock.sendMessage(from, { text: '🔍 Looking up your bank details...' });
        const banks = await squad.getBanks();
        const normBank = bankName.toLowerCase().replace(/[^a-z0-9]/g, '');
        let matchedBank = banks.find(b => {
          const normB = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normB === normBank || normB.includes(normBank) || normBank.includes(normB);
        });

        if (!matchedBank) {
          if (config.mockMode || config.squad?.secretKey?.includes('sandbox')) {
            matchedBank = { name: bankName.toUpperCase(), code: '000' };
          } else {
            const bankList = banks.slice(0, 10).map(b => b.name).join(', ');
            return sock.sendMessage(from, {
              text: `❌ Bank "${bankName}" not recognized.\n\nSupported banks include:\n${bankList}, etc.\nPlease try again.`
            });
          }
        }

        try {
          const accountInfo = await squad.validateBankAccount(matchedBank.code, accountNumber);
          const amount = userData.pendingWithdrawAmount;
          const netPayout = +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2);
          const bankData = {
            bankName: matchedBank.name,
            bankCode: matchedBank.code,
            accountNumber,
            accountName: accountInfo.accountName
          };

          await saveUser({
            ...userData,
            state: STATES.AWAITING_WITHDRAW_CONFIRM,
            verifiedName: accountInfo.accountName,
            bankDetails: bankData,
            pendingBank: bankData
          });

          return sock.sendMessage(from, {
            text: `🔍 *Account Verified & Locked!*\n\n👤 Name: *${accountInfo.accountName}*\n🏦 Bank: *${matchedBank.name}*\n🔢 Account: *${accountNumber}*\n\n💰 Requested: *₦${amount.toFixed(2)}*\n🏦 Payout Fee: *₦${WITHDRAWAL_FEES.TOTAL.toFixed(0)}*\n💵 You will receive: *₦${netPayout.toFixed(2)}*\n\nReply *YES* to confirm transfer or *CANCEL* to abort.`
          });
        } catch (err) {
          logger.error('Bank validation failed:', err.message);
          return sock.sendMessage(from, {
            text: '❌ Could not verify bank account. Please check the account number and try again.'
          });
        }
      }

      // ── AWAITING_WITHDRAW_CONFIRM (YES / CANCEL) ──────────
      else if (userData.state === STATES.AWAITING_WITHDRAW_CONFIRM) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, { text: '❌ Withdrawal cancelled.' });
        }

        if (command.toLowerCase() !== 'yes') {
          return sock.sendMessage(from, { text: 'Reply *YES* to confirm the transfer or *CANCEL* to abort.' });
        }

        const amount = userData.pendingWithdrawAmount;
        const bank = userData.pendingBank || userData.bankDetails;
        const netPayout = +(amount - WITHDRAWAL_FEES.TOTAL).toFixed(2);

        // Re-check balance to prevent double-spend
        const currentBalance = await wallet.getBalance(from);
        if (amount > currentBalance) {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, {
            text: `❌ Balance changed. Your current balance is *₦${currentBalance.toFixed(2)}*. Please try again.`
          });
        }

        await sock.sendMessage(from, { text: '⏳ Processing your withdrawal...' });

        const transferRef = `WDR_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

        try {
          await wallet.recordWithdrawal(from, amount, bank, transferRef);

          const result = await squad.initiateTransfer(
            netPayout,
            bank.bankCode,
            bank.accountNumber,
            `NYSC Clarion payout for ${userData.verifiedName || userData.name || from}`,
            transferRef
          );

          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });

          return sock.sendMessage(from, {
            text: `✅ *Withdrawal Submitted!*\n\n💵 *₦${netPayout.toFixed(2)}* is on its way to:\n👤 ${bank.accountName || userData.verifiedName}\n🏦 ${bank.bankName} (${bank.accountNumber})\n\nRef: ${transferRef}\n\nType *BALANCE* to check your updated wallet. Type *HISTORY* to track status.`
          });
        } catch (err) {
          logger.error('Transfer failed:', err.message);
          await wallet.updateWithdrawalStatus(transferRef, 'FAILED');
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingWithdrawAmount: null, pendingBank: null });
          return sock.sendMessage(from, {
            text: '❌ Transfer failed. Your balance has been restored. Please try again later.'
          });
        }
      }

      // ── UPDATE BANK command (Security flow with ₦100 fee) ──
      else if (command.toLowerCase() === 'update bank' || command.toLowerCase() === 'change bank') {
        const balance = await wallet.getBalance(from);
        if (balance < WITHDRAWAL_FEES.BANK_UPDATE_FEE) {
          return sock.sendMessage(from, {
            text: `❌ *Insufficient Wallet Balance*\n\nUpdating your permanently verified bank details incurs a security verification fee of *₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)}*.\n\nYour current wallet balance is *₦${balance.toFixed(2)}*. You need at least ₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} to proceed.`
          });
        }

        await saveUser({ ...userData, state: STATES.AWAITING_UPDATE_BANK });
        return sock.sendMessage(from, {
          text: `🏦 *Update Verified Payout Bank*\n\nPlease reply with your new *Bank Name* and *10-digit Account Number* (e.g. *Access Bank 0123456789*):\n\n⚠️ *Security Notice:* A *₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)}* verification charge will be debited from your wallet upon confirmation.\n\nReply *CANCEL* to abort.`
        });
      }

      // ── AWAITING_UPDATE_BANK ───────────────────────────────
      else if (userData.state === STATES.AWAITING_UPDATE_BANK) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingNewBank: null });
          return sock.sendMessage(from, { text: '❌ Bank update cancelled.' });
        }

        let bankName = '';
        let accountNumber = '';
        const spaceMatch = command.match(/^(.+?)\s*(\d{10})$/);
        if (spaceMatch) {
          bankName = spaceMatch[1].trim();
          accountNumber = spaceMatch[2];
        } else {
          const noSpaceMatch = command.match(/^([a-zA-Z\s]+?)(\d{10})$/);
          if (noSpaceMatch) {
            bankName = noSpaceMatch[1].trim();
            accountNumber = noSpaceMatch[2];
          }
        }

        if (!bankName || !accountNumber) {
          return sock.sendMessage(from, {
            text: '❌ Could not parse bank details. Please reply with Bank Name and 10-digit Account Number.\nExample: *Access Bank 0123456789*\n\nReply *CANCEL* to abort.'
          });
        }

        await sock.sendMessage(from, { text: '🔍 Verifying new account details with bank servers...' });
        const banks = await squad.getBanks();
        const matchedBank = banks.find(b =>
          b.name.toLowerCase().replace(/\s+/g, '') === bankName.toLowerCase().replace(/\s+/g, '')
        );

        if (!matchedBank) {
          const bankList = banks.map(b => b.name).join(', ');
          return sock.sendMessage(from, {
            text: `❌ Bank "${bankName}" not recognized.\n\nSupported banks: ${bankList}\nPlease try again or reply *CANCEL*:`
          });
        }

        try {
          const accountInfo = await squad.validateBankAccount(matchedBank.code, accountNumber);
          const pendingNewBank = {
            bankName: matchedBank.name,
            bankCode: matchedBank.code,
            accountNumber,
            accountName: accountInfo.accountName
          };

          await saveUser({
            ...userData,
            state: STATES.AWAITING_UPDATE_BANK_CONFIRM,
            pendingNewBank
          });

          return sock.sendMessage(from, {
            text: `🔍 *New Account Verified!*\n\n` +
              `👤 *Account Name:* ${accountInfo.accountName}\n` +
              `🏦 *Bank:* ${matchedBank.name}\n` +
              `🔢 *Account Number:* ${accountNumber}\n\n` +
              `💳 *Security Debit:* ₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} will be debited from your wallet.\n\n` +
              `Reply *YES* to confirm and lock this new account, or *CANCEL* to abort.`
          });
        } catch (err) {
          logger.error('Update bank validation failed:', err.message);
          return sock.sendMessage(from, {
            text: '❌ Could not verify bank account with bank servers. Please check your account number and try again:'
          });
        }
      }

      // ── AWAITING_UPDATE_BANK_CONFIRM ──────────────────────
      else if (userData.state === STATES.AWAITING_UPDATE_BANK_CONFIRM) {
        if (command.toLowerCase() === 'cancel') {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingNewBank: null });
          return sock.sendMessage(from, { text: '❌ Bank update cancelled.' });
        }

        if (command.toLowerCase() !== 'yes') {
          return sock.sendMessage(from, { text: 'Reply *YES* to confirm the update or *CANCEL* to abort.' });
        }

        const balance = await wallet.getBalance(from);
        if (balance < WITHDRAWAL_FEES.BANK_UPDATE_FEE) {
          await saveUser({ ...userData, state: STATES.COMPLETED, pendingNewBank: null });
          return sock.sendMessage(from, {
            text: `❌ Insufficient balance for ₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} verification fee. Bank update aborted.`
          });
        }

        const newBank = userData.pendingNewBank;
        await wallet.recordBankUpdateFee(from);

        await saveUser({
          ...userData,
          state: STATES.COMPLETED,
          verifiedName: newBank.accountName,
          name: newBank.accountName,
          bankDetails: newBank,
          pendingNewBank: null
        });

        return sock.sendMessage(from, {
          text: `✅ *Bank Details Successfully Updated!*\n\n` +
            `Your payout destination is permanently locked to:\n` +
            `👤 ${newBank.accountName}\n` +
            `🏦 ${newBank.bankName} (${newBank.accountNumber})\n\n` +
            `₦${WITHDRAWAL_FEES.BANK_UPDATE_FEE.toFixed(2)} security fee has been deducted from your wallet balance.`
        });
      }

      // ── RANK / TIER command ────────────────────────────────
      else if (command.toLowerCase() === 'rank' || command.toLowerCase() === 'tier') {
        const tier = (userData.donationTier || 'MEMBER').toUpperCase();
        const tierConfig = PARTNERSHIP_TIERS[tier] || PARTNERSHIP_TIERS.MEMBER;
        const personalProfit = await wallet.getTotalPersonalProfit(from);
        const cdsDonated = await wallet.getTotalCdsDonated(from);
        const rankBadge = userData.rankBadge || (tier === 'PIONEER' ? 'LORD' : tier);

        const rankMsg = `🎖️ *Clarion Enterprise Rank & Philanthropy Report*\n\n` +
          `👤 *Partner:* ${userData.verifiedName || userData.name}\n` +
          `🎖️ *Partnership Tier:* ${tierConfig.name}\n` +
          `👑 *Clarion Rank Badge:* ${rankBadge}\n\n` +
          `💰 *Total Personal Earnings:* ₦${personalProfit.toFixed(2)}\n` +
          `🤝 *Total CDS Impact Pooled:* ₦${cdsDonated.toFixed(2)} (${tierConfig.displayDonate} dedication)\n\n` +
          `🏆 *Active Privileges:*\n` +
          (tier === 'PIONEER'
            ? `• Clarion Lord Executive Badge & Rank\n• Maximum 64% Personal Profit Retention\n• Priority CDS Grant Proposal Consideration\n• Dedicated Enterprise Cloud Node`
            : tier === 'LORD'
              ? `• Clarion Lord Executive Badge & Honors\n• Highest CDS Philanthropist Standing (64% Pool)\n• VIP Community Recognition`
              : tier === 'MASTER'
                ? `• Clarion Master Enterprise Standing\n• Balanced 40/40 Social Enterprise Split`
                : `• Clarion Standard Partner\n• 64% Personal Profit Retention`) +
          `\n\n_Type *ID* anytime to download your Official Franchise Identification Card._`;

        return sock.sendMessage(from, { text: rankMsg });
      }

      // ── ID / LICENSE / PROFILE command (Download Franchise Profile Card) ──
      else if (command.toLowerCase() === 'id' || command.toLowerCase() === 'license' || command.toLowerCase() === 'profile') {
        await sock.sendMessage(from, { text: '⏳ Rendering your Official Clarion Franchise ID Card...' });
        try {
          const cardBuffer = await mediaGen.generateProfileCard(userData);
          return sock.sendMessage(from, {
            image: cardBuffer,
            caption: `🪪 *Clarion Franchise Identification License*\n\nPartner: *${userData.verifiedName || userData.name}*\nState Code: *${userData.stateCode || 'NYSC'}*\nTier: *${PARTNERSHIP_TIERS[userData.donationTier || 'MEMBER'].name}*`
          });
        } catch (e) {
          logger.error('Error generating franchise card:', e.message);
          return sock.sendMessage(from, { text: '❌ Failed to render card. Please try again shortly.' });
        }
      }

      // ── CARD / AIRTIME command (Buy Airtime via Wallet) ─────
      else if (/^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i.test(command)) {
        const cardMatch = command.match(/^\.?(?:card|airtime)(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i);
        const amount = cardMatch && cardMatch[1] ? parseInt(cardMatch[1]) : null;
        let targetPhone = cardMatch && cardMatch[2] ? cardMatch[2] : (userData.phoneNumber || from.split('@')[0]);

        if (!amount) {
          await saveUser({ ...userData, state: STATES.AWAITING_MB_CARD_AMOUNT, previousState: STATES.COMPLETED });
          return sock.sendMessage(from, {
            text: `📲 *Buy Airtime (Card)*\n\nHow much airtime would you like to buy?\n\nReply:\n👉 *CARD [amount]* (e.g. *CARD 500* for your number)\n👉 *CARD [amount] [phone]* (e.g. *CARD 500 08012345678* to gift someone)`
          });
        }

        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const network = detectNetwork(targetPhone) || 'mtn';

        if (amount < 50 || amount > 50000) {
          return sock.sendMessage(from, { text: '❌ Airtime amount must be between ₦50 and ₦50,000.' });
        }

        const balance = await wallet.getBalance(from);
        if (balance >= amount) {
          await sock.sendMessage(from, { text: `⏳ *Processing Airtime Top-up...*\nDeducting ₦${amount.toLocaleString()} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, amount, `Airtime: ₦${amount} to ${targetPhone} (${network.toUpperCase()})`, { network, targetPhone, amount });
            const result = await payflex.purchaseAirtime(network, targetPhone, amount);
            const newBal = (balance - amount).toFixed(2);
            return sock.sendMessage(from, {
              text: `✅ *Airtime Vended Successfully!*\n\n📱 *Recipient:* ${targetPhone}\n🌐 *Network:* ${network.toUpperCase()}\n💰 *Amount:* ₦${amount.toLocaleString()}\n💳 *Paid via:* Clarion Wallet\n🪙 *Remaining Balance:* ₦${newBal}\n🧾 *Ref:* ${result.reference}`
            });
          } catch (err) {
            logger.error('Error vending airtime to partner:', err.message);
            return sock.sendMessage(from, { text: `❌ Airtime delivery failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour current Clarion balance is *₦${balance.toFixed(2)}*, but this airtime order requires *₦${amount.toLocaleString()}*.\n\nTo fund your wallet, transfer to your collection account:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}\n👤 *Name:* ${userData.virtualAccount?.accountName || userData.verifiedName}`
          });
        }
      }

      // ── DATA command (Wholesale Self / Gift Purchase) ────────
      else if (/^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i.test(command) && command.toLowerCase() !== '.data') {
        const dataMatch = command.match(/^\.?data(?:\s+(\d+))?(?:\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10}|\+?234\s?\d{10}))?$/i);
        const targetPrice = dataMatch && dataMatch[1] ? parseInt(dataMatch[1]) : null;
        let targetPhone = dataMatch && dataMatch[2] ? dataMatch[2] : (userData.phoneNumber || from.split('@')[0]);

        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const network = detectNetwork(targetPhone) || 'mtn';
        const plans = await payflex.getAvailablePlans();
        let filtered = plans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));

        if (targetPrice) {
          filtered.sort((a, b) => Math.abs(a.sellPrice - targetPrice) - Math.abs(b.sellPrice - targetPrice));
          filtered = filtered.slice(0, 4);
        } else {
          filtered = filtered.slice(0, 6);
        }

        let msg = `📦 *Wholesale Data Plans for ${targetPhone} (${network.toUpperCase()})*\n\n`;
        filtered.forEach(p => {
          msg += `👉 *${p.name}*\n   💰 *Wholesale Cost:* ₦${p.basePrice} (Retail: ₦${p.sellPrice})\n   Reply *BUYDATA ${p.serial} ${targetPhone}* to purchase from wallet.\n\n`;
        });
        return sock.sendMessage(from, { text: msg });
      }
      else if (command.toLowerCase().startsWith('buydata ')) {
        const parts = command.split(/\s+/);
        const serial = parts[1];
        let targetPhone = parts[2] || userData.phoneNumber || from.split('@')[0];
        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }

        const plans = await payflex.getAvailablePlans();
        const plan = plans.find(p => p.serial.toString() === serial.toString());
        if (!plan) {
          return sock.sendMessage(from, { text: '❌ Invalid plan selection. Type *DATA* to view wholesale plans.' });
        }

        const balance = await wallet.getBalance(from);
        if (balance >= plan.basePrice) {
          await sock.sendMessage(from, { text: `⏳ *Dispensing Data...*\nDeducting wholesale price ₦${plan.basePrice} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, plan.basePrice, `Data: ${plan.name} to ${targetPhone}`, { serial: plan.serial, planName: plan.name, targetPhone });
            await payflex.dispenseData(targetPhone, plan.serial);
            const newBal = (balance - plan.basePrice).toFixed(2);
            return sock.sendMessage(from, {
              text: `✅ *Data Vended Successfully!*\n\n📱 *Recipient:* ${targetPhone}\n📦 *Plan:* ${plan.name}\n💰 *Wholesale Cost:* ₦${plan.basePrice}\n💳 *Paid via:* Clarion Wallet\n🪙 *Remaining Balance:* ₦${newBal}`
            });
          } catch (err) {
            logger.error('Error dispensing self/gift data:', err.message);
            return sock.sendMessage(from, { text: `❌ Data vending failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour balance is *₦${balance.toFixed(2)}*, but this wholesale plan costs *₦${plan.basePrice}*.\n\nFund your wallet by transferring to:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}`
          });
        }
      }

      // ── PIN command (Exam Result Checker PINs) ─────────────
      else if (/^\.?pin(?:\s+(waec|neco))?$/i.test(command)) {
        const pinMatch = command.match(/^\.?pin(?:\s+(waec|neco))?$/i);
        const exam = pinMatch && pinMatch[1] ? pinMatch[1].toUpperCase() : null;
        const examProducts = payflex.getExamProducts();

        if (!exam) {
          let msg = `🎓 *Clarion Exam Result Checker PINs*\n\nAvailable PINs:\n`;
          for (const [k, v] of Object.entries(examProducts)) {
            msg += `👉 *PIN ${k}* — ₦${v.sellPrice.toLocaleString()} (${v.name})\n`;
          }
          msg += `\nReply *PIN WAEC* or *PIN NECO* to purchase directly from your wallet balance.`;
          return sock.sendMessage(from, { text: msg });
        }

        const product = examProducts[exam];
        const balance = await wallet.getBalance(from);
        if (balance >= product.sellPrice) {
          await sock.sendMessage(from, { text: `⏳ *Processing ${product.name}...*\nDeducting ₦${product.sellPrice.toLocaleString()} from your Clarion Wallet.` });
          try {
            await wallet.recordPurchaseDebit(from, product.sellPrice, `Exam PIN: ${product.name}`, { examType: exam, price: product.sellPrice });
            const result = await payflex.purchaseExamPin(exam);
            const newBal = (balance - product.sellPrice).toFixed(2);
            return sock.sendMessage(from, {
              text: `🎓 *${product.name} Purchased Successfully!*\n\n` +
                `🔑 *PIN:* \`${result.pin}\`\n` +
                `🔢 *Serial:* \`${result.serialNumber}\`\n` +
                `💰 *Amount:* ₦${product.sellPrice.toLocaleString()}\n` +
                `💳 *Paid via:* Clarion Wallet\n` +
                `🪙 *Remaining Balance:* ₦${newBal}`
            });
          } catch (err) {
            logger.error('Error vending exam pin to partner:', err.message);
            return sock.sendMessage(from, { text: `❌ Exam PIN purchase failed: ${err.message}. Your balance was not deducted.` });
          }
        } else {
          return sock.sendMessage(from, {
            text: `⚠️ *Insufficient Wallet Balance*\n\nYour balance is *₦${balance.toFixed(2)}*, but ${product.name} costs *₦${product.sellPrice.toLocaleString()}*.\n\nFund your wallet by transferring to:\n🏦 *Bank:* ${userData.virtualAccount?.bankName || CENTRAL_HUB_ACCOUNT.bankName}\n🔢 *Account:* ${userData.virtualAccount?.accountNumber || CENTRAL_HUB_ACCOUNT.accountNumber}`
          });
        }
      }

      // ── Existing COMPLETED state commands ──────────────────
      // ── MENU / PORTAL command → Clarion Master Portal (Screen 1) ───
      else if (command.toLowerCase() === 'menu' || command.toLowerCase() === 'portal' || command.toLowerCase() === '.data') {
        await saveUser({ ...userData, state: STATES.PORTAL_MENU });
        return sock.sendMessage(from, { text: getPortalMenuText(userData.stateCode) });
      }
      else if (command.toLowerCase().startsWith('sub ')) {
        const serialId = command.split(' ')[1];
        await sock.sendMessage(from, {
          text: `✅ *Simulated Order Success*\n\nYou just tested ordering Plan #${serialId}.\n\nIn a real scenario, your customer would receive this, pay their unique account, and you would earn profit instantly!`
        });
      }

      // ── CDS APPLY Command ──────────────────────────────────
      else if (/^\.?cds\s+apply(?:\s+(\d+))?(?:\s+(.+))?$/i.test(command)) {
        const match = command.match(/^\.?cds\s+apply(?:\s+(\d+))?(?:\s+(.+))?$/i);
        const amount = match && match[1] ? parseInt(match[1]) : null;
        const details = match && match[2] ? match[2].trim() : null;

        if (!amount || !details) {
          await saveUser({ ...userData, state: STATES.AWAITING_CDS_PROPOSAL_DETAILS });
          return sock.sendMessage(from, {
            text: `📋 *NYSC Community Development Service (CDS) Micro-Grant Application*\n\n` +
              `Clarion's CDS Community Fund sponsors personal and community development projects undertaken by corps members!\n\n` +
              `Please reply with your project details:\n` +
              `👉 *[Amount] [Project Title & Brief Details]*\n\n` +
              `*Example:* 75000 Primary School Science Lab Upgrade\n\n` +
              `_Reply CANCEL at anytime to exit._`
          });
        }

        const rawStateCode = (userData.stateCode || 'NYSC').replace(/[^a-zA-Z0-9]/g, '');
        const proposalId = `CDS-${rawStateCode}-${Math.floor(1000 + Math.random() * 9000)}`;
        const tier = (userData.donationTier || 'MEMBER').toUpperCase();
        const priorityMap = { PIONEER: 100, LORD: 90, MASTER: 70, MEMBER: 50 };
        const priorityScore = priorityMap[tier] || 50;

        const newProposal = {
          id: proposalId,
          proposalId,
          userId: from,
          verifiedName: userData.verifiedName || userData.name || 'Corps Member',
          stateCode: userData.stateCode || 'NYSC',
          donationTier: tier,
          priorityScore,
          grantAmountRequested: amount,
          title: details.split('\n')[0].slice(0, 60),
          description: details,
          status: 'PENDING',
          submittedAt: new Date().toISOString()
        };

        if (db.cdsProposals) {
          await db.cdsProposals.doc(proposalId).set(newProposal).catch(err => {
            logger.warn('Firestore proposal save failed, using memory:', err.message);
          });
        }
        mockCdsProposals.set(proposalId, newProposal);

        return sock.sendMessage(from, {
          text: `✅ *CDS Micro-Grant Proposal Submitted!*\n\n` +
            `🔖 *Tracking ID:* \`${proposalId}\`\n` +
            `💰 *Grant Requested:* ₦${amount.toLocaleString()}\n` +
            `📋 *Project:* ${newProposal.title}\n` +
            `🎖️ *Priority Standing:* ${PARTNERSHIP_TIERS[tier]?.name || tier} (${priorityScore}/100 Priority)\n\n` +
            `_Your proposal has been logged to the Clarion CDS Allocation Board. Type *CDS STATUS* anytime to check review status._`
        });
      }

      // ── CDS STATUS Command ─────────────────────────────────
      else if (/^\.?cds\s+status$/i.test(command)) {
        let userProposals = [];
        if (db.cdsProposals) {
          try {
            const snap = await db.cdsProposals.where('userId', '==', from).get();
            if (!snap.empty) {
              userProposals = snap.docs.map(doc => doc.data());
            }
          } catch (e) { }
        }
        if (userProposals.length === 0 && mockCdsProposals.size > 0) {
          userProposals = Array.from(mockCdsProposals.values()).filter(p => p.userId === from);
        }

        if (userProposals.length === 0) {
          return sock.sendMessage(from, {
            text: `ℹ️ *No CDS Grant Proposals Found*\n\nYou haven't submitted any micro-grant applications yet.\n\nType *CDS APPLY* to submit a project for community funding!`
          });
        }

        let report = `📋 *Your Clarion CDS Micro-Grant Applications:*\n\n`;
        userProposals.forEach(p => {
          const statusIcon = p.status === 'APPROVED' ? '✅ APPROVED' : (p.status === 'REJECTED' ? '❌ NOT APPROVED' : '⏳ UNDER REVIEW');
          report += `🔖 *ID:* \`${p.proposalId || p.id}\`\n` +
            `📌 *Project:* ${p.title}\n` +
            `💰 *Requested:* ₦${Number(p.grantAmountRequested || 0).toLocaleString()}\n` +
            (p.status === 'APPROVED' ? `🎉 *Approved Grant:* ₦${Number(p.approvedAmount || p.grantAmountRequested || 0).toLocaleString()}\n` : '') +
            `🚦 *Status:* ${statusIcon}\n` +
            (p.reviewNotes ? `📝 *Board Notes:* "${p.reviewNotes}"\n` : '') +
            `\n`;
        });
        report += `_Clarion allocates profit to sponsor impactful NYSC Community Development Service projects!_`;
        return sock.sendMessage(from, { text: report });
      }

      // ── IMPACT command ─────────────────────────────────────
      else if (/^\.?impact$/i.test(command)) {
        const totalCds = await wallet.getTotalCdsDonated(from);
        const impact = wallet.getImpactLevel(totalCds);

        const filledBars = Math.round((impact.percentage || 0) / 10);
        const emptyBars = Math.max(0, 10 - filledBars);
        const progressVisual = '▓'.repeat(filledBars) + '░'.repeat(emptyBars);

        const currentBadge = impact.current ? `${impact.current.badge} *${impact.current.title}*` : '🌱 *Community Contributor*';

        let impactMsg = `🏆 *Your NYSC Community Impact Score*\n\n` +
          `${currentBadge}\n` +
          `₦${totalCds.toLocaleString()} pooled to NYSC CDS\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (impact.next) {
          impactMsg += `Next Milestone: ${impact.next.badge} *${impact.next.title}* (₦${impact.next.threshold.toLocaleString()})\n` +
            `${progressVisual} ${impact.percentage}% complete (₦${impact.remaining.toLocaleString()} needed)\n`;
        } else {
          impactMsg += `💎 *Maximum Impact Achieved! NYSC Hero of Service*\n`;
        }

        impactMsg += `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `_Every airtime, data, and exam pin sale automatically contributes to community projects! Type *PROFILE* to view your upgraded ID card._ 🚀`;

        return sock.sendMessage(from, { text: impactMsg });
      }

      // ── PROFILE command ────────────────────────────────────
      else if (/^\.?profile$/i.test(command)) {
        await sock.sendMessage(from, { text: '🎨 Generating your Clarion Franchise Profile Card...' });
        try {
          const totalCds = await wallet.getTotalCdsDonated(from);
          const cardUser = {
            ...userData,
            totalCdsDonated: totalCds,
            phone: userData.phoneNumber || from.split('@')[0]
          };
          const cardBuffer = await mediaGen.generateProfileCard(cardUser);
          return sock.sendMessage(from, {
            image: cardBuffer,
            caption: `🪪 *Clarion Franchise Partner License*\n\n` +
              `👤 *Name:* ${cardUser.verifiedName || cardUser.name || 'Corps Member'}\n` +
              `🎖️ *Tier:* ${cardUser.donationTier || 'MEMBER'}\n` +
              `🏆 *CDS Impact:* ₦${totalCds.toLocaleString()} donated\n\n` +
              `_Save this to your phone and post it on your WhatsApp Status!_`
          });
        } catch (err) {
          logger.error('Error generating profile card for user:', err.message);
          return sock.sendMessage(from, { text: `❌ Could not generate profile card: ${err.message}` });
        }
      }

      // ── KIT / LAUNCH command ───────────────────────────────
      else if (/^\.?(?:kit|launch)$/i.test(command)) {
        const partnerPhone = (userData.phoneNumber || from.split('@')[0]).replace(/[^0-9]/g, '');
        const waPhone = partnerPhone.startsWith('0') ? `234${partnerPhone.substring(1)}` : (partnerPhone.startsWith('234') ? partnerPhone : `234${partnerPhone}`);
        const isSame = checkIsSameNumber(from, partnerPhone);

        let promoText = '';
        if (isSame) {
          promoText = `⚡ *Need Cheap & Fast Data?* 📶\n\n` +
            `I sell MTN, Airtel, Glo & 9mobile data at subsidized rates — instant automated delivery in 20 seconds!\n\n` +
            `👉 *To order right now, just reply to ME right here with:*\n` +
            `*DATA*\n\n` +
            `_Available 24/7 • 100% automated • Works right here on this number!_ 🚀`;
        } else {
          promoText = `⚡ *Need Cheap & Fast Data?* 📶\n\n` +
            `Get MTN, Airtel, Glo & 9mobile data delivered in 20 seconds!\n\n` +
            `👉 *Tap here to order from my 24/7 store line:*\n` +
            `https://wa.me/${waPhone}?text=DATA\n\n` +
            `Or text *DATA* to 0${partnerPhone.slice(-10)}! ⚡\n\n` +
            `_Available 24/7 • Instant automated top-up • Low rates guaranteed!_`;
        }

        await sock.sendMessage(from, { text: promoText });

        try {
          const shareBuffer = await mediaGen.generateShareCard({
            ...userData,
            phone: partnerPhone,
            isSameNumber: isSame
          });

          const captionText = isSame
            ? `📢 *Your Safe Launch Promotional Share Card!*\n\n` +
            `1️⃣ Save this image to your gallery.\n` +
            `2️⃣ Copy the message above.\n` +
            `3️⃣ Post both to your WhatsApp Status!\n\n` +
            `_When your contacts view your status and reply 'DATA', your automated bot takes over and sells data instantly!_ 🚀`
            : `📢 *Your Safe Launch Promotional Share Card!*\n\n` +
            `1️⃣ Save this image to your gallery.\n` +
            `2️⃣ Copy the message above.\n` +
            `3️⃣ Post both to your WhatsApp Status and forward to 20 friends or groups.\n\n` +
            `_When they tap your wa.me link, your bot takes over and sells data automatically!_ 🚀`;

          await sock.sendMessage(from, {
            image: shareBuffer,
            caption: captionText
          });
        } catch (cardErr) {
          logger.error('Error generating share card for KIT command:', cardErr.message);
        }

        return;
      }

      // ── PROMO / GIVEAWAY ENGINE ─────────────────────────────
      else if (/^\.?promo(?:\s+(.+))?$/i.test(command) || /^\.?(?:giveaway|fuel)$/i.test(command)) {
        const promoArgs = command.replace(/^\.?(?:promo|giveaway|fuel)\s*/i, '').trim();
        const balance = await wallet.getBalance(from);
        const activePromo = userData.activePromo;
        const hasActivePromo = activePromo && activePromo.remainingClaims > 0;

        // Subcommand: PROMO CANCEL
        if (/^cancel$/i.test(promoArgs)) {
          if (!hasActivePromo) {
            return sock.sendMessage(from, { text: 'ℹ️ You do not currently have an active promo campaign to cancel.' });
          }
          const refundAmount = activePromo.remainingClaims * (activePromo.costPerClaim || 140);
          if (refundAmount > 0) {
            await wallet.recordPurchaseCredit?.(from, refundAmount, `Promo Refund: ${activePromo.remainingClaims} unclaimed grants`)
              .catch(() => {});
          }
          await saveUser({ ...userData, activePromo: null });
          return sock.sendMessage(from, {
            text: `🛑 *PROMO CAMPAIGN CANCELLED*\n──────────────\n\n· Unclaimed Grants: *${activePromo.remainingClaims}*\n· Refunded to Wallet: *₦${refundAmount.toLocaleString()}*\n· New Balance: *₦${(balance + refundAmount).toLocaleString()}*\n\n_You can launch a new campaign anytime by replying PROMO._`
          });
        }

        // Subcommand: PROMO [sizeMb] [count] (e.g. PROMO 500 5)
        const setupMatch = promoArgs.match(/^(\d+)\s+(\d+)$/);
        if (setupMatch) {
          const sizeMb = parseInt(setupMatch[1], 10);
          const count = parseInt(setupMatch[2], 10);

          if (sizeMb < 100 || sizeMb > 1000) {
            return sock.sendMessage(from, {
              text: `⚠️ *INVALID DATA ALLOCATION*\n──────────────\n\nData size must be between *100MB* and *1,000MB (1.0GB)* per recipient to maintain telecom safety ceilings.`
            });
          }

          if (count < 1 || count > 25) {
            return sock.sendMessage(from, {
              text: `⚠️ *INVALID RECIPIENT COUNT*\n──────────────\n\nRecipient count must be between *1* and *25 people* per campaign batch.`
            });
          }

          // Estimate wholesale cost (~₦0.28 per MB, e.g. 500MB = ₦140)
          const costPerClaim = Math.round(sizeMb * 0.28);
          const totalBudget = costPerClaim * count;

          // Check if eligible for Kickstart Micro-Credit (max ₦500 credit grant, 1-time per partner)
          const isMicroCredit = (balance < totalBudget && !userData.promoCreditClaimed && totalBudget <= 500);

          if (balance < totalBudget && !isMicroCredit) {
            const virtualAcct = userData.virtualAccount || CENTRAL_HUB_ACCOUNT;
            const diff = totalBudget - Math.max(0, balance);
            return sock.sendMessage(from, {
              text: `⚠️ *INSUFFICIENT WALLET BALANCE*\n──────────────\n\nLaunching a *${sizeMb}MB* giveaway for *${count} people* requires *₦${totalBudget.toLocaleString()}*.\n\n· Current Balance: *₦${balance.toFixed(2)}*\n· Shortfall: *₦${diff.toLocaleString()}*\n\n*Top up your wallet to activate:*\n🏦 *Bank:* ${virtualAcct.bankName}\n🔢 *Account:* \`${virtualAcct.accountNumber}\`\n👤 *Name:* ${virtualAcct.accountName || userData.verifiedName}\n\n_Reply PROMO once funded!_`
            });
          }

          // Reserve budget
          const campaignId = `PRM-${Date.now().toString(36).toUpperCase()}`;
          const newPromo = {
            id: campaignId,
            sizeMb,
            totalClaims: count,
            remainingClaims: count,
            costPerClaim,
            budgetReserved: totalBudget,
            isCreditGranted: isMicroCredit,
            createdAt: new Date().toISOString()
          };

          await wallet.recordPurchaseDebit(from, totalBudget, `Promo Budget Reserved ${isMicroCredit ? '(Kickstart Credit)' : ''}: ${sizeMb}MB x ${count} recipients`, { campaignId, sizeMb, count, isMicroCredit });
          
          if (db.users) {
            await db.users.doc(from).collection('promos').doc(campaignId).set(newPromo).catch(() => {});
          }

          const updateFields = { activePromo: newPromo };
          if (isMicroCredit) updateFields.promoCreditClaimed = true;
          await saveUser({ ...userData, ...updateFields });

          // Auto-post dynamic launch status to WhatsApp Status
          sessionManager.dispatchDynamicPromoStatus(userData, newPromo);

          const creditNotice = isMicroCredit
            ? `\n💡 *Kickstart Micro-Credit Activated:* ₦${totalBudget} was issued on credit! As your customers buy data, sales auto-clear the balance.`
            : '';

          return sock.sendMessage(from, {
            text: `🎁 *PROMO CAMPAIGN ACTIVE!* ${isMicroCredit ? '(ON CREDIT)' : ''}\n──────────────\n\n👋 *${userData.verifiedName || userData.name || 'Partner'}*, your launch giveaway is now live!\n\n· Allocation: *${sizeMb}MB* per recipient\n· Total Grants: *${count} recipients*\n· Budget Reserved: *₦${totalBudget.toLocaleString()}*${creditNotice}\n\n*How to distribute:*\n👉 Simply share any contact card or phone number to this chat!\n👉 Or reply *GIFT [phone]* (e.g. *GIFT 08012345678*)\n\n_ProxyBot will vend the data and send the customer an official receipt automatically._ ⚡\n\n──────────────\n· Reply *PROMO CANCEL* to refund remaining budget.`
          });
        }

        // Default: Show promo dashboard / instructions
        if (hasActivePromo) {
          return sock.sendMessage(from, {
            text: `🎁 *CLARION PROMO CONTROL*\n_Reward customers & drive instant repeat sales._\n──────────────\n\nStatus: *ACTIVE CAMPAIGN* 🟢\n· Data Allocation: *${activePromo.sizeMb}MB* per recipient\n· Remaining Grants: *${activePromo.remainingClaims} / ${activePromo.totalClaims}*\n· Budget Reserved: *₦${activePromo.budgetReserved}*\n\n*How to distribute:*\n👉 Share any contact card or type *GIFT [phone]*\n👉 Reply *PROMO CANCEL* to refund unused balance\n\n──────────────\n· Reply *0* for Main Menu`
          });
        }

        const virtualAcct = userData.virtualAccount || CENTRAL_HUB_ACCOUNT;
        return sock.sendMessage(from, {
          text: `🎁 *CLARION PROMO CONTROL*\n_Reward customers & drive instant repeat sales._\n──────────────\n\nStatus: *NO ACTIVE CAMPAIGN* ⚪\nWallet Balance: *₦${balance.toFixed(2)}*\n\n*Launch a Giveaway Campaign:*\n· Data Size: *100MB to 1,000MB* per recipient\n· Recipient Ceiling: *1 to 25 people* per batch\n\n──────────────\n👉 Reply *PROMO 500 5* (Gifts 500MB to 5 people)\n👉 Reply *PROMO 1000 3* (Gifts 1GB to 3 people)\n👉 Reply *PROMO [MB] [recipients]* for custom setup`
        });
      }

      // ── GIFT command (Direct Promo Dispatch & Auto-Receipt) ──
      else if (/^\.?gift\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})(?:\s+(\S+))?$/i.test(command)) {
        const giftMatch = command.match(/^\.?gift\s+(0\d{10}|[1-9]\d{9}|\+?234\d{10})(?:\s+(\S+))?$/i);
        let targetPhone = giftMatch[1];
        if (targetPhone.startsWith('234') && targetPhone.length === 13) {
          targetPhone = '0' + targetPhone.slice(3);
        }
        const planArg = giftMatch[2];
        const network = detectNetwork(targetPhone) || 'mtn';
        const targetJid = targetPhone.startsWith('0') ? `234${targetPhone.slice(1)}@s.whatsapp.net` : `${targetPhone}@s.whatsapp.net`;

        const activePromo = userData.activePromo;
        const hasActivePromo = activePromo && activePromo.remainingClaims > 0;

        let giftSizeMb = hasActivePromo ? activePromo.sizeMb : (planArg ? parseInt(planArg) || 500 : 500);

        // Find best matching plan
        const plans = await payflex.getAvailablePlans();
        const networkPlans = plans.filter(p => p.network.toLowerCase().includes(network.toLowerCase()));
        let matchedPlan = networkPlans.find(p => p.name.toLowerCase().includes(`${giftSizeMb}mb`)) ||
                          networkPlans.find(p => p.name.toLowerCase().includes('500mb')) ||
                          networkPlans[0];

        if (!matchedPlan) {
          return sock.sendMessage(from, { text: `❌ No matching data plan found for ${network.toUpperCase()}.` });
        }

        const balance = await wallet.getBalance(from);

        // If not using active promo reserve, check wallet balance
        if (!hasActivePromo) {
          if (balance < matchedPlan.basePrice) {
            return sock.sendMessage(from, {
              text: `⚠️ *Insufficient Wallet Balance to Gift Data*\n\n` +
                `Gifting *${matchedPlan.name}* costs *₦${matchedPlan.basePrice}* wholesale, but your balance is *₦${balance.toFixed(2)}*.\n\n` +
                `Launch a promo campaign by replying *PROMO 500 5* or fund your wallet.`
            });
          }
        }

        await sock.sendMessage(from, { text: `⏳ Dispensing promotional gift of *${matchedPlan.name}* to *${targetPhone}* (${network.toUpperCase()})...` });

        try {
          // If not active promo, debit wallet now
          if (!hasActivePromo) {
            await wallet.recordPurchaseDebit(from, matchedPlan.basePrice, `Promo Gift: ${matchedPlan.name} to ${targetPhone}`, { targetPhone, planName: matchedPlan.name });
          }

          // Dispense data
          await payflex.dispenseData(targetPhone, matchedPlan.serial);

          // Check if target is a returning contact or new contact
          let isReturning = false;
          if (db.users) {
            try {
              const contactDoc = await db.users.doc(from).collection('contacts').doc(targetJid).get();
              if (contactDoc.exists) isReturning = true;
            } catch (e) {}
          }

          // Record / update contact
          if (db.users) {
            await db.users.doc(from).collection('contacts').doc(targetJid).set({
              phone: targetPhone,
              lastSeen: new Date().toISOString(),
              lastPromoDelivered: new Date().toISOString()
            }, { merge: true }).catch(() => {});
          }

          const partnerName = userData.verifiedName || userData.name || 'Your Partner';
          const brandName = userData.brandName || ('Clarion AI - ' + partnerName);
          const orderId = Date.now().toString(36).toUpperCase();

          // Prepare Context-Aware Customer Receipt
          const customerReceipt = !isReturning
            ? `🎉 *SPECIAL GIFT FROM ${partnerName}!*
──────────────

👋 Hello! You have been gifted *${giftSizeMb}MB Free Data* on behalf of *${brandName}*.

*Digital Voucher Receipt:*
· Reference: \`#PRM-${orderId}\`
· Package: \`${giftSizeMb}MB Instant Data\`
· Cost to You: *₦0 (100% Free)*
· Status: \`DELIVERED ✅\`

_This gift has been delivered directly to your line with no deductions or catch._

──────────────
*Need affordable data anytime?*
👉 Reply *DATA* to view all network plans.
👉 Reply *DATA 1000* to see plans for ₦1,000.`
            : `🎁 *CUSTOMER APPRECIATION REWARD*
──────────────

👋 Thank you for choosing *${brandName}*!

You’ve just been awarded *${giftSizeMb}MB Free Data*:

· Voucher Ref: \`#PRM-${orderId}\`
· Package: \`${giftSizeMb}MB High-Speed Data\`
· Status: \`DELIVERED ✅\`

──────────────
*Ready to top up your line?*
👉 Reply *DATA* for instant 24/7 delivery.
👉 Reply *DATA 2000* to view ₦2,000 plans.`;

          // Send receipt via ProxyBot to the customer!
          await sessionManager.sendProxyCustomerMessage(from, targetJid, customerReceipt);

          // Update promo claims if active
          let remainingNote = '';
          if (hasActivePromo) {
            activePromo.remainingClaims -= 1;
            if (activePromo.remainingClaims <= 0) {
              activePromo.status = 'COMPLETED';
              await saveUser({ ...userData, activePromo: null });
              remainingNote = `\n🎉 *All ${activePromo.totalClaims} promo grants have now been delivered!*`;
            } else {
              await saveUser({ ...userData, activePromo });
              remainingNote = `\n· Remaining Grants: *${activePromo.remainingClaims} left*`;
            }
            sessionManager.dispatchDynamicPromoStatus(userData, activePromo);
          }

          return sock.sendMessage(from, {
            text: `🎁 *PROMO DATA GIFT DELIVERED!* ✅\n──────────────\n\n· Recipient: *${targetPhone}* (${network.toUpperCase()})\n· Package: *${matchedPlan.name}*\n· Customer Receipt: *Dispatched automatically via ProxyBot* ⚡${remainingNote}\n\n_Your customer just experienced your 20-second automated delivery firsthand!_ 🚀`
          });
        } catch (giftErr) {
          logger.error('Error vending promo gift:', giftErr.message);
          return sock.sendMessage(from, { text: `❌ Gift delivery failed: ${giftErr.message}.` });
        }
      }

      // ── Contact Card / Shared Number Handler in COMPLETED state ──
      else if (userData.state === STATES.COMPLETED) {
        const vcard = msg.message?.contactMessage?.vcard || msg.message?.contactsArrayMessage?.contacts?.[0]?.vcard;
        let detectedPhone = null;
        if (vcard) {
          const waidMatch = vcard.match(/waid=(\d+)/i);
          const telMatch = vcard.match(/TEL[^:]*:([+0-9\s-]+)/i);
          detectedPhone = waidMatch ? waidMatch[1] : (telMatch ? telMatch[1].replace(/[^0-9]/g, '') : null);
        } else {
          const cleanCmd = command.replace(/[\s-]/g, '');
          if (/^(?:0|\+?234)[789][01]\d{8}$/.test(cleanCmd) &&
              !cleanCmd.toLowerCase().startsWith('check') &&
              !cleanCmd.toLowerCase().startsWith('order') &&
              !cleanCmd.toLowerCase().startsWith('gift') &&
              !cleanCmd.toLowerCase().startsWith('promo')) {
            detectedPhone = cleanCmd;
          }
        }

        if (detectedPhone) {
          if (detectedPhone.startsWith('234') && detectedPhone.length === 13) {
            detectedPhone = '0' + detectedPhone.slice(3);
          }
          const net = detectNetwork(detectedPhone) || 'mtn';
          const hasActiveClaims = userData.activePromo?.remainingClaims > 0;

          let cardMsg = `👤 *CONTACT DETECTED: ${detectedPhone}*\n` +
            `_Network: ${net.toUpperCase()}_\n` +
            `──────────────\n\n`;

          if (hasActiveClaims) {
            cardMsg += `🎁 *GIVEAWAY AVAILABLE (${userData.activePromo.remainingClaims} remaining):*\n` +
              `Reply *GIFT ${detectedPhone}* to deliver *${userData.activePromo.sizeMb}MB* with an automated digital receipt! ⚡\n\n`;
          }

          cardMsg += `*Quick Store Commands:*\n` +
            `· Reply *CHECK ${detectedPhone.slice(0, 4)} 1GB* to view retail plans\n` +
            `· Reply *ORDER 1GB ${detectedPhone}* to create an order invoice\n\n` +
            `──────────────\n` +
            `· Reply *0* for Main Menu`;

          return sock.sendMessage(from, { text: cardMsg });
        }
      }
    }

  } catch (error) {
    logger.error('Mother Bot Error:', error);
  }
};

/**
 * Checks if an updated CDS donation crosses an impact milestone.
 * Dispatches congratulatory message and an updated Profile Card to the partner.
 */
export const handleMilestoneCheck = async (userId, previousCdsTotal, newCdsTotal, userData = null) => {
  try {
    const crossed = wallet.checkMilestone(previousCdsTotal, newCdsTotal);
    if (!crossed) return null;

    logger.info(`[MILESTONE] User ${userId} crossed milestone: ${crossed.title} (₦${crossed.threshold})`);

    const sock = sessionManager.motherSock;
    const targetJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;

    let user = userData;
    if (!user && db.users) {
      try {
        const doc = await db.users.doc(userId).get();
        if (doc.exists) user = doc.data();
      } catch (e) {
        logger.warn(`Could not fetch user doc for milestone check: ${e.message}`);
      }
    }
    if (!user) {
      user = mockUserStore.get(userId) || { uid: userId, name: 'Corps Member', totalCdsDonated: newCdsTotal };
    }
    user.totalCdsDonated = newCdsTotal;

    const congratsText = `🎉 *CONGRATULATIONS CORPS MEMBER!* 🏆\n\n` +
      `You just unlocked a new community impact milestone:\n` +
      `🎖️ *${crossed.badge} ${crossed.title}*!\n\n` +
      `Your automated sales have contributed over *₦${crossed.threshold.toLocaleString()}* directly into the NYSC Community Development Fund.\n\n` +
      `_Here is your upgraded Clarion Franchise ID Card featuring your new honor:_`;

    if (sock) {
      await sock.sendMessage(targetJid, { text: congratsText });
      try {
        const cardBuffer = await mediaGen.generateProfileCard(user);
        await sock.sendMessage(targetJid, {
          image: cardBuffer,
          caption: `🪪 *Official Clarion Franchise License — ${crossed.badge} ${crossed.title}*\nTotal CDS Contributed: ₦${newCdsTotal.toLocaleString()}`
        });
      } catch (imgErr) {
        logger.error('Error generating milestone profile card image:', imgErr.message);
      }
    }

    return crossed;
  } catch (error) {
    logger.error('Error handling milestone check:', error);
    return null;
  }
};
