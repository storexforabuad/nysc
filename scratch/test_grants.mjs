async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/grants/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Test Student',
        institution: 'University of Lagos (UNILAG)',
        courseAndLevel: 'Computer Engineering (400L)',
        phone: '08123456789',
        network: 'MTN',
        purpose: 'Final year thesis research on distributed systems.'
      })
    });
    const data = await res.json();
    console.log('Grant apply response:', data);

    const getRes = await fetch('http://localhost:3000/api/admin/grants');
    const getData = await getRes.json();
    console.log('Admin grants response count:', getData.grants ? getData.grants.length : 'none');
  } catch (err) {
    console.error('Test error:', err.message);
  }
}

test();

