import admin, { db } from './firebase.js';
import { logger } from '../config/env.js';

const DEFAULT_CAPTIONS = {
  mtn: 'Fast • Reliable • Affordable',
  airtel: 'Fast • Reliable • Affordable',
  glo: 'Fast • Reliable • Affordable',
  '9mobile': 'Fast • Reliable • Affordable',
  receipt: 'Trusted proxybot social proof.'
};

function getFirestore() {
  if (db.users?.firestore) return db.users.firestore;
  if (admin && typeof admin.firestore === 'function') {
    try {
      return admin.firestore();
    } catch (err) {
      logger.warn('Could not initialize Firestore in CaptionService:', err.message);
    }
  }
  return null;
}

class CaptionService {
  async getStatusCaptions() {
    const firestore = getFirestore();
    if (!firestore) return DEFAULT_CAPTIONS;

    try {
      const snapshot = await firestore.collection('status_captions').get();
      const captions = { ...DEFAULT_CAPTIONS };
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data && data.caption) {
          captions[doc.id] = data.caption;
        }
      });
      return captions;
    } catch (error) {
      logger.error('Error reading status captions:', error.message);
      return DEFAULT_CAPTIONS;
    }
  }

  async updateStatusCaptions(captions) {
    const firestore = getFirestore();
    if (!firestore) {
      logger.warn('Firestore unavailable, status captions not persisted.');
      return false;
    }

    try {
      const batch = firestore.batch();
      for (const [key, caption] of Object.entries(captions)) {
        const ref = firestore.collection('status_captions').doc(key);
        batch.set(ref, { caption }, { merge: true });
      }
      await batch.commit();
      return true;
    } catch (error) {
      logger.error('Error updating status captions:', error.message);
      return false;
    }
  }
}

export default new CaptionService();
