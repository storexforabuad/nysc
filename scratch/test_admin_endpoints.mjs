async function testAdminEndpoints() {
  const token = 'clarion_admin_super_secret_token_123'; // Let's check what token is used in AdminLogin
  const endpoints = [
    '/api/admin/scale-advisor',
    '/api/admin/metrics',
    '/api/admin/partners',
    '/api/admin/withdrawals/pending',
    '/api/admin/status-captions',
    '/api/admin/waitlist',
    '/api/admin/grants',
    '/api/admin/broadcasts/partners?tier=all',
    '/api/admin/broadcasts/history',
    '/api/admin/cds-proposals',
    '/api/admin/pitches',
    '/api/admin/merch-designs'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch('http://localhost:3000' + ep, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const text = await res.text();
      let isJson = false;
      try { JSON.parse(text); isJson = true; } catch {}
      console.log(`${res.status} ${ep} (isJson: ${isJson}, len: ${text.length})`);
      if (res.status !== 200) {
        console.log(`   --> Response: ${text.slice(0, 120)}`);
      }
    } catch (err) {
      console.log(`ERR ${ep}: ${err.message}`);
    }
  }
}

testAdminEndpoints();

