import React, { useState, useEffect } from 'react';
import { Radio, Send, Users, User, Shuffle, Clock, CheckCircle, AlertCircle, RefreshCw, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

function resolveSpintax(text: string): string {
    return text.replace(/{([^{}]+)}/g, (_, choices) => {
        const parts = choices.split('|');
        return parts[Math.floor(Math.random() * parts.length)];
    });
}

export default function BroadcastPanel() {
    const [messageTemplate, setMessageTemplate] = useState<string>(
        '{⚡ Fast Data Alert!|🔥 Subsidized NYSC Data!|👋 Good day co-member!}\n\nGet instant MTN, Airtel, Glo & 9mobile data delivered in 30 seconds!\n\n👉 Reply *DATA* or click to order right now.'
    );
    const [targetMode, setTargetMode] = useState<'TIER' | 'INDIVIDUAL'>('TIER');
    const [targetTier, setTargetTier] = useState<string>('ALL');
    const [targetPhone, setTargetPhone] = useState<string>('');
    const [partnerSearch, setPartnerSearch] = useState<string>('');
    const [partners, setPartners] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loadingPartners, setLoadingPartners] = useState<boolean>(false);
    const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
    const [sending, setSending] = useState<boolean>(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [previewKey, setPreviewKey] = useState<number>(0);

    const token = localStorage.getItem('clarion_admin_token');
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const fetchPartners = async () => {
        setLoadingPartners(true);
        try {
            const res = await fetch(`/api/admin/broadcasts/partners?tier=${targetTier}`, { headers });
            if (res.ok) {
                const data = await res.json();
                setPartners(data.partners || []);
            }
        } catch (e) {
            console.error('Failed to load partners for broadcast:', e);
        } finally {
            setLoadingPartners(false);
        }
    };

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const res = await fetch('/api/admin/broadcasts/history', { headers });
            if (res.ok) {
                const data = await res.json();
                setHistory(data.history || []);
            }
        } catch (e) {
            console.error('Failed to load broadcast history:', e);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        fetchPartners();
    }, [targetTier]);

    useEffect(() => {
        fetchHistory();
    }, []);

    const handleQueueBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);

        if (!messageTemplate.trim()) {
            setFeedback({ type: 'error', message: 'Message template cannot be empty.' });
            return;
        }

        if (targetMode === 'INDIVIDUAL' && !targetPhone.trim()) {
            setFeedback({ type: 'error', message: 'Please specify a target phone number or select a partner.' });
            return;
        }

        setSending(true);
        try {
            const payload = {
                messageTemplate,
                targetTier: targetMode === 'TIER' ? targetTier : null,
                targetPhone: targetMode === 'INDIVIDUAL' ? targetPhone : null
            };

            const res = await fetch('/api/admin/broadcasts/queue', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to queue broadcast');

            setFeedback({
                type: 'success',
                message: `✅ Broadcast queued successfully for ${data.recipientCount || 1} recipient(s)!`
            });

            // Refresh history
            fetchHistory();
        } catch (err: any) {
            setFeedback({ type: 'error', message: err.message || 'Error queueing broadcast.' });
        } finally {
            setSending(false);
        }
    };

    const previewResolved = React.useMemo(() => {
        return resolveSpintax(messageTemplate);
    }, [messageTemplate, previewKey]);

    const filteredPartners = partners.filter(p =>
        (p.name && p.name.toLowerCase().includes(partnerSearch.toLowerCase())) ||
        (p.phone && p.phone.includes(partnerSearch))
    );

    return (
        <div className="space-y-8 bg-zinc-950/60 border border-zinc-800 p-6 rounded-xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-accent/10 border border-accent/30 text-accent flex items-center justify-center rounded">
                        <Radio size={20} className="animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-sm font-mono font-bold text-zinc-200 uppercase tracking-wider">
                            Broadcast Control Center
                        </h3>
                        <p className="text-[11px] font-mono text-zinc-500">
                            Automated spintax dispatch to co-members & customer contact pipelines
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => { fetchPartners(); fetchHistory(); }}
                    className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-accent border border-zinc-800 px-3 py-1.5 rounded transition cursor-pointer"
                >
                    <RefreshCw size={12} className={loadingHistory || loadingPartners ? 'animate-spin' : ''} />
                    <span>Sync</span>
                </button>
            </div>

            {feedback && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-lg font-mono text-xs flex items-center gap-3 ${
                        feedback.type === 'success'
                            ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-400'
                            : 'bg-red-950/40 border border-red-500/30 text-red-400'
                    }`}
                >
                    {feedback.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    <span>{feedback.message}</span>
                </motion.div>
            )}

            {/* Composer and Audience Selection */}
            <form onSubmit={handleQueueBroadcast} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Message Composer & Spintax Live Preview */}
                <div className="lg:col-span-7 space-y-4">
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                                <MessageSquare size={13} className="text-accent" />
                                <span>Message Template (Spintax Supported)</span>
                            </label>
                            <span className="text-[10px] font-mono text-zinc-500">
                                {messageTemplate.length} chars
                            </span>
                        </div>
                        <textarea
                            rows={6}
                            value={messageTemplate}
                            onChange={(e) => setMessageTemplate(e.target.value)}
                            placeholder="Use {Option 1|Option 2|Option 3} for anti-ban spintax rotation..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-100 focus:border-accent focus:outline-none transition resize-y"
                        />
                        <p className="text-[10px] font-mono text-zinc-500 mt-1">
                            💡 Tip: Enclose variations in <code className="text-accent">{'{phrase A|phrase B}'}</code> to vary messages per recipient and prevent spam flagging.
                        </p>
                    </div>

                    {/* Live Spintax Preview Box */}
                    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-accent font-bold flex items-center gap-1.5">
                                <Shuffle size={12} />
                                <span>Live Spintax Sample Preview</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setPreviewKey(k => k + 1)}
                                className="text-[10px] font-mono text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 cursor-pointer"
                            >
                                <Shuffle size={10} />
                                <span>Spin Sample</span>
                            </button>
                        </div>
                        <div className="bg-zinc-950 p-3 rounded border border-zinc-800/80 text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
                            {previewResolved || <span className="text-zinc-600 italic">No template text provided...</span>}
                        </div>
                    </div>
                </div>

                {/* Right: Audience Selector & Dispatch Action */}
                <div className="lg:col-span-5 space-y-5 flex flex-col justify-between">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                                Target Audience Mode
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTargetMode('TIER')}
                                    className={`py-2.5 px-3 rounded text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 border transition cursor-pointer ${
                                        targetMode === 'TIER'
                                            ? 'bg-accent text-black border-accent'
                                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                    }`}
                                >
                                    <Users size={14} />
                                    <span>By Tier</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetMode('INDIVIDUAL')}
                                    className={`py-2.5 px-3 rounded text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 border transition cursor-pointer ${
                                        targetMode === 'INDIVIDUAL'
                                            ? 'bg-accent text-black border-accent'
                                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                    }`}
                                >
                                    <User size={14} />
                                    <span>Single Partner</span>
                                </button>
                            </div>
                        </div>

                        {targetMode === 'TIER' ? (
                            <div>
                                <label className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                                    Select Partnership Tier
                                </label>
                                <select
                                    value={targetTier}
                                    onChange={(e) => setTargetTier(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:border-accent focus:outline-none"
                                >
                                    <option value="ALL">🌐 ALL PARTNERS (Entire Network)</option>
                                    <option value="PIONEER">🏆 PIONEER CLASS ONLY</option>
                                    <option value="LORD">👑 CLARION LORD (64% CDS Pool)</option>
                                    <option value="MASTER">🎖️ CLARION MASTER (40% CDS Pool)</option>
                                    <option value="MEMBER">🔰 CLARION MEMBER (16% CDS Pool)</option>
                                </select>
                                <div className="mt-2 text-[11px] font-mono text-zinc-400">
                                    Audience size: <span className="text-accent font-bold">{partners.length} co-member(s)</span>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                                        Target Phone Number / WhatsApp JID
                                    </label>
                                    <input
                                        type="text"
                                        value={targetPhone}
                                        onChange={(e) => setTargetPhone(e.target.value)}
                                        placeholder="e.g. 08012345678 or 2348012345678"
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:border-accent focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-mono uppercase text-zinc-500 block mb-1">
                                        Or pick from onboarded partners:
                                    </label>
                                    <input
                                        type="text"
                                        value={partnerSearch}
                                        onChange={(e) => setPartnerSearch(e.target.value)}
                                        placeholder="Search partner by name..."
                                        className="w-full bg-zinc-900/60 border border-zinc-800 rounded p-1.5 text-[11px] font-mono text-zinc-300 mb-1.5"
                                    />
                                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                                        {filteredPartners.slice(0, 8).map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => setTargetPhone(p.phone || p.id)}
                                                className={`p-1.5 rounded text-[11px] font-mono flex justify-between items-center cursor-pointer transition ${
                                                    targetPhone === p.phone
                                                        ? 'bg-accent/20 border border-accent/40 text-accent'
                                                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                                                }`}
                                            >
                                                <span className="truncate">{p.name}</span>
                                                <span className="text-zinc-500 text-[10px]">{p.phone}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={sending}
                        className="w-full bg-accent hover:bg-white text-black font-mono text-xs font-bold uppercase tracking-widest py-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                    >
                        {sending ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Queueing Batch...</span>
                            </>
                        ) : (
                            <>
                                <Send size={14} />
                                <span>Queue Broadcast Message</span>
                            </>
                        )}
                    </button>
                </div>
            </form>

            {/* Broadcast History Table */}
            <div className="border-t border-zinc-800 pt-6">
                <div className="flex items-center gap-2 mb-3">
                    <Clock size={14} className="text-accent" />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-400">
                        Broadcast History & Status Log
                    </h4>
                </div>

                {history.length === 0 && !loadingHistory ? (
                    <p className="text-xs font-mono text-zinc-600 italic py-4">No broadcast batches recorded in ledger.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-xs border border-zinc-800">
                            <thead>
                                <tr className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase tracking-wider">
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Message Snippet</th>
                                    <th className="p-3">Recipients</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
                                {history.map((batch: any) => (
                                    <tr key={batch.id} className="hover:bg-zinc-900/40 transition">
                                        <td className="p-3 text-zinc-400 whitespace-nowrap">
                                            {batch.createdAt ? new Date(batch.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td className="p-3 text-zinc-200 max-w-xs truncate" title={batch.messageTemplate}>
                                            {batch.messageTemplate || '—'}
                                        </td>
                                        <td className="p-3 text-zinc-300 whitespace-nowrap">
                                            {batch.sentCount || 0} / {batch.totalCount || batch.targetJids?.length || 0}
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                batch.status === 'COMPLETED'
                                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                                    : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                                            }`}>
                                                {batch.status || 'PENDING'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
