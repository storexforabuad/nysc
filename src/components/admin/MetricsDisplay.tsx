import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap, BarChart3, Users, Activity, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface Metrics {
    totalSystemProfit: number;
    totalCDSProfit: number;
    dailyVolume: number;
    activeBots: number;
}

export default function MetricsDisplay() {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const token = localStorage.getItem('clarion_admin_token');
                const res = await fetch('/api/admin/metrics', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!res.ok) throw new Error('Failed to fetch metrics');

                const data = await res.json();
                setMetrics(data);
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
            <div className="flex items-center justify-center p-12 border border-zinc-800 bg-zinc-900/30">
                <Loader2 className="animate-spin text-accent" size={32} />
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
        <div className="w-full space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest">Global Analytics</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-zinc-900 border border-zinc-800 p-6 relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Users size={64} />
                    </div>
                    <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">Connected Partners</p>
                    <p className="text-3xl font-display font-bold text-zinc-100">{metrics.activeBots}</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-zinc-900 border border-zinc-800 p-6 relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-accent">
                        <Activity size={64} />
                    </div>
                    <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">Daily Tx Volume</p>
                    <p className="text-3xl font-display font-bold text-accent">{metrics.dailyVolume}</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-zinc-900 border border-zinc-800 p-6 relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <BarChart3 size={64} />
                    </div>
                    <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">Platform Revenue</p>
                    <p className="text-3xl font-display font-bold text-zinc-100">₦{metrics.totalSystemProfit.toLocaleString()}</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-zinc-900 border border-zinc-800 p-6 relative overflow-hidden group border-l-2 border-l-accent"
                >
                    <p className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">CDS Charity Pool</p>
                    <p className="text-3xl font-display font-bold text-zinc-100 italic">₦{metrics.totalCDSProfit.toLocaleString()}</p>
                </motion.div>
            </div>
        </div>
    );
}
