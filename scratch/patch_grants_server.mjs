import fs from 'fs';

let content = fs.readFileSync('src/server.js', 'utf8');

const targetWaitlistEnd = `  // ── OrbitVTU Direct Buy: Paystack Checkout Session ──`;

const grantEndpoints = `  // In-memory student grant submissions cache
  const grantSubmissions = [];

  // ── OrbitVTU Student Research Data Grant Application ──
  app.post('/api/grants/apply', apiLimiter, async (req, res) => {
    try {
      const { fullName, institution, courseAndLevel, phone, network, purpose } = req.body;
      if (!fullName || !institution || !phone) {
        return res.status(400).json({ success: false, error: 'Full name, institution, and phone are required' });
      }

      const grantEntry = {
        id: \`grant_\${Date.now()}_\${Math.random().toString(36).substring(2, 6)}\`,
        fullName: String(fullName).trim(),
        institution: String(institution).trim(),
        courseAndLevel: String(courseAndLevel || '').trim(),
        phone: String(phone).trim(),
        network: String(network || 'MTN').trim().toUpperCase(),
        purpose: String(purpose || '').trim(),
        appliedAt: new Date().toISOString(),
        status: 'PENDING_REVIEW'
      };

      if (db.grantApplications) {
        await db.grantApplications.doc(grantEntry.id).set(grantEntry).catch((err) => {
          logger.warn('Failed to persist grant application to Firestore:', err.message);
        });
      }

      grantSubmissions.unshift(grantEntry);
      if (grantSubmissions.length > 500) grantSubmissions.pop();

      logger.info(\`[DATA-GRANT] New applicant: \${grantEntry.fullName} (\${grantEntry.institution}) - \${grantEntry.phone}\`);
      res.json({ success: true, grantId: grantEntry.id });
    } catch (err) {
      logger.error('Error in /api/grants/apply:', err);
      res.status(500).json({ success: false, error: err.message || 'Application submission failed' });
    }
  });

  // ── Admin: Get Student Data Grants ──
  app.get('/api/admin/grants', apiLimiter, async (req, res) => {
    try {
      let results = [];
      if (db.grantApplications) {
        const snap = await db.grantApplications.orderBy('appliedAt', 'desc').limit(100).get().catch(() => null);
        if (snap && !snap.empty) {
          results = snap.docs.map(d => d.data());
        }
      }

      if (results.length === 0) {
        results = grantSubmissions;
      }

      res.json({ success: true, grants: results });
    } catch (err) {
      logger.error('Error in /api/admin/grants:', err);
      res.status(500).json({ success: false, error: err.message, grants: grantSubmissions });
    }
  });

  // ── OrbitVTU Direct Buy: Paystack Checkout Session ──`;

if (!content.includes('/api/grants/apply')) {
  content = content.replace(targetWaitlistEnd, grantEndpoints);
  fs.writeFileSync('src/server.js', content, 'utf8');
  console.log('Successfully added /api/grants/apply and /api/admin/grants to server.js');
} else {
  console.log('Grant endpoints already exist in server.js');
}

