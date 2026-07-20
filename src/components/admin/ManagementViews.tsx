import React, { useEffect, useState } from 'react';
import { Bot, CreditCard, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export default function ManagementViews() {
    const [partners, setPartners] = useState<any[]>([]);
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
    const [priceCardPreviews, setPriceCardPreviews] = useState<string[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const headers = { 'Authorization': `Bearer ${token}` };

            const [pRes, wRes] = await Promise.all([
                fetch('/api/admin/partners', { headers }),
                fetch('/api/admin/withdrawals/pending', { headers })
            ]);

            if (pRes.ok) setPartners(await pRes.json());
            if (wRes.ok) setWithdrawals(await wRes.json());
        } catch (error) {
            console.error("Failed fetching admin data");
        }
        setLoading(false);
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
                        <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-4 flex flex-col justify-between">
                            <div>
                                <p className="font-mono text-xs uppercase font-bold text-zinc-300 truncate">{p.name}</p>
                                <p className="text-[10px] font-mono text-zinc-600 truncate">{p.id}</p>
                            </div>
                            <div className="pt-4 mt-4 border-t border-zinc-800 flex justify-between items-end">
                                <span className="text-[10px] font-mono text-zinc-500 uppercase">Wallet</span>
                                <span className="text-accent font-display font-bold text-lg">₦{p.balance.toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
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
