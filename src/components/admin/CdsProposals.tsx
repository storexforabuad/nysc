import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, XCircle, Clock, FileText, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Proposal {
    id: string;
    proposalId?: string;
    userId: string;
    verifiedName: string;
    stateCode: string;
    donationTier: string;
    priorityScore: number;
    grantAmountRequested: number;
    approvedAmount?: number;
    title: string;
    description: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewNotes?: string;
    submittedAt: string;
    decidedAt?: string;
}

export default function CdsProposals() {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
    const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
    const [grantAmount, setGrantAmount] = useState<number>(0);
    const [reviewNotes, setReviewNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const fetchProposals = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch('/api/admin/cds-proposals', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProposals(data.proposals || []);
            }
        } catch (err) {
            console.error('Failed to load CDS proposals:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProposals();
    }, []);

    const openDecisionModal = (proposal: Proposal, action: 'APPROVE' | 'REJECT') => {
        setSelectedProposal(proposal);
        setActionType(action);
        setGrantAmount(proposal.grantAmountRequested);
        setReviewNotes(action === 'APPROVE' ? 'Approved for direct community impact grant.' : 'Proposal does not satisfy current grant requirements.');
        setErrorMsg('');
    };

    const submitDecision = async () => {
        if (!selectedProposal || !actionType) return;
        setSubmitting(true);
        setErrorMsg('');

        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch(`/api/admin/cds-proposals/${selectedProposal.id}/decision`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    decision: actionType,
                    approvedAmount: actionType === 'APPROVE' ? grantAmount : 0,
                    reviewNotes
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to submit decision');
            }

            const json = await res.json();
            // Update local state
            setProposals(prev => prev.map(p => p.id === selectedProposal.id ? { ...p, ...json.proposal } : p));
            setActionType(null);
            setSelectedProposal(null);
        } catch (err: any) {
            setErrorMsg(err.message || 'Decision failed');
        } finally {
            setSubmitting(false);
        }
    };

    const pendingCount = proposals.filter(p => p.status === 'PENDING').length;
    const approvedCount = proposals.filter(p => p.status === 'APPROVED').length;
    const totalDisbursed = proposals
        .filter(p => p.status === 'APPROVED')
        .reduce((sum, p) => sum + (p.approvedAmount || p.grantAmountRequested || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header & KPI Summary */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-base font-display font-bold uppercase tracking-tight flex items-center gap-2">
                        NYSC CDS Micro-Grant Review Board
                    </h3>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                        Funded via Clarion Tripartite Philanthropy Split
                    </p>
                </div>
                <button
                    onClick={fetchProposals}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700 text-[10px] font-mono uppercase font-bold text-zinc-300 hover:bg-white hover:text-black transition-all cursor-pointer"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    <span>Refresh Proposals</span>
                </button>
            </div>

            {/* KPI Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-zinc-900/40 border border-zinc-800 p-4">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold tracking-widest">Total Proposals</span>
                    <p className="text-2xl font-display font-bold text-zinc-100">{proposals.length}</p>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 p-4">
                    <span className="text-[9px] font-mono uppercase text-amber-400 font-bold tracking-widest">Pending Review</span>
                    <p className="text-2xl font-display font-bold text-amber-400">{pendingCount}</p>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 p-4">
                    <span className="text-[9px] font-mono uppercase text-emerald-400 font-bold tracking-widest">Approved Grants</span>
                    <p className="text-2xl font-display font-bold text-emerald-400">{approvedCount}</p>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800 p-4">
                    <span className="text-[9px] font-mono uppercase text-accent font-bold tracking-widest">Capital Approved</span>
                    <p className="text-2xl font-display font-bold text-accent">₦{totalDisbursed.toLocaleString()}</p>
                </div>
            </div>

            {/* Proposal List */}
            {loading ? (
                <div className="p-12 text-center text-zinc-500 font-mono text-xs uppercase">
                    Loading grant applications...
                </div>
            ) : proposals.length === 0 ? (
                <div className="p-12 border border-zinc-800 bg-zinc-900/20 text-center font-mono text-xs text-zinc-500 uppercase">
                    No CDS grant proposals have been submitted yet.
                </div>
            ) : (
                <div className="space-y-4">
                    {proposals.map(proposal => {
                        const isPioneerOrLord = proposal.priorityScore >= 90;
                        const statusColor = proposal.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : proposal.status === 'REJECTED'
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30';

                        return (
                            <motion.div
                                key={proposal.id}
                                layout
                                className="bg-zinc-900/60 border border-zinc-800 p-5 hover:border-zinc-700 transition-all space-y-3"
                            >
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-mono font-bold text-zinc-300">
                                            {proposal.proposalId || proposal.id}
                                        </span>
                                        {isPioneerOrLord && (
                                            <span className="text-[9px] font-mono uppercase font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                                <Award size={10} /> ⭐ {proposal.donationTier} Priority
                                            </span>
                                        )}
                                        <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-zinc-800 text-zinc-400">
                                            {proposal.stateCode || 'NYSC'}
                                        </span>
                                        <span className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 border ${statusColor}`}>
                                            {proposal.status}
                                        </span>
                                    </div>
                                    <div className="text-xs font-mono text-zinc-400">
                                        Submitted: {new Date(proposal.submittedAt).toLocaleDateString()}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-display font-bold uppercase text-zinc-100">
                                        {proposal.title}
                                    </h4>
                                    <p className="text-xs text-zinc-400 font-mono mt-1 leading-relaxed">
                                        {proposal.description}
                                    </p>
                                </div>

                                <div className="flex flex-col sm:flex-row justify-between sm:items-center pt-2 border-t border-zinc-800/80 gap-3">
                                    <div className="text-xs font-mono">
                                        <span className="text-zinc-500 uppercase">Applicant: </span>
                                        <span className="text-zinc-300 font-bold">{proposal.verifiedName}</span>
                                        <span className="text-zinc-500 mx-2">•</span>
                                        <span className="text-zinc-500 uppercase">Requested: </span>
                                        <span className="text-accent font-bold">₦{Number(proposal.grantAmountRequested).toLocaleString()}</span>
                                        {proposal.approvedAmount && (
                                            <>
                                                <span className="text-zinc-500 mx-2">•</span>
                                                <span className="text-emerald-400 font-bold">Approved: ₦{Number(proposal.approvedAmount).toLocaleString()}</span>
                                            </>
                                        )}
                                    </div>

                                    {proposal.status === 'PENDING' ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openDecisionModal(proposal, 'APPROVE')}
                                                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono uppercase font-bold transition-all cursor-pointer flex items-center gap-1"
                                            >
                                                <CheckCircle2 size={12} /> Approve Grant
                                            </button>
                                            <button
                                                onClick={() => openDecisionModal(proposal, 'REJECT')}
                                                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] font-mono uppercase font-bold transition-all cursor-pointer flex items-center gap-1"
                                            >
                                                <XCircle size={12} /> Reject
                                            </button>
                                        </div>
                                    ) : (
                                        proposal.reviewNotes && (
                                            <p className="text-[10px] font-mono text-zinc-500 italic max-w-md">
                                                Note: "{proposal.reviewNotes}"
                                            </p>
                                        )
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Decision Modal */}
            <AnimatePresence>
                {actionType && selectedProposal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#09090B] border border-zinc-800 p-6 max-w-lg w-full space-y-4 text-zinc-100"
                        >
                            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                                <h3 className="text-sm font-display font-bold uppercase tracking-tight flex items-center gap-2">
                                    {actionType === 'APPROVE' ? (
                                        <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={16} /> Approve Micro-Grant</span>
                                    ) : (
                                        <span className="text-red-400 flex items-center gap-1"><XCircle size={16} /> Reject Application</span>
                                    )}
                                </h3>
                                <button
                                    onClick={() => setActionType(null)}
                                    className="text-zinc-500 hover:text-zinc-200 font-mono text-xs cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="text-xs font-mono text-zinc-400 space-y-1">
                                <p><span className="text-zinc-500">Applicant:</span> {selectedProposal.verifiedName} ({selectedProposal.stateCode})</p>
                                <p><span className="text-zinc-500">Project:</span> {selectedProposal.title}</p>
                                <p><span className="text-zinc-500">Requested:</span> ₦{Number(selectedProposal.grantAmountRequested).toLocaleString()}</p>
                            </div>

                            {actionType === 'APPROVE' && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">
                                        Approved Grant Capital (₦):
                                    </label>
                                    <input
                                        type="number"
                                        value={grantAmount}
                                        onChange={(e) => setGrantAmount(Number(e.target.value))}
                                        className="w-full bg-zinc-900 border border-zinc-700 p-2 font-mono text-xs text-zinc-100 focus:border-accent outline-none"
                                    />
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold">
                                    {actionType === 'APPROVE' ? 'Remarks to Partner (WhatsApp Notice):' : 'Feedback Reason (WhatsApp Notice):'}
                                </label>
                                <textarea
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    rows={3}
                                    className="w-full bg-zinc-900 border border-zinc-700 p-2 font-mono text-xs text-zinc-100 focus:border-accent outline-none"
                                    placeholder="Enter message to applicant..."
                                />
                            </div>

                            {errorMsg && (
                                <p className="text-xs font-mono text-red-400">{errorMsg}</p>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                                <button
                                    onClick={() => setActionType(null)}
                                    className="px-4 py-2 border border-zinc-700 text-[10px] font-mono uppercase text-zinc-400 hover:text-white cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitDecision}
                                    disabled={submitting}
                                    className={`px-4 py-2 text-[10px] font-mono uppercase font-bold cursor-pointer transition-all flex items-center gap-1 ${
                                        actionType === 'APPROVE'
                                            ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                                            : 'bg-red-500 text-white hover:bg-red-600'
                                    }`}
                                >
                                    {submitting ? 'Dispatching...' : actionType === 'APPROVE' ? 'Confirm & Dispatch Notice' : 'Confirm Rejection'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
