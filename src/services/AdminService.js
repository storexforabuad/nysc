import os from 'os';
import { db } from './firebase.js';
import { logger } from '../config/env.js';
import wallet from './WalletService.js';
import sessionManager from '../bot/SessionManager.js';

// In-memory store fallback for proposals if Firestore is offline
export const mockCdsProposals = new Map();

class AdminService {
    /**
     * Aggregates global system metrics from the ledger
     */
    async getSystemMetrics() {
        if (!db.ledger) {
            logger.warn('Firestore ledger unavailable for admin metrics.');
            return { totalSystemProfit: 0, totalCDSProfit: 0, dailyVolume: 0, grossVolume: 0 };
        }

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isoToday = today.toISOString();

            const snap = await db.ledger
                .where('type', '==', 'COMPLETED_DATA')
                .where('status', '==', 'COMPLETED')
                .get();

            let totalSystemProfit = 0;
            let totalCDSProfit = 0;
            let dailyVolume = 0;
            let grossVolume = 0;

            snap.forEach(doc => {
                const data = doc.data();
                totalSystemProfit += data.settlement?.systemShare || 0;
                totalCDSProfit += data.settlement?.cdsShare || 0;
                grossVolume += data.amount || 0;

                if (data.createdAt >= isoToday) {
                    dailyVolume++;
                }
            });

            return {
                totalSystemProfit: +totalSystemProfit.toFixed(2),
                totalCDSProfit: +totalCDSProfit.toFixed(2),
                dailyVolume,
                grossVolume: +grossVolume.toFixed(2)
            };
        } catch (error) {
            logger.error('Error generating admin system metrics:', error.message);
            return { totalSystemProfit: 0, totalCDSProfit: 0, dailyVolume: 0, grossVolume: 0 };
        }
    }

    /**
     * Counts active ProxyBots based on recent interactions
     */
    async getActiveBotCount() {
        if (!db.users) return 0;
        try {
            const snap = await db.users.get();
            const activePartners = snap.docs.filter(doc => doc.data().virtualAccount);
            return activePartners.length;
        } catch (error) {
            logger.error('Error getting active bot count:', error.message);
            return 0;
        }
    }

    /**
     * Real-Time VPS Scale Advisor:
     * Evaluates active bot sockets, local system RAM, projected TrueHost hosting tier,
     * and financial breakeven health.
     */
    async getScaleAdvisorMetrics() {
        const activeBots = await this.getActiveBotCount();
        const metrics = await this.getSystemMetrics();

        // Target TrueHost VPS Tier Configuration
        let plan = {
            tierName: 'TrueHost Cloud VPS 2 (Entry Tier)',
            vCpu: '1 Core',
            ramMb: 2048,
            maxBots: 20,
            monthlyCostNgn: 11000,
            nextTier: 'TrueHost Cloud VPS 3 (Growth Tier — 4GB RAM @ ₦17,622/mo)'
        };

        if (activeBots > 60) {
            plan = {
                tierName: 'TrueHost Cloud VPS 4 (Pod Unit Tier)',
                vCpu: '4 Cores',
                ramMb: 8192,
                maxBots: 125,
                monthlyCostNgn: 36666,
                nextTier: 'Distributed Sharded Pod (Pod #2)'
            };
        } else if (activeBots > 20) {
            plan = {
                tierName: 'TrueHost Cloud VPS 3 (Growth Tier)',
                vCpu: '2 Cores',
                ramMb: 4096,
                maxBots: 60,
                monthlyCostNgn: 17622,
                nextTier: 'TrueHost Cloud VPS 4 (Pod Unit — 8GB RAM @ ₦36,666/mo)'
            };
        }

        // Local Process Telemetry
        const processMemoryRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        const estimatedSocketRamMb = Math.round((activeBots * 55) + 90); // ~55MB per Baileys socket + 90MB baseline
        const projectedRamPercent = Math.min(100, Math.round((estimatedSocketRamMb / plan.ramMb) * 100));
        const capacityPercent = Math.min(100, Math.round((activeBots / plan.maxBots) * 100));

        // Self-Funding / Breakeven Health
        const netProfit = metrics.totalSystemProfit || 0;
        const profitSurplus = +(netProfit - plan.monthlyCostNgn).toFixed(2);
        const isSelfFunded = profitSurplus >= 0;

        // Dynamic Scale Advisory Banner State
        let scaleStatus = 'OPTIMAL';
        let badgeColor = 'green';
        let advisorMessage = `🟢 System Status: Optimal. Capacity headroom at ${Math.max(0, 100 - capacityPercent)}%. Current load fits comfortably within ${plan.tierName} (₦${plan.monthlyCostNgn.toLocaleString()}/mo).`;

        if (activeBots >= 120) {
            scaleStatus = 'CRITICAL';
            badgeColor = 'red';
            advisorMessage = `🔴 Pod Saturated: Current node hosts ${activeBots} bots (maximum limit 125). Provision Pod #2 on TrueHost VPS 4 to balance incoming traffic.`;
        } else if (capacityPercent >= 80 || activeBots >= 16) {
            scaleStatus = 'WARNING';
            badgeColor = 'yellow';
            advisorMessage = `🟡 Scale Alert: ${activeBots}/${plan.maxBots} bots active. Threshold reached: Ready for in-place upgrade to ${plan.nextTier}.`;
        }

        return {
            environment: 'Localhost Sandbox (TrueHost Projected)',
            activeBots,
            maxCapacity: plan.maxBots,
            capacityPercent,
            currentPlan: plan.tierName,
            planVcpu: plan.vCpu,
            planRamMb: plan.ramMb,
            planMonthlyCostNgn: plan.monthlyCostNgn,
            nextPlan: plan.nextTier,
            processMemoryRssMb,
            estimatedSocketRamMb,
            projectedRamPercent,
            scaleStatus,
            badgeColor,
            advisorMessage,
            financials: {
                monthlyGrossVolume: metrics.grossVolume || 0,
                monthlyPlatformProfit: metrics.totalSystemProfit || 0,
                totalCdsPoolAvailable: metrics.totalCDSProfit || 0,
                hostingCostNgn: plan.monthlyCostNgn,
                profitSurplus,
                isSelfFunded
            }
        };
    }

    /**
     * Fetches all CDS micro-grant proposals
     */
    async listCdsProposals() {
        let proposals = [];

        if (db.cdsProposals) {
            try {
                const snap = await db.cdsProposals.get();
                if (!snap.empty) {
                    proposals = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }
            } catch (err) {
                logger.warn('Firestore error reading cds_proposals:', err.message);
            }
        }

        if (proposals.length === 0 && mockCdsProposals.size > 0) {
            proposals = Array.from(mockCdsProposals.values());
        }

        // Sort: Pioneer/Lord priority first, then newest
        return proposals.sort((a, b) => {
            const prioDiff = (b.priorityScore || 50) - (a.priorityScore || 50);
            if (prioDiff !== 0) return prioDiff;
            return new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime();
        });
    }

    /**
     * Review and decide on a CDS micro-grant proposal (Approve or Reject)
     */
    async decideCdsProposal(proposalId, decision, approvedAmount = 0, reviewNotes = '') {
        const normalizedDecision = (decision || '').toUpperCase();
        if (normalizedDecision !== 'APPROVED' && normalizedDecision !== 'REJECTED') {
            throw new Error('Invalid decision. Must be APPROVED or REJECTED');
        }

        let proposalData = null;

        if (db.cdsProposals) {
            try {
                const docRef = db.cdsProposals.doc(proposalId);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    proposalData = docSnap.data();
                    const updates = {
                        status: normalizedDecision,
                        approvedAmount: normalizedDecision === 'APPROVED' ? Number(approvedAmount || proposalData.grantAmountRequested || 0) : 0,
                        reviewNotes: reviewNotes || '',
                        decidedAt: new Date().toISOString()
                    };
                    await docRef.update(updates);
                    proposalData = { ...proposalData, ...updates, id: proposalId };
                }
            } catch (err) {
                logger.warn('Firestore update failed for cds proposal, using memory:', err.message);
            }
        }

        if (!proposalData && mockCdsProposals.has(proposalId)) {
            const existing = mockCdsProposals.get(proposalId);
            const updates = {
                status: normalizedDecision,
                approvedAmount: normalizedDecision === 'APPROVED' ? Number(approvedAmount || existing.grantAmountRequested || 0) : 0,
                reviewNotes: reviewNotes || '',
                decidedAt: new Date().toISOString()
            };
            proposalData = { ...existing, ...updates };
            mockCdsProposals.set(proposalId, proposalData);
        }

        if (!proposalData) {
            throw new Error(`Proposal with ID ${proposalId} not found`);
        }

        // Automated WhatsApp notification dispatch via MotherBot
        if (proposalData.userId && sessionManager.motherSock) {
            try {
                const destinationJid = proposalData.userId.includes('@') ? proposalData.userId : `${proposalData.userId}@s.whatsapp.net`;
                let msgText = '';

                if (normalizedDecision === 'APPROVED') {
                    msgText = `🎉 *Congratulations! Your NYSC CDS Micro-Grant Has Been Approved!*\n\n` +
                        `📋 *Project:* ${proposalData.title || 'Community Development Service'}\n` +
                        `💰 *Approved Grant:* ₦${proposalData.approvedAmount.toLocaleString()}\n` +
                        `🎖️ *Applicant:* ${proposalData.verifiedName || 'Corps Member'} (${proposalData.stateCode || 'NYSC'})\n\n` +
                        `📝 *Remarks from Clarion CDS Review Board:*\n"${reviewNotes || 'Approved for community impact.'}"\n\n` +
                        `_Our CDS disbursements team will reach out to facilitate the direct project grant disbursement._`;
                } else {
                    msgText = `📋 *Clarion CDS Grant Application Update*\n\n` +
                        `Project: *${proposalData.title || 'Community Development Service'}*\n` +
                        `Status: *Not Approved at this time*\n\n` +
                        `📝 *Review Board Feedback:*\n"${reviewNotes || 'Does not meet current grant criteria.'}"\n\n` +
                        `_Thank you for your service and dedication to community development!_`;
                }

                await sessionManager.motherSock.sendMessage(destinationJid, { text: msgText });
                logger.info(`Dispatched CDS decision notification to ${destinationJid}`);
            } catch (notifyErr) {
                logger.warn(`Could not dispatch WhatsApp notification for proposal ${proposalId}: ${notifyErr.message}`);
            }
        }

        return proposalData;
    }

    /**
     * Fetches all partners and their current wallet balance
     */
    async listPartners() {
        if (!db.users) return [];
        try {
            const snap = await db.users.get();
            const partners = [];
            for (const doc of snap.docs) {
                const data = doc.data();
                if (!data.virtualAccount) continue; // Filter out standard users/contacts

                const balance = await wallet.getBalance(doc.id);
                partners.push({
                    id: doc.id,
                    name: data.name || 'Unknown Partner',
                    virtualAccount: data.virtualAccount || null,
                    balance
                });
            }
            return partners;
        } catch (error) {
            logger.error('Error listing partners:', error.message);
            return [];
        }
    }

    /**
     * Fetches all pending withdrawals
     */
    async listPendingWithdrawals() {
        if (!db.ledger) return [];
        try {
            const snap = await db.ledger
                .where('type', '==', 'WITHDRAWAL')
                .where('status', '==', 'PENDING')
                .get();

            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            logger.error('Error listing pending withdrawals:', error.message);
            return [];
        }
    }

    /**
     * Get partners filtered by partnership tier or 'ALL'
     */
    async getPartnersByTier(tier = 'ALL') {
        if (!db.users) return [];
        try {
            const snap = await db.users.get();
            const normalizedTier = (tier || 'ALL').toUpperCase();
            const partners = [];

            for (const doc of snap.docs) {
                const data = doc.data();
                if (!data.virtualAccount) continue;

                const partnerTier = (data.donationTier || 'MEMBER').toUpperCase();
                if (normalizedTier !== 'ALL' && partnerTier !== normalizedTier) {
                    continue;
                }

                partners.push({
                    id: doc.id,
                    userId: doc.id,
                    name: data.verifiedName || data.name || 'Partner',
                    phone: data.phoneNumber || data.phone || doc.id.split('@')[0],
                    donationTier: partnerTier,
                    virtualAccount: data.virtualAccount
                });
            }
            return partners;
        } catch (error) {
            logger.error('Error fetching partners by tier:', error.message);
            return [];
        }
    }

    /**
     * Retrieves broadcast history from the ledger
     */
    async getBroadcastHistory() {
        if (!db.ledger) return [];
        try {
            const snap = await db.ledger
                .where('type', '==', 'BROADCAST_BATCH')
                .get();

            const batches = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return batches
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .slice(0, 20);
        } catch (error) {
            logger.error('Error fetching broadcast history:', error.message);
            return [];
        }
    }
}

export default new AdminService();

