import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  MessageSquare, 
  Zap, 
  TrendingUp, 
  Clock, 
  ShieldCheck, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  CreditCard,
  Radio,
  RefreshCw,
  Share2,
  Sliders,
  Sparkles
} from 'lucide-react';

interface MultiplierTier {
  level: number;
  multiplier: string;
  name: string;
  minBalance: number;
  neededToNext: number;
  progressPercent: number;
}

interface UserData {
  uid: string;
  name: string;
  phoneNumber: string;
  role: string;
  isSuperParent: boolean;
  botMode: string;
  statusPostingEnabled: boolean;
  statusPostFrequency: number;
  announceNewContacts: boolean;
  walletBalance: number;
  multiplierTier: MultiplierTier;
  bankDetails: {
    bankName: string;
    maskedAccount: string;
    accountName: string;
    verified: boolean;
  } | null;
  metrics: {
    totalOrders: number;
    totalRevenueNaira: number;
    totalProfitNaira: number;
  };
}

interface DashboardPayload {
  success: boolean;
  user: UserData;
  statusSchedule: {
    nextSlotLabel: string;
    nextSlotTime: string;
    isNextDay: boolean;
    countdownSeconds: number;
  };
  squad: {
    activeCount: number;
    capacity: number;
    nextMilestone?: string | null;
    progressPercent?: number;
    totalSquadOrders?: number;
    partners: Array<{
      name: string;
      phone: string;
      orders: number;
      revenue: number;
      isGraduated?: boolean;
      online: boolean;
    }>;
    graduatedLeaders?: Array<{
      name: string;
      phone: string;
      orders: number;
      revenue: number;
      isGraduated?: boolean;
      online: boolean;
    }>;
  };
  gateways: {
    mtn: string;
    airtel: string;
    glo: string;
  };
  botWhatsAppPhone: string;
}

