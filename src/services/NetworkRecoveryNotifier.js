import { db } from './firebase.js';
import { logger } from '../config/env.js';
import sessionManager from '../bot/SessionManager.js';

class NetworkRecoveryNotifier {
  constructor() {
    // In-memory cooldown tracker: contactId -> timestamp
    this.alertHistory = new Map();
    this.cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Scans for customers with existing wallet balances and alerts them
   * that network services are healthy and available.
   */
  async scanAndNotify(network = 'MTN') {
    if (!db.users) {
      logger.warn('[RECOVERY-NOTIFIER] Firestore users collection unavailable.');
      return { alerted: 0, skipped: 0 };
    }

    let alerted = 0;
    let skipped = 0;
    const normalizedNet = (network || 'MTN').toUpperCase();

    try {
      const usersSnap = await db.users.get();
      if (usersSnap.empty) return { alerted: 0, skipped: 0 };

      for (const userDoc of usersSnap.docs) {
        const partnerUid = userDoc.id;
        const contactsSnap = await db.users.doc(partnerUid).collection('contacts').get();

        for (const cDoc of contactsSnap.docs) {
          const contact = cDoc.data();
          const balance = contact.walletBalance || 0;

          if (balance <= 0) continue;

          const contactId = cDoc.id;
          const lastAlert = this.alertHistory.get(contactId) || contact.lastRecoveryAlertAt;

          if (lastAlert && (Date.now() - new Date(lastAlert).getTime()) < this.cooldownMs) {
            skipped++;
            continue;
          }

          const targetJid = contactId.includes('@') ? contactId : `${contactId}@s.whatsapp.net`;
          const msg = `🟢 *Network Alert: ${normalizedNet} is Healthy!*\n\n` +
            `Good news! The ${normalizedNet} network service is running smoothly at top speed.\n\n` +
            `💰 You still have *₦${balance.toLocaleString()}* in your Clarion Wallet balance.\n\n` +
            `Reply *DATA* to instantly use your balance without making a new transfer!`;

          if (sessionManager.motherSock) {
            try {
              await sessionManager.motherSock.sendMessage(targetJid, { text: msg });
              alerted++;
              this.alertHistory.set(contactId, new Date().toISOString());

              // Update contact in Firestore
              await db.users.doc(partnerUid).collection('contacts').doc(contactId).set({
                lastRecoveryAlertAt: new Date().toISOString()
              }, { merge: true }).catch(() => {});

              logger.info(`[RECOVERY-NOTIFIER] Sent recovery alert to ${targetJid} (₦${balance})`);
            } catch (err) {
              logger.warn(`[RECOVERY-NOTIFIER] Failed to send message to ${targetJid}: ${err.message}`);
            }
          } else {
            skipped++;
          }
        }
      }

      logger.info(`[RECOVERY-NOTIFIER] Scan complete: ${alerted} alerted, ${skipped} skipped.`);
      return { alerted, skipped };
    } catch (err) {
      logger.error('[RECOVERY-NOTIFIER] Scan error:', err.message);
      return { alerted, skipped, error: err.message };
    }
  }
}

export default new NetworkRecoveryNotifier();
