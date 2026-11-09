import React, { useEffect, useState } from 'react';
import { Bot, CreditCard, CheckCircle2, AlertCircle, RefreshCw, Pencil, Save, Loader2, Users, Download, Eye, FileSpreadsheet, X } from 'lucide-react';
import { motion } from 'motion/react';
import CdsProposals from './CdsProposals';
import BroadcastPanel from './BroadcastPanel';
import AssetStudio from './AssetStudio';
import PitchAndMerchPanel from './PitchAndMerchPanel';

export default function ManagementViews() {
    const [partners, setPartners] = useState<any[]>([]);
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
    const [priceCardPreviews, setPriceCardPreviews] = useState<string[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [captions, setCaptions] = useState<Record<string, string>>({});
    const [captionLoading, setCaptionLoading] = useState(false);
    const [captionSaveLoading, setCaptionSaveLoading] = useState(false);
    const [captionError, setCaptionError] = useState('');
    const [backingUpId, setBackingUpId] = useState<string | null>(null);
    const [contactModal, setContactModal] = useState<{ partnerId: string; partnerName: string; contacts: any[]; loading: boolean; search: string } | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const headers = { 'Authorization': `Bearer ${token}` };

            const [pRes, wRes, cRes] = await Promise.all([
                fetch('/api/admin/partners', { headers }),
                fetch('/api/admin/withdrawals/pending', { headers }),
                fetch('/api/admin/status-captions', { headers })
            ]);

            if (pRes.ok) setPartners(await pRes.json());
            if (wRes.ok) setWithdrawals(await wRes.json());
            if (cRes.ok) {
                const data = await cRes.json();
                setCaptions(data.captions || {});
            }
        } catch (error) {
            console.error("Failed fetching admin data");
        }
        setLoading(false);
    };

    const handleCaptionChange = (key: string, value: string) => {
        setCaptions(prev => ({ ...prev, [key]: value }));
    };

    const handleSaveCaptions = async () => {
        setCaptionSaveLoading(true);
        setCaptionError('');
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch('/api/admin/status-captions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(captions)
            });
            if (!res.ok) throw new Error('Failed to save captions');
        } catch (error) {
            setCaptionError(error.message || 'Unable to save captions');
        } finally {
            setCaptionSaveLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleApprove = async (id: string) => {
        const token = localStorage.getItem('clarion_admin_token');
        try {
            await fetch(`/api/admin/withdrawals/${id}/approve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            // Remove from UI instantly
            setWithdrawals(withdrawals.filter(w => w.id !== id));
            // Refresh to get updated balances
            fetchData();
        } catch (e) {
            alert("Failed to approve");
        }
    };

    const handleBackupContacts = async (partnerId: string) => {
        setBackingUpId(partnerId);
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}/contacts/backup`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setPartners(prev => prev.map(p => p.id === partnerId ? { ...p, contactsCount: data.count } : p));
                alert(`✅ Backup Complete! Backed up ${data.count} contacts.`);
            }
        } catch (e: any) {
            alert(`Backup failed: ${e.message}`);
        } finally {
            setBackingUpId(null);
        }
    };

    const handleViewContacts = async (partnerId: string, partnerName: string) => {
        setContactModal({ partnerId, partnerName, contacts: [], loading: true, search: '' });
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}/contacts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setContactModal({ partnerId, partnerName, contacts: data.contacts || [], loading: false, search: '' });
        } catch (e: any) {
            setContactModal(null);
            alert(`Failed to load contacts: ${e.message}`);
        }
    };

    const handleExportContacts = (partnerId: string, format: 'csv' | 'vcf') => {
        const token = localStorage.getItem('clarion_admin_token');
        window.open(`/api/admin/partners/${encodeURIComponent(partnerId)}/contacts/export?format=${format}&token=${token}`, '_blank');
    };

    const handleGenerateReceiptPreview = async () => {
        setPreviewLoading(true);
        setPreviewError('');
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch('/api/admin/generate-test-receipt', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to generate receipt preview');
            const data = await res.json();
            setReceiptPreview(data.imageBase64 || null);
        } catch (error) {
            setPreviewError(error.message || 'Unable to generate receipt preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleGeneratePriceCardPreview = async () => {
        setPreviewLoading(true);
        setPreviewError('');
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch('/api/admin/generate-test-pricecard', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to generate price card preview');
            const data = await res.json();
            setPriceCardPreviews(data.images || []);
        } catch (error) {
            setPreviewError(error.message || 'Unable to generate price card preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const [approvingVendorId, setApprovingVendorId] = useState<string | null>(null);

    const handleApproveVendor = async (id: string) => {
        setApprovingVendorId(id);
        const token = localStorage.getItem('clarion_admin_token');
        try {
            const res = await fetch(`/api/admin/vendors/${encodeURIComponent(id)}/approve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to approve vendor');
            setPartners(prev => prev.map(p => p.id === id ? { ...p, terminalApproved: true } : p));
            await fetchData();
        } catch (e: any) {
            alert(e.message || "Failed to approve partner terminal");
        } finally {
            setApprovingVendorId(null);
        }
    };

    return (
        <div className="w-full space-y-12">

            {/* ── PARTNER LIST (MOBILE CARDS) ── */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Bot size={14} className="text-accent" />
                        <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">Partner Operations</h3>
                    </div>
                    <button onClick={fetchData} className="text-zinc-500 hover:text-accent p-1">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {partners.length === 0 && !loading && (
                    <p className="text-xs font-mono text-zinc-600 italic">No partners found.</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {partners.map(p => (
                        <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-4 flex flex-col justify-between rounded-lg">
                            <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                        <p className="font-mono text-xs uppercase font-bold text-zinc-300 truncate">{p.name}</p>
                                        <p className="text-[10px] font-mono text-zinc-500 truncate">{p.id.split('@')[0]} {p.stateCode ? `• ${p.stateCode}` : ''}</p>
                                    </div>
                                    {p.terminalApproved ? (
                                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">ACTIVE</span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">PENDING APPROVAL</span>
                                    )}
                                </div>
                                {p.franchiseName && (
                                    <p className="text-[11px] font-mono text-zinc-400 italic mb-2">🏢 {p.franchiseName}</p>
                                )}
                            </div>

                            <div>
                                <div className="pt-3 mt-3 border-t border-zinc-800 flex justify-between items-end">
                                    <span className="text-[10px] font-mono text-zinc-500 uppercase">Wallet</span>
                                    <span className="text-accent font-display font-bold text-lg">₦{(p.balance || 0).toLocaleString()}</span>
                                </div>

                                {/* Harvested Contacts Row */}
                                <div className="pt-2 mt-2 border-t border-zinc-800/60 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-zinc-400">
                                        <Users size={12} className="text-accent" />
                                        <span className="text-[10px] font-mono font-bold text-zinc-300">{p.contactsCount || 0} Contacts</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleViewContacts(p.id, p.name)}
                                            title="View Contacts"
                                            className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[9px] font-mono flex items-center gap-1 transition"
                                        >
                                            <Eye size={10} />
                                            <span>View</span>
                                        </button>
                                        <button
                                            onClick={() => handleBackupContacts(p.id)}
                                            disabled={backingUpId === p.id}
                                            title="Sync & Backup Contacts"
                                            className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-accent rounded text-[9px] font-mono flex items-center gap-1 transition disabled:opacity-50"
                                        >
                                            <RefreshCw size={10} className={backingUpId === p.id ? 'animate-spin' : ''} />
                                            <span>Sync</span>
                                        </button>
                                        <button
                                            onClick={() => handleExportContacts(p.id, 'csv')}
                                            title="Export CSV"
                                            className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[9px] font-mono flex items-center gap-1 transition"
                                        >
                                            <FileSpreadsheet size={10} />
                                            <span>CSV</span>
                                        </button>
                                        <button
                                            onClick={() => handleExportContacts(p.id, 'vcf')}
                                            title="Export vCard (.vcf)"
                                            className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[9px] font-mono flex items-center gap-1 transition"
                                        >
                                            <Download size={10} />
                                            <span>VCF</span>
                                        </button>
                                    </div>
                                </div>

                                {p.terminalApproved ? (
                                    <div className="w-full mt-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs rounded flex items-center justify-center gap-1.5">
                                        <CheckCircle2 size={13} />
                                        <span>TERMINAL ACTIVATED</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleApproveVendor(p.id)}
                                        disabled={approvingVendorId === p.id}
                                        className="w-full mt-3 py-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-black font-mono font-bold text-xs rounded transition flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                                    >
                                        {approvingVendorId === p.id ? (
                                            <>
                                                <Loader2 size={13} className="animate-spin" />
                                                <span>ACTIVATING BOT...</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={13} />
                                                <span>APPROVE & ACTIVATE BOT</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── CONTACTS VIEWER MODAL ── */}
            {contactModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-xl w-full p-5 max-h-[85vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
                            <div className="flex items-center gap-2">
                                <Users size={16} className="text-accent" />
                                <div>
                                    <h4 className="text-sm font-mono font-bold text-zinc-200 uppercase">{contactModal.partnerName} — Contacts</h4>
                                    <p className="text-[10px] font-mono text-zinc-500">{contactModal.contacts.length} total contacts recorded</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleExportContacts(contactModal.partnerId, 'csv')}
                                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono rounded flex items-center gap-1"
                                >
                                    <FileSpreadsheet size={12} />
                                    <span>CSV</span>
                                </button>
                                <button
                                    onClick={() => handleExportContacts(contactModal.partnerId, 'vcf')}
                                    className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-accent text-xs font-mono rounded flex items-center gap-1"
                                >
                                    <Download size={12} />
                                    <span>VCF</span>
                                </button>
                                <button
                                    onClick={() => setContactModal(null)}
                                    className="text-zinc-500 hover:text-zinc-200 p-1"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Search Input */}
                        <div className="mb-3">
                            <input
                                type="text"
                                placeholder="Search by name or phone..."
                                value={contactModal.search}
                                onChange={(e) => setContactModal({ ...contactModal, search: e.target.value })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-accent"
                            />
                        </div>

                        {/* Contacts List */}
                        <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                            {contactModal.loading ? (
                                <div className="py-8 flex flex-col items-center justify-center text-zinc-500">
                                    <Loader2 size={24} className="animate-spin mb-2" />
                                    <span className="text-xs font-mono">Loading contacts...</span>
                                </div>
                            ) : contactModal.contacts.length === 0 ? (
                                <p className="text-xs font-mono text-zinc-500 text-center py-6">No contacts harvested yet.</p>
                            ) : (
                                contactModal.contacts
                                    .filter(c => {
                                        const q = contactModal.search.toLowerCase();
                                        return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
                                    })
                                    .map((c, idx) => (
                                        <div key={idx} className="bg-zinc-950/70 border border-zinc-800/60 p-2.5 rounded flex items-center justify-between text-xs font-mono">
                                            <div>
                                                <p className="font-bold text-zinc-300">{c.name || 'Customer'}</p>
                                                <p className="text-zinc-500 text-[11px]">{c.phone}</p>
                                            </div>
                                            <span className="px-2 py-0.5 rounded text-[9px] bg-zinc-900 border border-zinc-800 text-zinc-400">
                                                {c.source || 'Sync'}
                                            </span>
                                        </div>
                                    ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── BRAND & ASSET GENERATION STUDIO ── */}
            <div className="pt-8 border-t border-zinc-800">
                <AssetStudio />
            </div>

            {/* ── CDS GRANT PROPOSALS PANEL ── */}
            <div className="pt-8 border-t border-zinc-800">
                <CdsProposals />
            </div>

            {/* ── VENTURE PITCHES & MERCH COLLABORATIONS PANEL ── */}
            <div className="pt-8 border-t border-zinc-800">
                <PitchAndMerchPanel />
            </div>

            {/* ── BROADCAST CONTROL CENTER ── */}
            <div className="pt-8 border-t border-zinc-800">
                <BroadcastPanel />
            </div>

            {/* ── MARKETING PREVIEW PANEL */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Bot size={14} className="text-accent" />
                        <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">Marketing Playground</h3>
                    </div>
                    <button
                        onClick={fetchData}
                        className="text-zinc-500 hover:text-accent p-1"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <button
                        onClick={handleGenerateReceiptPreview}
                        disabled={previewLoading}
                        className="w-full bg-accent text-black font-mono text-xs font-bold uppercase py-3 tracking-widest hover:bg-white transition-colors"
                    >
                        {previewLoading ? 'Generating...' : 'Generate Preview Receipt'}
                    </button>
                    <button
                        onClick={handleGeneratePriceCardPreview}
                        disabled={previewLoading}
                        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 font-mono text-xs font-bold uppercase py-3 tracking-widest hover:border-accent hover:text-accent transition-colors"
                    >
                        {previewLoading ? 'Generating...' : 'Generate Preview Price Card'}
                    </button>
                </div>

                {previewError && (
                    <div className="text-sm text-red-400 font-mono mb-4">{previewError}</div>
                )}

                {captions && Object.keys(captions).length > 0 && (
                    <div className="mb-6 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Pencil size={16} className="text-accent" />
                                <h4 className="text-xs font-mono uppercase tracking-widest text-zinc-400">Live Network Captions</h4>
                            </div>
                            <button
                                onClick={handleSaveCaptions}
                                disabled={captionSaveLoading}
                                className="inline-flex items-center gap-2 bg-accent text-black text-xs font-bold uppercase px-4 py-2 rounded hover:bg-white transition"
                            >
                                <Save size={16} />
                                {captionSaveLoading ? 'Saving...' : 'Save Captions'}
                            </button>
                        </div>
                        {captionError && (
                            <div className="text-sm text-red-400 font-mono mb-4">{captionError}</div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {['mtn', 'airtel', 'glo', '9mobile', 'receipt'].map((key) => (
                                <div key={key} className="space-y-2">
                                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{key.toUpperCase()} Caption</p>
                                    <textarea
                                        rows={3}
                                        value={captions[key] || ''}
                                        onChange={(e) => handleCaptionChange(key, e.target.value)}
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 p-3 text-sm font-mono focus:border-accent focus:outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {receiptPreview && (
                    <div className="mb-4">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Receipt Preview</p>
                        <img src={receiptPreview} alt="Receipt Preview" className="w-full rounded-xl border border-zinc-800" />
                    </div>
                )}

                {priceCardPreviews.length > 0 && (
                    <div>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Price Card Previews</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {priceCardPreviews.map((image, index) => (
                                <img key={index} src={image} alt={`Price Card ${index + 1}`} className="w-full rounded-xl border border-zinc-800" />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── WITHDRAWAL QUEUE (MOBILE CARDS) ── */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <CreditCard size={14} className="text-red-500" />
                    <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">Payout Queue</h3>
                </div>

                {withdrawals.length === 0 && !loading && (
                    <div className="p-4 border border-zinc-800 bg-zinc-900/30 flex items-center gap-3">
                        <CheckCircle2 size={16} className="text-zinc-600" />
                        <p className="text-xs font-mono text-zinc-500">No pending withdrawals. Queue clear.</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {withdrawals.map(w => (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={w.id}
                            className="bg-[#09090B] border-l-2 border-l-red-500 border-t border-b border-r border-zinc-800 p-4 flex flex-col gap-4"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-mono text-[10px] text-zinc-500 uppercase mb-1">Requested Amount</p>
                                    <p className="font-display font-bold text-xl text-red-400">₦{(w.amount || 0).toLocaleString()}</p>
                                </div>
                                <div className="bg-red-500/10 text-red-500 text-[9px] font-mono font-bold px-2 py-1 uppercase rounded-sm">
                                    PENDING
                                </div>
                            </div>

                            {w.bankDetails && (
                                <div className="bg-zinc-900 p-3 text-[10px] font-mono text-zinc-400 space-y-1">
                                    <p><span className="text-zinc-600">BANK:</span> {w.bankDetails.bankName}</p>
                                    <p><span className="text-zinc-600">ACCT:</span> {w.bankDetails.accountNumber}</p>
                                    <p><span className="text-zinc-600">NAME:</span> {w.bankDetails.accountName}</p>
                                </div>
                            )}

                            <button
                                onClick={() => handleApprove(w.id)}
                                className="w-full bg-red-500 hover:bg-green-500 text-white font-mono text-xs font-bold py-3 uppercase tracking-widest transition-colors flex justify-center items-center gap-2"
                            >
                                <CheckCircle2 size={14} />
                                Approve Payout
                            </button>
                        </motion.div>
                    ))}
                </div>
            </div>

        </div>
    );
}
