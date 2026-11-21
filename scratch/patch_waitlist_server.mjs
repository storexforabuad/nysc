import fs from 'fs';

let content = fs.readFileSync('src/server.js', 'utf8');

// In-memory waitlist cache fallback
const targetStart = `  // ── OrbitVTU Direct Buy: Paystack Checkout Session ──`;

const waitlistEndpoints = `  // In-memory waitlist cache
  const waitlistSubmissions = [];

  // ── OrbitVTU Reseller Waitlist Registration ──
  app.post('/api/waitlist/register', apiLimiter, async (req, res) => {
    try {
      const { businessName, contact, campus } = req.body;
      if (!businessName || !contact) {
        return res.status(400).json({ success: false, error: 'businessName and contact are required' });
      }

      const entry = {
        id: \`wait_\${Date.now()}_\${Math.random().toString(36).substring(2, 6)}\`,
        businessName: String(businessName).trim(),
        contact: String(contact).trim(),
        campus: campus ? String(campus).trim() : null,
        registeredAt: new Date().toISOString(),
        status: 'PRIORITY_WAITLIST'
      };

      if (db.waitlist) {
        await db.waitlist.doc(entry.id).set(entry).catch((err) => {
          logger.warn('Failed to persist waitlist to Firestore:', err.message);
        });
      }

      waitlistSubmissions.unshift(entry);
      if (waitlistSubmissions.length > 500) waitlistSubmissions.pop();

      logger.info(\`[WAITLIST] New prospective reseller: \${entry.businessName} (\${entry.contact})\`);
      res.json({ success: true, entry, totalWaitlisted: waitlistSubmissions.length });
    } catch (err) {
      logger.error('Error in /api/waitlist/register:', err);
      res.status(500).json({ success: false, error: err.message || 'Waitlist registration failed' });
    }
  });

  // ── Admin: Get Reseller Waitlist ──
  app.get('/api/admin/waitlist', apiLimiter, async (req, res) => {
    try {
      let results = [];
      if (db.waitlist) {
        const snap = await db.waitlist.orderBy('registeredAt', 'desc').limit(100).get().catch(() => null);
        if (snap && !snap.empty) {
          results = snap.docs.map(d => d.data());
        }
      }

      if (results.length === 0) {
        results = waitlistSubmissions;
      }

      res.json({ success: true, waitlist: results });
    } catch (err) {
      logger.error('Error in /api/admin/waitlist:', err);
      res.status(500).json({ success: false, error: err.message, waitlist: waitlistSubmissions });
    }
  });

  // ── OrbitVTU Direct Buy: Paystack Checkout Session ──`;

if (!content.includes('/api/waitlist/register')) {
  content = content.replace(targetStart, waitlistEndpoints);
  fs.writeFileSync('src/server.js', content, 'utf8');
  console.log('Successfully added /api/waitlist/register and /api/admin/waitlist to server.js');
} else {
  console.log('Waitlist endpoints already exist in server.js');
}

