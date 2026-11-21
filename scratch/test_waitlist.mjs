async function testWaitlist() {
  try {
    const res = await fetch('http://localhost:3000/api/waitlist/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: 'Clarion Prime Reseller',
        contact: '08098765432',
        campus: 'UNILAG Akoka'
      })
    });
    const data = await res.json();
    console.log('Waitlist register response:', data);

    const getRes = await fetch('http://localhost:3000/api/admin/waitlist');
    const getData = await getRes.json();
    console.log('Admin waitlist response count:', getData.waitlist ? getData.waitlist.length : 'none');
  } catch (err) {
    console.error('Waitlist test error:', err.message);
  }
}

testWaitlist();

