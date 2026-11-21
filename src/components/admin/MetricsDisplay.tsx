import React, { useEffect, useState } from 'react';
import { Store, GraduationCap, BarChart3, Users, Activity, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Metrics {
    totalSystemProfit: number;
    totalCDSProfit: number;
    dailyVolume: number;
    activeBots: number;
}

export default function MetricsDisplay() {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [waitlistCount, setWaitlistCount] = useState<number>(0);
    const [grantsCount, setGrantsCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const token = localStorage.getItem('clarion_admin_token');
                const headers = { 'Authorization': `Bearer ${token}` };

                const [mRes, wRes, gRes] = await Promise.all([
                    fetch('/api/admin/metrics', { headers }),
                    fetch('/api/admin/waitlist', { headers }).catch(() => null),
                    fetch('/api/admin/grants', { headers }).catch(() => null)
                ]);

                if (!mRes.ok) throw new Error('Failed to fetch metrics');

                const data = await mRes.json();
                setMetrics(data);

                if (wRes && wRes.ok) {
                    const wData = await wRes.json();
                    setWaitlistCount(wData.waitlist ? wData.waitlist.length : 0);
                }
                if (gRes && gRes.ok) {
                    const gData = await gRes.json();
                    setGrantsCount(gData.grants ? gData.grants.length : 0);
                }
            } catch (err) {
                setError('Connection lost. Retrying...');
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
        // Poll every 30s
        const interval = setInterval(fetchMetrics, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
                <div className="flex items-center justify-center p-8 border border-zinc-800 bg-zinc-900/30 font-mono text-xs text-zinc-400 gap-2">
                    <Loader2 className="animate-spin text-accent" size={18} />
                    <span>Loading Analytics...</span>
                </div>
                );
    }

                if (error || !metrics) {
        return (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 font-mono text-xs font-bold uppercase">
                    {error || 'System offline.'}
                </div>
                );
    }

                return (
                        <div className="w-full space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                                <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">Global Analytics</h3>
                            </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                    {/* 1. Reseller Waitlist */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.05 }}
                                        className="bg-zinc-900 border border-zinc-800 p-4 relative overflow-hidden group border-l-2 border-l-accent"
                                    >
                                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-accent">
                                            <Store size={48} />
                                        </div>
                                        <p className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Reseller Waitlist</p>
                                        <p className="text-2xl font-display font-bold text-accent">{waitlistCount}</p>
                                        <span className="text-[9px] font-mono text-zinc-500">Reserved Brands</span>
                                    </motion.div>

                                    {/* 2. Student Grants */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="bg-zinc-900 border border-zinc-800 p-4 relative overflow-hidden group border-l-2 border-l-emerald-400"
                                    >
                                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-emerald-400">
                                                <GraduationCap size={48} />
                                            </div>
                                            <p className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-wider mb-1">Student Grants</p>
                                            <p className="text-2xl font-display font-bold text-emerald-400">{grantsCount}</p>
                                            <span className="text-[9px] font-mono text-zinc-500">Applications</span>
                                    </motion.div>

                                    {/* 3. Connected Partners */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.15 }}
                                        className="bg-zinc-900 border border-zinc-800 p-4 relative overflow-hidden group"
                                    >
                                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Users size={48} />
                                        </div>
                                        <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">Partners</p>
                                        <p className="text-2xl font-display font-bold text-zinc-100">{metrics.activeBots}</p>
                                        <span className="text-[9px] font-mono text-zinc-500">Active Terminals</span>
                                    </motion.div>

                                    {/* 4. Daily Volume */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        className="bg-zinc-900 border border-zinc-800 p-4 relative overflow-hidden group"
                                    >
                                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-accent">
                                                <Activity size={48} />
                                            </div>
                                            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">Daily Vends</p>
                                            <p className="text-2xl font-display font-bold text-zinc-100">{metrics.dailyVolume}</p>
                                            <span className="text-[9px] font-mono text-zinc-500">Transactions</span>
                                    </motion.div>

                                    {/* 5. Platform Revenue */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.25 }}
                                        className="bg-zinc-900 border border-zinc-800 p-4 relative overflow-hidden group"
                                    >
                                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <BarChart3 size={48} />
                                            </div>
                                            <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">Platform Rev</p>
                                            <p className="text-2xl font-display font-bold text-zinc-100">₦{metrics.totalSystemProfit.toLocaleString()}</p>
                                            <span className="text-[9px] font-mono text-zinc-500">Total Profit</span>
                                    </motion.div>

                                    {/* 6. CDS Charity Pool */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className="bg-zinc-900 border border-zinc-800 p-4 relative overflow-hidden group"
                                    >
                                        <p className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">Charity Pool</p>
                                        <p className="text-2xl font-display font-bold text-zinc-100 italic">₦{metrics.totalCDSProfit.toLocaleString()}</p>
                                        <span className="text-[9px] font-mono text-zinc-500">Grants Backing</span>
                                    </motion.div>
                                </div>
                            </div>
                            );
}
