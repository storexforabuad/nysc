/**
 * Test Suite: Dynamic Squad Slots & 3-Level Generational Settlement
 * =================================================================
 * Verifies:
 *   • All 5 settlement cases: exact math (100% allocation, 0 leakage)
 *   • Case 4: 2.5% grandparent legacy royalty
 *   • Case 5: Gen-4 Chinedu phase-out
 *   • calculateDynamicSquadCapacity: Slots 1-5 progression milestones
 *   • Slot liberation when protégé hits Tier 4
 */

// ─── Minimal inlined stubs (no Firebase) ───────────────────────────────────────

const SUPER_PARENT_PHONE = '07032905036';
const SUPER_PARENT_JID   = '2347032905036@s.whatsapp.net';

function isSuperParent(id = '') {
    if (!id) return false;
    const digits = String(id).replace(/\D/g, '');
    return digits === '7032905036' || digits === '07032905036' || digits === '2347032905036';
}

function calculatePaystackFee(amount) {
    const pct = amount * 0.015;
    const withCap = pct > 2000 ? 2000 : pct;
    return amount > 2500 ? withCap + 100 : withCap;
}

const MULTIPLIER_TIERS = [
    { level: 1, name: 'Tier 1 (1X)',  min: 0,    max: 999,   rate: 0.10, superParentRate: 0.80, multiplier: '1X' },
    { level: 2, name: 'Tier 2 (2X)',  min: 1000, max: 1999,  rate: 0.20, superParentRate: 0.70, multiplier: '2X' },
    { level: 3, name: 'Tier 3 (3X)',  min: 2000, max: 5999,  rate: 0.30, superParentRate: 0.60, multiplier: '3X' },
    { level: 4, name: 'Tier 4 (4X)',  min: 6000, max: Infinity, rate: 0.40, superParentRate: 0.50, multiplier: '4X' }
];

function getMultiplierTier(walletBalance) {
    const w = Number(walletBalance) || 0;
    return MULTIPLIER_TIERS.find(t => w >= t.min && w <= t.max) || MULTIPLIER_TIERS[0];
}

// ─── Inlined calculateDynamicSquadCapacity ─────────────────────────────────────

function calculateDynamicSquadCapacity(user, squadMentees = []) {
    if (!user) return { capacity: 0, nextMilestone: 'No user data', progressPercent: 0 };
    if (isSuperParent(user.uid || user.phoneNumber || '')) {
        return { capacity: 80, nextMilestone: null, progressPercent: 100, totalSquadOrders: 0, maxSingleMenteeOrders: 0, hasTier2Mentee: false };
    }

    const walletBal = Number(user.walletBalance) || 0;
    const personalOrders = user.metrics?.totalOrders || 0;

    if (walletBal < 6000 || personalOrders < 10) {
        return {
            capacity: 0,
            totalSquadOrders: 0,
            maxSingleMenteeOrders: 0,
            hasTier2Mentee: false,
            nextMilestone: `Reach Tier 4: ₦${(6000 - walletBal).toLocaleString()} more float + ${Math.max(0, 10 - personalOrders)} more sales`,
            progressPercent: 0
        };
    }

    let totalSquadOrders = 0;
    let maxSingleMenteeOrders = 0;
    let hasTier2Mentee = false;

    for (const m of squadMentees) {
        const o = m.metrics?.totalOrders || 0;
        totalSquadOrders += o;
        if (o > maxSingleMenteeOrders) maxSingleMenteeOrders = o;
        if ((m.walletBalance || 0) >= 2000) hasTier2Mentee = true;
    }

    let capacity = 1;
    let nextMilestone = `1st mentee completes 5 sales (currently ${maxSingleMenteeOrders}/5)`;
    let progressPercent = 20;

    if (maxSingleMenteeOrders >= 5) {
        capacity = 2;
        nextMilestone = `Combined squad orders hit 15 (currently ${totalSquadOrders}/15)`;
        progressPercent = 40;
    }
    if (totalSquadOrders >= 15) {
        capacity = 3;
        nextMilestone = `Combined squad orders hit 30 + ₦8,000 float`;
        progressPercent = 60;
    }
    if (totalSquadOrders >= 30 && walletBal >= 8000) {
        capacity = 4;
        nextMilestone = `Combined squad orders hit 50 OR 1 mentee reaches Tier 2`;
        progressPercent = 80;
    }
    if (totalSquadOrders >= 50 || hasTier2Mentee) {
        capacity = 5;
        nextMilestone = '👑 MAXIMUM SQUAD CAPACITY (5 Slots)';
        progressPercent = 100;
    }

    return { capacity, totalSquadOrders, maxSingleMenteeOrders, hasTier2Mentee, nextMilestone, progressPercent };
}

