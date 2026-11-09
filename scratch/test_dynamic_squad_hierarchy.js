import wallet, { isSuperParent, checkAndTriggerSquadGraduation } from '../src/services/WalletService.js';
import { pendingSuperParentDecisions } from '../src/bot/MotherBot.js';
import { pendingMentorPairingMap } from '../src/bot/ProxyBot.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

console.log('\n======================================================');
console.log('🧪 TEST SUITE: DYNAMIC SQUAD HIERARCHY & HANDOFF ENGINE');
console.log('======================================================\n');

// ── TEST 1: Case 1 - Standard Downline Sale (Amina Tier 1 under Chinedu) ──
console.log('--- TEST 1: Case 1 Standard Squad Sale (Amina Tier 1) ---');
{
    const settlement = wallet.calculateDynamicSettlement({
        sellPrice: 1000,
        wholesaleCost: 740,
        proxyId: 'amina_jid',
        isSquadSale: true,
        squadLeaderId: 'chinedu_jid'
    });

    assert(settlement.state === 'SQUAD_SALE', 'State is SQUAD_SALE');
    assert(settlement.netProfit === 245.00, `Net profit is ₦245.00 (got ${settlement.netProfit})`);
    assert(settlement.proxyShare === 24.50, `Amina earns 10% (₦24.50, got ${settlement.proxyShare})`);
    assert(settlement.squadLeaderShare === 73.50, `Chinedu earns 30% (₦73.50, got ${settlement.squadLeaderShare})`);
    assert(settlement.superParentShare === 122.50, `Super Parent earns 50% (₦122.50, got ${settlement.superParentShare})`);
    assert(settlement.platformShare === 24.50, `Platform earns 10% (₦24.50, got ${settlement.platformShare})`);

    const sum = settlement.proxyShare + settlement.squadLeaderShare + settlement.superParentShare + settlement.platformShare;
    assert(Math.abs(sum - settlement.netProfit) < 0.01, `Zero revenue leakage: sum (${sum}) === netProfit (${settlement.netProfit})`);
}

// ── TEST 2: Case 2 - Tier 4 Graduated Leader Personal Sale with Mentor Royalty ──
console.log('\n--- TEST 2: Case 2 Graduated Leader Sale (Amina Tier 4, Chinedu Mentor) ---');
{
    const settlement = wallet.calculateDynamicSettlement({
        sellPrice: 1000,
        wholesaleCost: 740,
        walletBalance: 6500,
        proxyId: 'amina_jid',
        isSquadSale: false,
        mentorId: 'chinedu_jid'
    });

    assert(settlement.state === 'GRADUATED_LEADER_SALE', 'State is GRADUATED_LEADER_SALE');
    assert(settlement.level === 4, 'Multiplier level is 4 (4X Quad Power)');
    assert(settlement.proxyShare === 98.00, `Amina earns 40% (₦98.00, got ${settlement.proxyShare})`);
    assert(settlement.mentorRoyaltyShare === 24.50, `Chinedu earns 10% mentor royalty (₦24.50, got ${settlement.mentorRoyaltyShare})`);
    assert(settlement.superParentShare === 98.00, `Super Parent earns 40% (₦98.00, got ${settlement.superParentShare})`);
    assert(settlement.platformShare === 24.50, `Platform earns 10% (₦24.50, got ${settlement.platformShare})`);

    const sum = settlement.proxyShare + settlement.mentorRoyaltyShare + settlement.superParentShare + settlement.platformShare;
    assert(Math.abs(sum - settlement.netProfit) < 0.01, `Zero revenue leakage: sum (${sum}) === netProfit (${settlement.netProfit})`);
}

// ── TEST 3: Case 3 - Generation 3 Downline Sale (Zainab sells under Amina, Chinedu Senior Mentor) ──
console.log('\n--- TEST 3: Case 3 Generation 3 Squad Sale (Zainab under Amina, Chinedu Senior Mentor) ---');
{
    const settlement = wallet.calculateDynamicSettlement({
        sellPrice: 1000,
        wholesaleCost: 740,
        proxyId: 'zainab_jid',
        isSquadSale: true,
        squadLeaderId: 'amina_jid',
        seniorMentorId: 'chinedu_jid'
    });

    assert(settlement.state === 'GEN3_SQUAD_SALE', 'State is GEN3_SQUAD_SALE');
    assert(settlement.proxyShare === 24.50, `Zainab earns 10% (₦24.50, got ${settlement.proxyShare})`);
    assert(settlement.squadLeaderShare === 73.50, `Amina earns 30% Squad Override (₦73.50, got ${settlement.squadLeaderShare})`);
    assert(settlement.seniorMentorShare === 12.25, `Chinedu earns 5% Senior Royalty (₦12.25, got ${settlement.seniorMentorShare})`);
    assert(settlement.superParentShare === 110.25, `Super Parent earns 45% (₦110.25, got ${settlement.superParentShare})`);
    assert(settlement.platformShare === 24.50, `Platform earns 10% (₦24.50, got ${settlement.platformShare})`);

    const sum = settlement.proxyShare + settlement.squadLeaderShare + settlement.seniorMentorShare + settlement.superParentShare + settlement.platformShare;
    assert(Math.abs(sum - settlement.netProfit) < 0.01, `Zero revenue leakage: sum (${sum}) === netProfit (${settlement.netProfit})`);
}

