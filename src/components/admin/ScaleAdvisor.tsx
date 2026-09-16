import React, { useEffect, useState } from 'react';
import { Server, Cpu, HardDrive, DollarSign, AlertTriangle, CheckCircle, RefreshCw, Layers } from 'lucide-react';
import { motion } from 'motion/react';

interface ScaleAdvisorData {
    environment: string;
    activeBots: number;
    maxCapacity: number;
    capacityPercent: number;
    currentPlan: string;
    planVcpu: string;
    planRamMb: number;
    planMonthlyCostNgn: number;
    nextPlan: string;
    processMemoryRssMb: number;
    estimatedSocketRamMb: number;
    projectedRamPercent: number;
    scaleStatus: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
    badgeColor: 'green' | 'yellow' | 'red';
    advisorMessage: string;
    financials: {
        monthlyGrossVolume: number;
        monthlyPlatformProfit: number;
        totalCdsPoolAvailable: number;
        hostingCostNgn: number;
        profitSurplus: number;
        isSelfFunded: boolean;
    };
}

export default function ScaleAdvisor() {
    const [data, setData] = useState<ScaleAdvisorData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchAdvisorData = async () => {
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch('/api/admin/scale-advisor', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (err) {
            console.error('Failed to load scale advisor:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchAdvisorData();
        const timer = setInterval(fetchAdvisorData, 30000);
        return () => clearInterval(timer);
    }, []);

    if (loading && !data) {
        return (
            <div className="bg-zinc-900 border border-zinc-800 p-6 flex items-center justify-center">
                <span className="text-xs font-mono text-zinc-500 uppercase">Analyzing VPS Node Telemetry...</span>
            </div>
        );
    }

    if (!data) return null;

    const bannerBorder = data.scaleStatus === 'CRITICAL'
        ? 'border-red-500/40 bg-red-500/10 text-red-300'
        : data.scaleStatus === 'WARNING'
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';

    const barColor = data.scaleStatus === 'CRITICAL'
        ? 'bg-red-500'
        : data.scaleStatus === 'WARNING'
            ? 'bg-amber-400'
            : 'bg-accent';

    return (
        <div className="space-y-6 w-full">
            {/* Header / Environment Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-accent">
                        <Server size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-display font-bold uppercase tracking-tight flex items-center gap-2">
                            Infrastructure Health & TrueHost Scale Advisor
                            <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700">
                                {data.environment}
                            </span>
                        </h3>
                        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                            Target Plan: {data.currentPlan} ({data.planVcpu} • {data.planRamMb}MB RAM)
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => { setRefreshing(true); fetchAdvisorData(); }}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700 text-[10px] font-mono uppercase font-bold text-zinc-300 hover:bg-white hover:text-black transition-all cursor-pointer"
                >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    <span>Sync Node</span>
                </button>
            </div>

            {/* Proactive Advisor Action Banner */}
            <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 border font-mono text-xs leading-relaxed flex items-start gap-3 ${bannerBorder}`}
            >
                {data.scaleStatus === 'CRITICAL' ? (
                    <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                ) : data.scaleStatus === 'WARNING' ? (
                    <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                ) : (
                    <CheckCircle size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div>
                    <span className="font-bold">{data.advisorMessage}</span>
                    {data.financials.isSelfFunded && (
                        <p className="text-[11px] mt-1 text-zinc-400">
                            💡 Platform profit (₦{data.financials.monthlyPlatformProfit.toLocaleString()}) covers hosting (₦{data.financials.hostingCostNgn.toLocaleString()}) with a ₦{data.financials.profitSurplus.toLocaleString()} surplus!
                        </p>
                    )}
                </div>
            </motion.div>

            {/* Sockets Gauge & Telemetry Meters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Active Bot Sockets vs Capacity */}
                <div className="bg-zinc-900/60 border border-zinc-800 p-5 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest font-bold flex items-center gap-1.5">
                            <Layers size={13} className="text-accent" /> Active ProxyBots
                        </span>
                        <span className="text-xs font-mono font-bold text-zinc-300">
                            {data.activeBots} / {data.maxCapacity} Bots
                        </span>
                    </div>
                    <div className="text-2xl font-display font-bold text-zinc-100 mb-3">
                        {data.capacityPercent}% <span className="text-xs font-mono font-normal text-zinc-500">of VPS Pod limit</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-none overflow-hidden">
                        <div
                            className={`h-full ${barColor} transition-all duration-500`}
                            style={{ width: `${data.capacityPercent}%` }}
                        />
                    </div>
                </div>

                {/* RAM Allocation Telemetry */}
                <div className="bg-zinc-900/60 border border-zinc-800 p-5 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest font-bold flex items-center gap-1.5">
                            <Cpu size={13} className="text-accent" /> Projected VPS RAM
                        </span>
                        <span className="text-xs font-mono font-bold text-zinc-300">
                            {data.estimatedSocketRamMb} / {data.planRamMb} MB
                        </span>
                    </div>
                    <div className="text-2xl font-display font-bold text-zinc-100 mb-3">
                        {data.projectedRamPercent}% <span className="text-xs font-mono font-normal text-zinc-500">allocated load</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-none overflow-hidden">
                        <div
                            className={`h-full ${barColor} transition-all duration-500`}
                            style={{ width: `${data.projectedRamPercent}%` }}
                        />
                    </div>
                    <p className="text-[9px] font-mono text-zinc-500 mt-2">
                        Local Node Process RSS: {data.processMemoryRssMb} MB
                    </p>
                </div>

                {/* Hosting Breakeven Odometer */}
                <div className="bg-zinc-900/60 border border-zinc-800 p-5 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest font-bold flex items-center gap-1.5">
                            <DollarSign size={13} className="text-accent" /> Hosting Breakeven
                        </span>
                        <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 ${data.financials.isSelfFunded ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {data.financials.isSelfFunded ? '100% SELF-FUNDED' : 'SUBSIDIZED'}
                        </span>
                    </div>
                    <div className="text-2xl font-display font-bold text-accent mb-1">
                        ₦{data.financials.monthlyPlatformProfit.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 flex justify-between">
                        <span>VPS Cost: ₦{data.financials.hostingCostNgn.toLocaleString()}/mo</span>
                        <span className={data.financials.profitSurplus >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                            {data.financials.profitSurplus >= 0 ? `+₦${data.financials.profitSurplus.toLocaleString()}` : `-₦${Math.abs(data.financials.profitSurplus).toLocaleString()}`}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