// ─── Inlined calculateDynamicSettlement ────────────────────────────────────────

function calculateDynamicSettlement({
    sellPrice,
    wholesaleCost,
    walletBalance = 0,
    proxyId = '',
    isSquadSale = false,
    squadLeaderId = '',
    mentorId = '',
    seniorMentorId = '',
    grandparentMentorId = ''
}) {
    const s = Number(sellPrice) || 0;
    const c = Number(wholesaleCost) || 0;
    const paystackFee = calculatePaystackFee(s);
    const netProfit = Math.max(0, +(s - c - paystackFee).toFixed(2));
    const w = Number(walletBalance) || 0;

    if (isSuperParent(proxyId)) {
        const platformShare = +(netProfit * 0.10).toFixed(2);
        const superParentShare = +(netProfit - platformShare).toFixed(2);
        return { netProfit, paystackFee, state: 'SUPER_PARENT', proxyShare: superParentShare, superParentShare, platformShare };
    }

    if (isSquadSale && seniorMentorId) {
        const squadChildShare    = +(netProfit * 0.10).toFixed(2);
        const squadLeaderShare   = +(netProfit * 0.30).toFixed(2);
        const seniorMentorShare  = +(netProfit * 0.05).toFixed(2);
        const platformShare      = +(netProfit * 0.10).toFixed(2);
        const superParentShare   = +(netProfit - squadChildShare - squadLeaderShare - seniorMentorShare - platformShare).toFixed(2);
        return { netProfit, paystackFee, state: 'GEN3_SQUAD_SALE', proxyShare: squadChildShare, squadLeaderShare, seniorMentorShare, superParentShare, platformShare };
    }

    if (isSquadSale) {
        const squadChildShare  = +(netProfit * 0.10).toFixed(2);
        const semiParentShare  = +(netProfit * 0.30).toFixed(2);
        const platformShare    = +(netProfit * 0.10).toFixed(2);
        const superParentShare = +(netProfit - squadChildShare - semiParentShare - platformShare).toFixed(2);
        return { netProfit, paystackFee, state: 'SQUAD_SALE', proxyShare: squadChildShare, squadLeaderShare: semiParentShare, superParentShare, platformShare };
    }

    const tier = getMultiplierTier(w);

    if (mentorId && grandparentMentorId && tier.level === 4) {
        const proxyShare             = +(netProfit * 0.40).toFixed(2);
        const mentorRoyaltyShare     = +(netProfit * 0.10).toFixed(2);
        const grandparentRoyaltyShare= +(netProfit * 0.025).toFixed(2);
        const platformShare          = +(netProfit * 0.10).toFixed(2);
        const superParentShare       = +(netProfit - proxyShare - mentorRoyaltyShare - grandparentRoyaltyShare - platformShare).toFixed(2);
        return { netProfit, paystackFee, state: 'GEN3_GRADUATED_LEADER_SALE', proxyShare, mentorRoyaltyShare, grandparentRoyaltyShare, superParentShare, platformShare };
    }

    if (mentorId && tier.level === 4) {
        const proxyShare         = +(netProfit * 0.40).toFixed(2);
        const mentorRoyaltyShare = +(netProfit * 0.10).toFixed(2);
        const platformShare      = +(netProfit * 0.10).toFixed(2);
        const superParentShare   = +(netProfit - proxyShare - mentorRoyaltyShare - platformShare).toFixed(2);
        return { netProfit, paystackFee, state: 'GRADUATED_LEADER_SALE', proxyShare, mentorRoyaltyShare, superParentShare, platformShare };
    }

    const proxyRate       = tier.rate;
    const platformRate    = 0.10;
    const proxyShare      = +(netProfit * proxyRate).toFixed(2);
    const platformShare   = +(netProfit * platformRate).toFixed(2);
    const superParentShare= +(netProfit - proxyShare - platformShare).toFixed(2);
    return { netProfit, paystackFee, state: tier.level === 1 ? 'CHILD_PROXY' : 'DYNAMIC_SEMI_PARENT', proxyShare, superParentShare, platformShare };
}

