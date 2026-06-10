import admin from 'firebase-admin';
import { db } from './src/services/firebase.js';

async function clearCache() {
    console.log("Connecting to Firestore to clear old plans_cache...");
    try {
        const snapshot = await db.plansCache.get();
        if (snapshot.empty) {
            console.log("No cached plans found.");
            return;
        }

        console.log(`Found ${snapshot.size} plans. Deleting...`);
        const batch = db.plansCache.firestore.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log("Successfully wiped old plans cache!");
    } catch (err) {
        console.error("Failed:", err);
    } finally {
        process.exit(0);
    }
}

clearCache();
