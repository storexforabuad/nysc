import React, { useEffect, useState } from 'react';
import { Rocket, Palette, FileText, Download, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Clock, User, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AttachedFile {
    fileName: string;
    displayName: string;
    mimeType?: string;
    timestamp?: string;
}

interface Pitch {
    id: string;
    pitchId: string;
    userId: string;
    userName: string;
    userStateCode?: string;
    summary: string;
    notes?: string;
    files?: AttachedFile[];
    submittedAt: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface MerchDesign {
    id: string;
    designId: string;
    userId: string;
    userName: string;
    userStateCode?: string;
    category?: string;
    notes?: string;
    files?: AttachedFile[];
    submittedAt: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function PitchAndMerchPanel() {
    const [activeTab, setActiveTab] = useState<'pitches' | 'merch'>('pitches');
    const [pitches, setPitches] = useState<Pitch[]>([]);
    const [merchDesigns, setMerchDesigns] = useState<MerchDesign[]>([]);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState<string>('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const adminToken = localStorage.getItem('clarion_admin_token') || '';
            setToken(adminToken);
            const headers = { 'Authorization': `Bearer ${adminToken}` };

            const [pRes, mRes] = await Promise.all([
                fetch('/api/admin/pitches', { headers }),
                fetch('/api/admin/merch-designs', { headers })
            ]);

            if (pRes.ok) {
                const data = await pRes.json();
                setPitches(data.pitches || []);
            }
            if (mRes.ok) {
                const data = await mRes.json();
                setMerchDesigns(data.designs || []);
            }
        } catch (err) {
            console.error('Failed to load pitches and merch designs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const pendingPitches = pitches.filter(p => p.status === 'PENDING').length;
    const pendingMerch = merchDesigns.filter(m => m.status === 'PENDING').length;

    return (
        <div className="w-full space-y-6">
            {/* Header & Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-accent">
                        <Rocket size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-mono font-bold text-zinc-200 uppercase tracking-widest">
                            Venture Pitches & Merch Collaborations
                        </h3>
                        <p className="text-[11px] font-mono text-zinc-500">
                            Startup executive summaries, grant applications, and S1 merchandise proposals
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('pitches')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition ${
                                activeTab === 'pitches'
                                    ? 'bg-accent text-black font-bold shadow'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Rocket size={13} />
                            <span>Pitches & Grants</span>
                            {pendingPitches > 0 && (
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                                    activeTab === 'pitches' ? 'bg-black text-white' : 'bg-accent/20 text-accent'
                                }`}>
                                    {pendingPitches}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('merch')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition ${
                                activeTab === 'merch'
                                    ? 'bg-accent text-black font-bold shadow'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Palette size={13} />
                            <span>Merch S1</span>
                            {pendingMerch > 0 && (
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                                    activeTab === 'merch' ? 'bg-black text-white' : 'bg-accent/20 text-accent'
                                }`}>
                                    {pendingMerch}
                                </span>
                            )}
                        </button>
                    </div>

                    <button
                        onClick={fetchData}
                        title="Refresh"
                        className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-accent transition"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* TAB: Pitches */}
            {activeTab === 'pitches' && (
                <div>
                    {pitches.length === 0 && !loading && (
                        <div className="p-8 border border-zinc-800 bg-zinc-900/30 rounded-xl text-center space-y-2">
                            <Rocket size={24} className="mx-auto text-zinc-600" />
                            <p className="text-xs font-mono text-zinc-400">No venture pitches submitted yet.</p>
                            <p className="text-[11px] font-mono text-zinc-600">
                                Corps members can submit executive decks by texting <span className="text-accent font-bold">PITCH</span> to MotherBot.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {pitches.map((p) => {
                            const hasFiles = p.files && p.files.length > 0;
                            const formattedDate = p.submittedAt ? new Date(p.submittedAt).toLocaleString() : 'Recent';

                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={p.id}
                                    className="bg-[#09090B] border border-zinc-800 hover:border-zinc-700 transition p-4 rounded-xl flex flex-col justify-between gap-4 shadow-sm"
                                >
                                    <div className="space-y-3">
                                        {/* Top line: ID and Status */}
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-mono font-bold text-accent tracking-wide">
                                                {p.pitchId || p.id}
                                            </span>
                                            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                {p.status || 'PENDING'}
                                            </span>
                                        </div>

                                        {/* Applicant identity */}
                                        <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80 space-y-1">
                                            <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-xs font-bold truncate">
                                                <User size={13} className="text-zinc-500 shrink-0" />
                                                <span>{p.userName || 'Anonymous'}</span>
                                            </div>
                                            <div className="text-[10px] font-mono text-zinc-500 truncate pl-4">
                                                {p.userId?.split('@')[0]} {p.userStateCode ? `• ${p.userStateCode}` : ''}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600 pl-4">
                                                <Clock size={11} />
                                                <span>{formattedDate}</span>
                                            </div>
                                        </div>

                                        {/* Summary / Notes */}
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
                                                Executive Summary & Notes
                                            </p>
                                            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-line leading-relaxed">
                                                {p.notes || p.summary || 'No written notes provided.'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Attached PDF / Documents */}
                                    <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                                                Attached Files ({p.files?.length || 0})
                                            </span>
                                        </div>

                                        {hasFiles ? (
                                            <div className="space-y-1.5">
                                                {p.files!.map((file, idx) => {
                                                    const downloadUrl = `/api/admin/files/pitch/${encodeURIComponent(file.fileName)}?token=${encodeURIComponent(token)}`;
                                                    return (
                                                        <a
                                                            key={idx}
                                                            href={downloadUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 hover:border-accent text-zinc-200 transition group text-xs font-mono"
                                                        >
                                                            <div className="flex items-center gap-2 truncate pr-2">
                                                                <FileText size={14} className="text-accent shrink-0" />
                                                                <span className="truncate">{file.displayName || file.fileName}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 group-hover:text-white shrink-0 font-bold uppercase">
                                                                <span>View PDF</span>
                                                                <ExternalLink size={11} />
                                                            </div>
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] font-mono text-zinc-600 italic">
                                                No PDF document attached (Text submission only).
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TAB: Merch Designs */}
            {activeTab === 'merch' && (
                <div>
                    {merchDesigns.length === 0 && !loading && (
                        <div className="p-8 border border-zinc-800 bg-zinc-900/30 rounded-xl text-center space-y-2">
                            <Palette size={24} className="mx-auto text-zinc-600" />
                            <p className="text-xs font-mono text-zinc-400">No merchandise designs submitted yet.</p>
                            <p className="text-[11px] font-mono text-zinc-600">
                                Corps members can submit merch proposals by texting <span className="text-accent font-bold">DESIGN</span> to MotherBot.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {merchDesigns.map((m) => {
                            const hasFiles = m.files && m.files.length > 0;
                            const formattedDate = m.submittedAt ? new Date(m.submittedAt).toLocaleString() : 'Recent';

                            return (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={m.id}
                                    className="bg-[#09090B] border border-zinc-800 hover:border-zinc-700 transition p-4 rounded-xl flex flex-col justify-between gap-4 shadow-sm"
                                >
                                    <div className="space-y-3">
                                        {/* Top line: ID and Category */}
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-mono font-bold text-accent tracking-wide">
                                                {m.designId || m.id}
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                {m.category && (
                                                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                        {m.category}
                                                    </span>
                                                )}
                                                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    {m.status || 'PENDING'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Designer identity */}
                                        <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80 space-y-1">
                                            <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-xs font-bold truncate">
                                                <User size={13} className="text-zinc-500 shrink-0" />
                                                <span>{m.userName || 'Anonymous'}</span>
                                            </div>
                                            <div className="text-[10px] font-mono text-zinc-500 truncate pl-4">
                                                {m.userId?.split('@')[0]} {m.userStateCode ? `• ${m.userStateCode}` : ''}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600 pl-4">
                                                <Clock size={11} />
                                                <span>{formattedDate}</span>
                                            </div>
                                        </div>

                                        {/* Design notes */}
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
                                                Concept & Vision
                                            </p>
                                            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-line leading-relaxed">
                                                {m.notes || 'No written description provided.'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Attached Design Files */}
                                    <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider">
                                                Artwork & Files ({m.files?.length || 0})
                                            </span>
                                        </div>

                                        {hasFiles ? (
                                            <div className="space-y-1.5">
                                                {m.files!.map((file, idx) => {
                                                    const downloadUrl = `/api/admin/files/design/${encodeURIComponent(file.fileName)}?token=${encodeURIComponent(token)}`;
                                                    return (
                                                        <a
                                                            key={idx}
                                                            href={downloadUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 hover:border-accent text-zinc-200 transition group text-xs font-mono"
                                                        >
                                                            <div className="flex items-center gap-2 truncate pr-2">
                                                                <FileText size={14} className="text-accent shrink-0" />
                                                                <span className="truncate">{file.displayName || file.fileName}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 group-hover:text-white shrink-0 font-bold uppercase">
                                                                <span>View PDF</span>
                                                                <ExternalLink size={11} />
                                                            </div>
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] font-mono text-zinc-600 italic">
                                                No PDF document attached (Text submission only).
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
