import { db } from './firebase.js';
import { logger } from '../config/env.js';
import admin from 'firebase-admin';

class ContactBackupService {
  /**
   * Sanitizes phone number to standard formats.
   * Returns null if input is an internal WhatsApp group ID (120363...) or non-phone.
   */
  normalizePhone(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    if (str.endsWith('@g.us') || str.endsWith('@lid') || str.endsWith('@newsletter') || str.endsWith('@broadcast')) {
      return null;
    }
    let clean = str.replace(/\D/g, '');
    // WhatsApp group JIDs start with 120363 or are 15+ digits
    if (clean.startsWith('120363') || clean.length > 14 || clean.length < 10) {
      return null;
    }
    if (clean.startsWith('234') && clean.length === 13) {
      return { phone: '0' + clean.slice(3), jid: `${clean}@s.whatsapp.net` };
    }
    if (clean.length === 11 && clean.startsWith('0')) {
      return { phone: clean, jid: `234${clean.slice(1)}@s.whatsapp.net` };
    }
    if (clean.length === 10) {
      return { phone: '0' + clean, jid: `234${clean}@s.whatsapp.net` };
    }
    return { phone: clean, jid: `${clean}@s.whatsapp.net` };
  }

  /**
   * Generates standard vCard 3.0 content from contact array
   */
  generateVcf(contacts, storeName = 'Clarion Partner') {
    let vcf = '';
    for (const c of contacts) {
      const name = c.name || c.pushName || `Customer (${c.phone || 'Contact'})`;
      const phone = c.phone.startsWith('0') ? `+234${c.phone.slice(1)}` : `+${c.phone}`;
      vcf += 'BEGIN:VCARD\r\n';
      vcf += 'VERSION:3.0\r\n';
      vcf += `FN:${name}\r\n`;
      vcf += `TEL;TYPE=CELL:${phone}\r\n`;
      vcf += `NOTE:Clarion AI Customer - ${storeName}\r\n`;
      vcf += 'END:VCARD\r\n';
    }
    return vcf;
  }

  /**
   * Generates CSV format from contact array
   */
  generateCsv(contacts) {
    let csv = 'Name,Phone,WhatsApp JID,Source,Date Added\r\n';
    for (const c of contacts) {
      const name = (c.name || c.pushName || 'Customer').replace(/"/g, '""');
      const phone = c.phone || '';
      const jid = c.jid || '';
      const source = c.source || 'WhatsApp Sync';
      const date = c.createdAt || new Date().toISOString();
      csv += `"${name}","${phone}","${jid}","${source}","${date}"\r\n`;
    }
    return csv;
  }

  /**
   * Gathers all contacts for a given proxy from Firestore and active socket/memory.
   * Auto-purges corrupt group IDs (120363...) from Firestore.
   */
  async gatherContacts(uid, sock = null) {
    const contactMap = new Map();

    // 1. Fetch from Firestore contacts subcollection
    if (db.users && uid) {
      try {
        const snap = await db.users.doc(uid).collection('contacts').get();
        for (const doc of snap.docs) {
          const d = doc.data() || {};
          const rawId = doc.id;
          const rawPhone = d.phone || rawId;

          // Auto-purge group JIDs or corrupt IDs from Firestore
          if (rawId.endsWith('@g.us') || rawId.endsWith('@lid') || rawId.startsWith('120363') || (rawPhone && String(rawPhone).startsWith('120363')) || String(rawPhone).length > 14) {
            try {
              doc.ref.delete().catch(() => {});
            } catch (e) {}
            continue;
          }

          const normalized = this.normalizePhone(rawPhone);
          if (!normalized) {
            try { doc.ref.delete().catch(() => {}); } catch (e) {}
            continue;
          }

          const { phone, jid } = normalized;
          contactMap.set(phone, {
            phone,
            jid,
            name: d.pushName || d.name || d.verifiedName || `Customer (${phone})`,
            source: d.syncedFromWhatsApp ? 'WhatsApp Sync' : d.totalSpent ? 'Customer Order' : 'Saved Contact',
            createdAt: d.introducedAt || d.createdAt || new Date().toISOString()
          });
        }
      } catch (err) {
        logger.warn(`[BACKUP] Error fetching contacts subcollection for ${uid}: ${err.message}`);
      }

      // 2. Fetch past orders to capture all customers who ever bought from this store
      try {
        if (db.ledger) {
          const orderSnap = await db.ledger.where('userId', '==', uid).limit(500).get();
          orderSnap.forEach(doc => {
            const o = doc.data() || {};
            const rawPhone = o.buyerPhone || o.customerPhone;
            if (rawPhone) {
              const normalized = this.normalizePhone(rawPhone);
              if (normalized && !contactMap.has(normalized.phone)) {
                contactMap.set(normalized.phone, {
                  phone: normalized.phone,
                  jid: normalized.jid,
                  name: `Customer (${normalized.phone})`,
                  source: 'Customer Order',
                  createdAt: o.createdAt || new Date().toISOString()
                });
              }
            }
          });
        }
      } catch (err) {
        logger.warn(`[BACKUP] Error fetching past orders for ${uid}: ${err.message}`);
      }
    }

    // 3. Fallback: Include store owner / parent phone
    if (db.users && uid) {
      try {
        const userDoc = await db.users.doc(uid).get();
        if (userDoc.exists) {
          const u = userDoc.data();
          if (u.phoneNumber) {
            const { phone, jid } = this.normalizePhone(u.phoneNumber);
            if (phone && !contactMap.has(phone)) {
              contactMap.set(phone, {
                phone,
                jid,
                name: u.verifiedName || u.name || 'Store Owner',
                source: 'Store Profile',
                createdAt: new Date().toISOString()
              });
            }
          }
        }
      } catch (e) {}
    }

    return Array.from(contactMap.values());
  }

  /**
   * Executes a full backup: Gathers contacts, updates count, generates VCF and CSV
   */
  async executeBackup(uid, sock = null, storeName = 'Clarion Partner') {
    const contacts = await this.gatherContacts(uid, sock);
    const vcf = this.generateVcf(contacts, storeName);
    const csv = this.generateCsv(contacts);

    // Save total count and backup metadata back to user doc
    if (db.users && uid) {
      try {
        await db.users.doc(uid).set({
          contactsCount: contacts.length,
          lastContactsBackupAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        logger.warn(`[BACKUP] Failed to update user metadata for ${uid}: ${e.message}`);
      }
    }

    return {
      contacts,
      count: contacts.length,
      vcf,
      csv
    };
  }
}

export default new ContactBackupService();