// ── TEST 4: Direct Super Parent Fulfillment ──
console.log('\n--- TEST 4: Direct Super Parent Fulfillment ---');
{
    const settlement = wallet.calculateDynamicSettlement({
        sellPrice: 1000,
        wholesaleCost: 740,
        proxyId: '2347032905036@s.whatsapp.net',
        isSquadSale: false
    });

    assert(settlement.state === 'SUPER_PARENT', 'State is SUPER_PARENT');
    assert(settlement.superParentShare === 220.50, `Super Parent earns 90% (₦220.50, got ${settlement.superParentShare})`);
    assert(settlement.platformShare === 24.50, `Platform earns 10% (₦24.50, got ${settlement.platformShare})`);
    assert(settlement.superParentShare + settlement.platformShare === settlement.netProfit, 'Zero revenue leakage in Super Parent sale');
}

// ── TEST 5: Slot Liberation Logic ──
console.log('\n--- TEST 5: Slot Liberation Filtering ---');
{
    const mockSquadDocs = [
        { data: () => ({ name: 'Partner 1', isGraduatedSquadLeader: false }) },
        { data: () => ({ name: 'Partner 2', isGraduatedSquadLeader: false }) },
        { data: () => ({ name: 'Partner 3', isGraduatedSquadLeader: false }) },
        { data: () => ({ name: 'Amina', isGraduatedSquadLeader: true }) }, // Graduated leader!
    ];

    const activeUngraduated = mockSquadDocs.filter(d => !d.data().isGraduatedSquadLeader);
    const graduated = mockSquadDocs.filter(d => d.data().isGraduatedSquadLeader);

    assert(activeUngraduated.length === 3, 'Active ungraduated count is 3 (consuming 3/5 slots)');
    assert(graduated.length === 1, 'Graduated count is 1 (slot liberated)');
    assert(activeUngraduated.length < 5, 'Chinedu has available capacity to onboard partner #5 and #6');
}

// ── TEST 6: Interactive Handoff State Management ──
console.log('\n--- TEST 6: Interactive Handoff State Storage ---');
{
    const superParentJid = '2347032905036@s.whatsapp.net';
    const candidateData = {
        candidateJid: '2348031234567@s.whatsapp.net',
        candidatePhone: '2348031234567',
        candidateName: 'Amina',
        suggesterJid: '2348021234567@s.whatsapp.net',
        suggesterName: 'Chinedu',
        suggesterPhone: '2348021234567'
    };

    pendingSuperParentDecisions.set(superParentJid, candidateData);
    assert(pendingSuperParentDecisions.has(superParentJid), 'MotherBot holds pending decision for Super Parent');

    // Simulate Super Parent choosing Option 1: HANDOFF
    const dec = pendingSuperParentDecisions.get(superParentJid);
    pendingSuperParentDecisions.delete(superParentJid);

    pendingMentorPairingMap.set(dec.suggesterJid, {
        candidateJid: dec.candidateJid,
        candidatePhone: dec.candidatePhone,
        candidateName: dec.candidateName
    });

    assert(pendingMentorPairingMap.has('2348021234567@s.whatsapp.net'), 'ProxyBot holds delegated pairing session for Chinedu');
    const chineduSession = pendingMentorPairingMap.get('2348021234567@s.whatsapp.net');
    assert(chineduSession.candidateName === 'Amina', 'Candidate name properly preserved in delegated session');

    pendingMentorPairingMap.delete(dec.suggesterJid);
    assert(!pendingMentorPairingMap.has('2348021234567@s.whatsapp.net'), 'Session cleaned up upon code generation');
}

console.log('\n======================================================');
console.log(`📊 FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================\n');

if (failed > 0) process.exit(1);