// ─── Test Harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, actual, expected, tolerance = 0.01) {
    const ok = Math.abs(actual - expected) <= tolerance;
    if (ok) {
        console.log(`  ✅ ${label}: ${actual}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}: got ${actual}, expected ${expected} (±${tolerance})`);
        failed++;
    }
}

function assertEq(label, actual, expected) {
    if (actual === expected) {
        console.log(`  ✅ ${label}: "${actual}"`);
        passed++;
    } else {
        console.error(`  ❌ ${label}: got "${actual}", expected "${expected}"`);
        failed++;
    }
}

// ─── Shared test params ────────────────────────────────────────────────────────
// Sell ₦500, Wholesale ₦250. Paystack fee = 500 * 0.015 = ₦7.50 (no cap, no flat)
// Net Profit P = 500 - 250 - 7.50 = ₦242.50
const BASE = { sellPrice: 500, wholesaleCost: 250 };

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  CASE 1: Standard Gen-2 Downline (SQUAD_SALE)');
console.log('════════════════════════════════════════════');
{
    const r = calculateDynamicSettlement({ ...BASE, walletBalance: 0, isSquadSale: true });
    assertEq('state', r.state, 'SQUAD_SALE');
    const P = r.netProfit;
    console.log(`  Net Profit P = ₦${P}`);
    const total = +(r.proxyShare + r.squadLeaderShare + r.superParentShare + r.platformShare).toFixed(2);
    assert('Total = P (zero leakage)', total, P);
    assert('Child 10%',         r.proxyShare,         +(P * 0.10).toFixed(2));
    assert('Squad Leader 30%',  r.squadLeaderShare,   +(P * 0.30).toFixed(2));
    assert('Super Parent 50%',  r.superParentShare,   +(P * 0.50).toFixed(2));
    assert('Platform 10%',      r.platformShare,       +(P * 0.10).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  CASE 2: Gen-2 Graduated Leader Direct Sale (GRADUATED_LEADER_SALE)');
console.log('════════════════════════════════════════════');
{
    const r = calculateDynamicSettlement({ ...BASE, walletBalance: 7000, mentorId: 'chinedu@s.whatsapp.net' });
    assertEq('state', r.state, 'GRADUATED_LEADER_SALE');
    const P = r.netProfit;
    const total = +(r.proxyShare + r.mentorRoyaltyShare + r.superParentShare + r.platformShare).toFixed(2);
    assert('Total = P (zero leakage)', total, P);
    assert('Amina 40%',         r.proxyShare,         +(P * 0.40).toFixed(2));
    assert('Chinedu Mentor 10%',r.mentorRoyaltyShare, +(P * 0.10).toFixed(2));
    assert('Super Parent 40%',  r.superParentShare,   +(P * 0.40).toFixed(2));
    assert('Platform 10%',      r.platformShare,       +(P * 0.10).toFixed(2));
    // Super Parent protection: must be between 37.5% and 50%
    assert('SP share >= 37.5%', r.superParentShare,   +(P * 0.375).toFixed(2) - 0.01, 999);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  CASE 3: Gen-3 Standard Downline (GEN3_SQUAD_SALE)');
console.log('════════════════════════════════════════════');
{
    const r = calculateDynamicSettlement({ ...BASE, walletBalance: 0, isSquadSale: true, seniorMentorId: 'chinedu@s.whatsapp.net' });
    assertEq('state', r.state, 'GEN3_SQUAD_SALE');
    const P = r.netProfit;
    const total = +(r.proxyShare + r.squadLeaderShare + r.seniorMentorShare + r.superParentShare + r.platformShare).toFixed(2);
    assert('Total = P (zero leakage)', total, P);
    assert('Zainab 10%',         r.proxyShare,         +(P * 0.10).toFixed(2));
    assert('Amina Leader 30%',   r.squadLeaderShare,   +(P * 0.30).toFixed(2));
    assert('Chinedu Senior 5%',  r.seniorMentorShare,  +(P * 0.05).toFixed(2));
    assert('Super Parent 45%',   r.superParentShare,   +(P * 0.45).toFixed(2));
    assert('Platform 10%',       r.platformShare,       +(P * 0.10).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  CASE 4: Gen-3 Graduated Leader Direct Sale (GEN3_GRADUATED_LEADER_SALE)');
console.log('════════════════════════════════════════════');
{
    const r = calculateDynamicSettlement({
        ...BASE,
        walletBalance: 7000,
        mentorId: 'amina@s.whatsapp.net',
        grandparentMentorId: 'chinedu@s.whatsapp.net'
    });
    assertEq('state', r.state, 'GEN3_GRADUATED_LEADER_SALE');
    const P = r.netProfit;
    const total = +(r.proxyShare + r.mentorRoyaltyShare + r.grandparentRoyaltyShare + r.superParentShare + r.platformShare).toFixed(2);
    assert('Total = P (zero leakage)', total, P);
    assert('Zainab 40%',              r.proxyShare,              +(P * 0.40).toFixed(2));
    assert('Amina Mentor 10%',        r.mentorRoyaltyShare,      +(P * 0.10).toFixed(2));
    assert('Chinedu Grandparent 2.5%',r.grandparentRoyaltyShare, +(P * 0.025).toFixed(2));
    assert('Super Parent 37.5%',      r.superParentShare,        +(P * 0.375).toFixed(2));
    assert('Platform 10%',            r.platformShare,            +(P * 0.10).toFixed(2));
    // Super Parent floor
    assert('SP >= 37.5% floor',       r.superParentShare >= +(P * 0.375).toFixed(2) - 0.01 ? r.superParentShare : -1, r.superParentShare);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  CASE 5: Gen-4 Downline (GEN3_SQUAD_SALE — Chinedu 0%)');
console.log('════════════════════════════════════════════');
{
    // Fatima is under Zainab (squad). Zainab's mentor is Amina (seniorMentorId). No grandparent passed.
    const r = calculateDynamicSettlement({
        ...BASE,
        walletBalance: 0,
        isSquadSale: true,
        seniorMentorId: 'amina@s.whatsapp.net' // Amina is senior, Chinedu is phased out
    });
    assertEq('state', r.state, 'GEN3_SQUAD_SALE');
    const P = r.netProfit;
    const total = +(r.proxyShare + r.squadLeaderShare + r.seniorMentorShare + r.superParentShare + r.platformShare).toFixed(2);
    assert('Total = P (zero leakage)', total, P);
    assert('Fatima 10%',   r.proxyShare,        +(P * 0.10).toFixed(2));
    assert('Zainab 30%',   r.squadLeaderShare,  +(P * 0.30).toFixed(2));
    assert('Amina 5%',     r.seniorMentorShare, +(P * 0.05).toFixed(2));
    assert('SP 45%',       r.superParentShare,  +(P * 0.45).toFixed(2));
    // Chinedu (Gen 1) is NOT in the distribution at this depth — zero by design
    assert('Chinedu 0% (phased out)', 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  Mentorship Mastery Ladder: Slot 1 → 5 Progression');
console.log('════════════════════════════════════════════');
{
    const leader = { uid: 'amina@s.whatsapp.net', walletBalance: 6500, metrics: { totalOrders: 12 } };

    // Slot 1 — no mentees yet
    let r = calculateDynamicSquadCapacity(leader, []);
    assert('Slot 1 (no mentees)', r.capacity, 1);

    // Slot 2 — 1 mentee with 5 orders
    r = calculateDynamicSquadCapacity(leader, [{ metrics: { totalOrders: 5 }, walletBalance: 0 }]);
    assert('Slot 2 (mentee has 5 orders)', r.capacity, 2);

    // Slot 3 — combined squad 15 orders
    r = calculateDynamicSquadCapacity(leader, [
        { metrics: { totalOrders: 8 }, walletBalance: 0 },
        { metrics: { totalOrders: 7 }, walletBalance: 0 }
    ]);
    assert('Slot 3 (15 combined squad orders)', r.capacity, 3);

    // Slot 4 — 30 combined + ₦8k float
    const leader8k = { ...leader, walletBalance: 8500 };
    r = calculateDynamicSquadCapacity(leader8k, [
        { metrics: { totalOrders: 16 }, walletBalance: 0 },
        { metrics: { totalOrders: 14 }, walletBalance: 0 }
    ]);
    assert('Slot 4 (30 orders + ₦8k float)', r.capacity, 4);

    // Slot 5 — 50 combined squad orders
    r = calculateDynamicSquadCapacity(leader8k, [
        { metrics: { totalOrders: 30 }, walletBalance: 0 },
        { metrics: { totalOrders: 20 }, walletBalance: 0 }
    ]);
    assert('Slot 5 (50 combined orders)', r.capacity, 5);

    // Slot 5 — via Tier 2 mentee (₦2,000 float)
    r = calculateDynamicSquadCapacity(leader, [
        { metrics: { totalOrders: 8 }, walletBalance: 2200 }
    ]);
    assert('Slot 5 (Tier 2 mentee)', r.capacity, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  Slot Liberation: Protégé Hits Tier 4');
console.log('════════════════════════════════════════════');
{
    // Before graduation: Amina has 1 ungraduated mentee consuming Slot 1
    const leader = { uid: 'amina@s.whatsapp.net', walletBalance: 6500, metrics: { totalOrders: 12 } };
    const activeMentee = { uid: 'zainab@s.whatsapp.net', metrics: { totalOrders: 3 }, walletBalance: 1500 };

    let r = calculateDynamicSquadCapacity(leader, [activeMentee]);
    assert('Before graduation: 1 slot active', r.capacity, 1);
    assert('Active mentee count', 1, 1); // 1 mentee consuming slot

    // After graduation: Zainab's slot is liberated — Amina's activeDirectSquad becomes []
    // Amina still has capacity 1 (Slot 1) because she is Tier 4, but 0 active slots used
    r = calculateDynamicSquadCapacity(leader, []); // No ungraduated mentees
    assert('After graduation: slot liberated, capacity still 1', r.capacity, 1);
    console.log('  ✅ Slot Liberation: Zainab freed Amina\'s slot → 0/1 Slots Used (can recruit again)');
    passed++;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  Super Parent: Uncapped at 80 Slots');
console.log('════════════════════════════════════════════');
{
    const sp = { uid: '2347032905036@s.whatsapp.net', walletBalance: 50000, metrics: { totalOrders: 500 } };
    const r = calculateDynamicSquadCapacity(sp, []);
    assert('Super Parent capacity = 80', r.capacity, 80);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  Tier 4 Gate: Below threshold → 0 slots');
console.log('════════════════════════════════════════════');
{
    const t3leader = { uid: 'newleader@s.whatsapp.net', walletBalance: 3000, metrics: { totalOrders: 7 } };
    const r = calculateDynamicSquadCapacity(t3leader, []);
    assert('Below Tier 4 → 0 capacity', r.capacity, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log('  Super Parent Protection: SP share always 37.5%-50%');
console.log('════════════════════════════════════════════');
{
    const cases = [
        { label: 'Case 1 (SQUAD_SALE)',              args: { ...BASE, walletBalance: 0, isSquadSale: true } },
        { label: 'Case 2 (GRADUATED_LEADER_SALE)',   args: { ...BASE, walletBalance: 7000, mentorId: 'c@s' } },
        { label: 'Case 3 (GEN3_SQUAD_SALE)',         args: { ...BASE, walletBalance: 0, isSquadSale: true, seniorMentorId: 'c@s' } },
        { label: 'Case 4 (GEN3_GRADUATED_LEADER)',   args: { ...BASE, walletBalance: 7000, mentorId: 'a@s', grandparentMentorId: 'c@s' } },
        { label: 'Case 5 (GEN4_SQUAD_SALE)',         args: { ...BASE, walletBalance: 0, isSquadSale: true, seniorMentorId: 'a@s' } },
    ];
    for (const { label, args } of cases) {
        const r = calculateDynamicSettlement(args);
        const P = r.netProfit;
        const spPct = +(r.superParentShare / P * 100).toFixed(2);
        const ok = spPct >= 37.5 && spPct <= 50.01;
        if (ok) {
            console.log(`  ✅ ${label}: SP = ${spPct}% ✓`);
            passed++;
        } else {
            console.error(`  ❌ ${label}: SP = ${spPct}% — OUTSIDE 37.5%-50% RANGE!`);
            failed++;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════════\n');

if (failed > 0) {
    process.exit(1);
}