export default function ProxyDashboard() {
  const { identifier } = useParams<{ identifier: string }>();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [updatingSetting, setUpdatingSetting] = useState<string | null>(null);

  const fetchDashboard = async (silent = false) => {
    if (!identifier) return;
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/proxy/${identifier}/dashboard`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load dashboard data');
      setData(json);
      setCountdown(json.statusSchedule?.countdownSeconds || 0);
      setError(null);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Error loading dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard(false);
    // Silent telemetry refresh every 30 seconds
    const pollInterval = setInterval(() => fetchDashboard(true), 30000);
    return () => clearInterval(pollInterval);
  }, [identifier]);

  // Real-time ticking countdown for next auto-status
  useEffect(() => {
    if (countdown <= 0) return;
    const tick = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [countdown]);

  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds <= 0) return 'Posting imminently...';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  };

  const handleToggleSetting = async (key: string, value: any) => {
    if (!identifier || !data) return;
    setUpdatingSetting(key);

    // Optimistic UI update
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        user: {
          ...prev.user,
          [key]: value
        }
      };
    });

    try {
      const res = await fetch(`/api/proxy/${identifier}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Update failed');
    } catch (err: any) {
      // Revert on error
      fetchDashboard(true);
    } finally {
      setUpdatingSetting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col items-center justify-center p-6 scanline">
        <div className="w-12 h-12 bg-accent/20 border border-accent flex items-center justify-center text-accent animate-pulse mb-4">
          <Zap size={24} />
        </div>
        <p className="font-mono text-xs text-accent uppercase tracking-widest font-bold">Initializing Proxy OS...</p>
        <p className="font-mono text-[10px] text-zinc-500 mt-2">Connecting Node Telemetry</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col items-center justify-center p-6 text-center scanline">
        <AlertCircle size={40} className="text-sunset-orange mb-4" />
        <h2 className="text-xl font-bold uppercase tracking-tight mb-2">Terminal Node Unavailable</h2>
        <p className="text-zinc-400 font-mono text-xs max-w-sm mb-6">{error || 'Could not connect to proxy terminal.'}</p>
        <button
          onClick={() => fetchDashboard(false)}
          className="px-6 py-3 bg-accent text-black font-mono font-bold text-xs uppercase tracking-wider hover:bg-white transition-all"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const { user, statusSchedule, squad, gateways, botWhatsAppPhone } = data;
  const isThursday = new Date().getDay() === 4;
  const botNumber = botWhatsAppPhone || '2347032905036';
  const whatsappChatUrl = `https://wa.me/${botNumber}?text=MENU`;

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-display flex flex-col pb-28 selection:bg-accent selection:text-black scanline">
      {/* ── Top Header Navigation ── */}
      <header className="sticky top-0 z-40 bg-[#09090B]/90 backdrop-blur-md border-b border-zinc-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-accent flex items-center justify-center font-bold text-black text-sm shrink-0 shadow-md shadow-accent/20">
            CL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight uppercase leading-none">{user.name}</h1>
              {user.isSuperParent ? (
                <span className="text-[9px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded-xs">SUPER</span>
              ) : (
                <span className="text-[9px] font-mono font-bold bg-accent/10 text-accent border border-accent/30 px-1.5 py-0.2 rounded-xs">
                  {user.multiplierTier?.level >= 2 ? 'SEMI-PARENT' : 'CHILD'}
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono text-zinc-400 tracking-wider mt-0.5">
              {user.phoneNumber} · {user.isSuperParent ? 'Master Hub Node' : 'Clarion Franchise'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-[10px] font-mono font-bold text-accent">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            <span className="hidden sm:inline">24/7_ONLINE</span>
            <span className="sm:hidden">LIVE</span>
          </div>
          <button 
            onClick={() => fetchDashboard(false)}
            className="p-1.5 text-zinc-400 hover:text-accent transition-colors"
            title="Refresh Dashboard"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {/* ── Main Dashboard Scrollable Content ── */}
      <main className="flex-1 p-4 md:p-6 max-w-2xl w-full mx-auto space-y-4">

        {/* ── MODULE 1: Earning Power & Dynamic Multiplier Station ── */}
        <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 rounded-none relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] font-bold">Active Earning Engine</p>
              <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tight text-white mt-0.5">
                {user.multiplierTier?.name || 'Tier 1 (1X Power)'}
              </h2>
            </div>
            <div className="bg-accent text-black font-mono font-bold text-xs px-2.5 py-1 tracking-wider uppercase">
              {user.multiplierTier?.multiplier || '1X'} POWER
            </div>
          </div>

          {/* Liquidity Progress Bar */}
          <div className="space-y-1.5 mt-4">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">Float Liquidity:</span>
              <span className="text-white font-bold">
                ₦{user.walletBalance.toLocaleString()} {user.multiplierTier?.nextThreshold ? `/ ₦${user.multiplierTier.nextThreshold.toLocaleString()}` : ''}
              </span>
            </div>
            <div className="w-full bg-zinc-950 border border-zinc-800 h-2.5 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${user.multiplierTier?.progressPercent || 0}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="bg-accent h-full shadow-[0_0_10px_rgba(0,255,102,0.5)]"
              ></motion.div>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 pt-1">
              {user.multiplierTier?.neededToNext > 0 ? (
                <>↳ Add <span className="text-accent font-bold">₦{user.multiplierTier.neededToNext.toLocaleString()}</span> float to level up to next multiplier tier.</>
              ) : (
                <>✦ Maximum <span className="text-accent font-bold">4X Multiplier</span> active on all customer sales & personal orders.</>
              )}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-400">Wholesale Self-Discount:</span>
            <span className="text-accent font-bold">{user.multiplierTier?.multiplier || '1X'} Savings Applied</span>
          </div>
        </section>

        {/* ── MODULE 2: Performance Telemetry (2-Grid) ── */}
        <section className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-none">
            <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
              <TrendingUp size={14} className="text-accent" />
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider">Total Sales</span>
            </div>
            <div className="text-xl md:text-2xl font-bold font-mono tracking-tight text-white">
              ₦{(user.metrics?.totalRevenueNaira || 0).toLocaleString()}
            </div>
            <p className="text-[10px] font-mono text-zinc-500 mt-1">
              {user.metrics?.totalOrders || 0} Orders Completed
            </p>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-none">
            <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
              <Sparkles size={14} className="text-accent" />
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider">Total Profit</span>
            </div>
            <div className="text-xl md:text-2xl font-bold font-mono tracking-tight text-accent">
              +₦{(user.metrics?.totalProfitNaira || 0).toLocaleString()}
            </div>
            <p className="text-[10px] font-mono text-zinc-500 mt-1">
              Net Disbursable Yield
            </p>
          </div>
        </section>

        {/* ── MODULE 3: WhatsApp Auto-Status Station & Countdown ── */}
        <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 rounded-none space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-accent animate-pulse" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-300">
                WhatsApp Auto-Status Station
              </h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={user.statusPostingEnabled}
                disabled={updatingSetting === 'statusPostingEnabled'}
                onChange={(e) => handleToggleSetting('statusPostingEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>

          {/* Countdown Clock Box */}
          <div className="bg-zinc-950 border border-zinc-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-mono uppercase text-zinc-500 font-bold tracking-wider">Next Auto-Broadcast Countdown</p>
              <div className="text-lg md:text-xl font-mono font-bold text-accent flex items-center gap-2">
                <Clock size={16} />
                <span>{formatCountdown(countdown)}</span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Upcoming Asset</span>
              <span className="text-xs font-mono text-zinc-300 font-bold">{statusSchedule?.nextSlotLabel || 'Promo Bundle'}</span>
            </div>
          </div>

          {/* Frequency Selector */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-zinc-400 font-bold uppercase">Daily Broadcast Rate:</span>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  onClick={() => handleToggleSetting('statusPostFrequency', num)}
                  className={`px-3 py-1 font-mono text-xs font-bold transition-all ${
                    user.statusPostFrequency === num
                      ? 'bg-accent text-black shadow-sm shadow-accent/20'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                  }`}
                >
                  {num}/Day
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── MODULE 4: Treasury & Thursday Cashout Station ── */}
        <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 rounded-none space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase font-bold tracking-wider">Treasury & Liquidity</p>
              <h3 className="text-2xl font-bold font-mono tracking-tight text-white mt-0.5">
                ₦{user.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h3>
            </div>
            <div className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider ${
              isThursday ? 'bg-accent text-black animate-pulse' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {isThursday ? '🟢 THURSDAY CASHOUT OPEN' : '🗓️ CASHOUT: THURSDAY'}
            </div>
          </div>

          {/* Linked Bank Card */}
          <div className="bg-zinc-950 border border-zinc-800 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-accent">
                <CreditCard size={16} />
              </div>
              <div>
                <p className="text-xs font-mono font-bold text-zinc-200">
                  {user.bankDetails?.bankName || 'No Bank Linked'}
                </p>
                <p className="text-[10px] font-mono text-zinc-500">
                  {user.bankDetails?.maskedAccount ? `Account ${user.bankDetails.maskedAccount}` : 'Reply BANK in WhatsApp to link'}
                </p>
              </div>
            </div>
            {user.bankDetails?.verified ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-accent font-bold">
                <CheckCircle2 size={13} />
                <span>NIBSS_VERIFIED</span>
              </span>
            ) : (
              <span className="text-[10px] font-mono text-sunset-orange font-bold">UNBOUND</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <a
              href={`https://wa.me/${botNumber}?text=FUND`}
              className="py-2.5 px-3 bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white hover:border-accent text-center font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            >
              <span>+ Top Up Float</span>
            </a>
            <a
              href={`https://wa.me/${botNumber}?text=WITHDRAW`}
              className={`py-2.5 px-3 text-center font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                isThursday 
                  ? 'bg-accent text-black hover:bg-white shadow-md shadow-accent/10'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span>Cash Out ({isThursday ? 'Ready' : 'Thursday'})</span>
            </a>
          </div>
        </section>

        {/* ── MODULE 5: Squad Downline Network Station ── */}
        <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 rounded-none space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-accent" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-300">
                Squad Downline Network
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-500 font-bold">
              {squad?.activeCount || 0} / {squad?.capacity || 1} SLOTS UNLOCKED
            </span>
          </div>

          {user.multiplierTier?.level < 4 && !user.isSuperParent ? (
            <div className="bg-zinc-950 border border-zinc-800 p-3.5 space-y-2">
              <p className="text-xs font-mono text-zinc-300">
                🔒 <span className="font-bold text-white">Squad Leadership Unlocks at Tier 4</span>
              </p>
              <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">
                Reach ₦6,000 float + 10 sales to unlock Squad Slot #1. Earn more slots progressively as your mentee proves their sales!
              </p>
              <div className="pt-1">
                <a
                  href={`https://wa.me/${botNumber}?text=SQUAD`}
                  className="text-accent font-mono text-xs font-bold hover:underline inline-flex items-center gap-1"
                >
                  View Squad Unlock Roadmap ➔
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Dynamic Slot Unlock Progress Bar (Tier 4 only, not Super Parent, not max capacity) */}
              {!user.isSuperParent && squad?.capacity != null && squad.capacity < 5 && squad.nextMilestone && (
                <div className="bg-zinc-950 border border-amber-900/30 p-3 space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                    <span className="font-bold text-amber-400 uppercase tracking-wider">📈 Next Squad Slot Unlock</span>
                    <span className="text-zinc-500">{squad.capacity} / 5 Slots</span>
                  </div>
                  <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full bg-amber-400 transition-all duration-700"
                      style={{ width: `${squad.progressPercent || 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">
                    {squad.nextMilestone}
                  </p>
                </div>
              )}
              {!user.isSuperParent && squad?.capacity === 5 && (
                <div className="bg-zinc-950 border border-emerald-900/30 p-3">
                  <p className="text-[11px] font-mono text-emerald-400 font-bold">👑 Maximum Squad Capacity (5/5 Slots Unlocked)</p>
                </div>
              )}

              {squad?.partners && squad.partners.length > 0 ? (
                squad.partners.map((p, idx) => (
                  <div key={idx} className="bg-zinc-950 border border-zinc-800 p-2.5 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                      <span className="font-bold text-white">{p.name}</span>
                      <span className="text-zinc-500">({p.phone})</span>
                    </div>
                    <span className="text-accent font-bold">{p.orders} Orders</span>
                  </div>
                ))
              ) : (
                <p className="text-xs font-mono text-zinc-500 italic p-2">No active squad partners yet.</p>
              )}

              {squad?.graduatedLeaders && squad.graduatedLeaders.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                    <span>👑 Graduated Leaders (Slots Liberated)</span>
                    <span className="text-accent">{squad.graduatedLeaders.length} Active</span>
                  </div>
                  {squad.graduatedLeaders.map((g, gIdx) => (
                    <div key={gIdx} className="bg-zinc-950/80 border border-emerald-950/40 p-2.5 flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                        <span className="font-bold text-white">{g.name}</span>
                        <span className="text-zinc-500">({g.phone})</span>
                      </div>
                      <span className="text-emerald-400 font-bold text-[11px]">10% Royalty Active</span>
                    </div>
                  ))}
                </div>
              )}

              <a
                href={`https://wa.me/${botNumber}?text=SUGGEST`}
                className="w-full py-2.5 bg-zinc-900 border border-dashed border-zinc-700 hover:border-accent text-zinc-300 hover:text-accent font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Share2 size={13} />
                <span>+ Invite Partner via SUGGEST</span>
              </a>
            </div>
          )}
        </section>

        {/* ── MODULE 6: Terminal Controls & Gateway Health ── */}
        <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 rounded-none space-y-4">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-accent" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-300">
              Terminal Node Controls
            </h3>
          </div>

          <div className="space-y-3">
            {/* Autonomous Mode Toggle */}
            <div className="flex items-center justify-between py-1 border-b border-zinc-800/80">
              <div>
                <p className="text-xs font-mono font-bold text-zinc-200">24/7 Autonomous AI Bot</p>
                <p className="text-[10px] font-mono text-zinc-500">Auto-dispenses data on payment detection</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={user.botMode === 'autonomous'}
                  disabled={updatingSetting === 'botMode'}
                  onChange={(e) => handleToggleSetting('botMode', e.target.checked ? 'autonomous' : 'manual')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>

            {/* Announce New Contacts Toggle */}
            <div className="flex items-center justify-between py-1 border-b border-zinc-800/80">
              <div>
                <p className="text-xs font-mono font-bold text-zinc-200">Announce New Buyers</p>
                <p className="text-[10px] font-mono text-zinc-500">Alerts you when a new customer messages</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={user.announceNewContacts}
                  disabled={updatingSetting === 'announceNewContacts'}
                  onChange={(e) => handleToggleSetting('announceNewContacts', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>

            {/* Gateway Health Monitor */}
            <div className="pt-2">
              <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider block mb-2">Telecom Gateways Status</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'MTN', status: gateways?.mtn },
                  { name: 'AIRTEL', status: gateways?.airtel },
                  { name: 'GLO', status: gateways?.glo }
                ].map((g, i) => (
                  <div key={i} className="bg-zinc-950 border border-zinc-800 p-2 text-center">
                    <span className="text-[10px] font-mono text-zinc-400 font-bold block">{g.name}</span>
                    <span className={`text-[9px] font-mono font-bold ${g.status === 'HEALTHY' ? 'text-accent' : 'text-sunset-orange'}`}>
                      {g.status === 'HEALTHY' ? '🟢 ONLINE' : '🟡 PAUSED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── STICKY BOTTOM ACTION BAR: 1-Tap Return to WhatsApp ── */}
      <footer className="fixed bottom-0 left-0 right-0 p-3 bg-[#09090B]/95 backdrop-blur-md border-t border-zinc-800 z-50 max-w-2xl mx-auto">
        <a
          href={whatsappChatUrl}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-accent text-black font-mono font-bold text-xs md:text-sm uppercase tracking-wider rounded-none hover:bg-white transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
        >
          <MessageSquare size={18} className="fill-black" />
          <span>Back to WhatsApp Chat</span>
        </a>
      </footer>
    </div>
  );
}

