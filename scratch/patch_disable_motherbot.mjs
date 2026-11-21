import fs from 'fs';

const filePath = 'src/server.js';
let s = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const target = `      // Initialize Bots in the background so they don't block the preview
      (async () => {
        try {
          await sessionManager.initMotherBot();
          startWeeklyReportJob();
          startWalletYieldReportJob();
          startStatusPostJob();
          startSubscriptionReminderJob();
          startThursdayPromotionJob();
          initDailyMerchantReportJob();
          broadcastQueue.start();`;

const replacement = `      // Initialize Bots in the background so they don't block the preview
      (async () => {
        try {
          if (process.env.ENABLE_MOTHER_BOT === 'true') {
            await sessionManager.initMotherBot();
            startWeeklyReportJob();
            startWalletYieldReportJob();
            startStatusPostJob();
            startSubscriptionReminderJob();
            startThursdayPromotionJob();
            initDailyMerchantReportJob();
            broadcastQueue.start();
          } else {
            logger.info('MotherBot WhatsApp QR disabled (ENABLE_MOTHER_BOT=false). Webhooks, API & Landing page fully active.');
          }`;

if (s.includes(target)) {
  s = s.replace(target, replacement);
  fs.writeFileSync(filePath, s, 'utf8');
  console.log('Successfully patched server.js with ENABLE_MOTHER_BOT toggle!');
} else {
  console.error('Target not found in server.js');
}

