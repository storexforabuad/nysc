import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Users, Flame, TrendingUp, Sparkles, Copy, Check, ShieldCheck, Share2, Store, Phone, Award } from 'lucide-react';

interface OrbitTabProps {
  user: {
    phoneNumber: string;
    franchiseName?: string | null;
    walletBalance: number;
    metrics?: {
      totalOrders?: number;
      totalRevenueNaira?: number;
      totalProfitNaira?: number;
    };
  };
  brandName: string;
  onUpdateBrandName: (newName: string) => void;
  onOpenQuickVend: () => void;
}

export default function OrbitTab({
  user,
  brandName,
  onUpdateBrandName,
  onOpenQuickVend
}: OrbitTabProps) {
  // Referral State (Stored in localStorage or initial from metrics)
  const [activeReferrals, setActiveReferrals] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('orbit_active_referrals');
      return saved ? parseInt(saved, 10) : 3; // Default 3 for active demo/prototype
    } catch {
      return 3;
    }
  });

  // 7-Day Buying Streak State
  const [streakDays, setStreakDays] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('orbit_streak_days');
      return saved ? parseInt(saved, 10) : 4; // Default 4 for active demo
    } catch {
      return 4;
    }
  });

  // Branding Inputs
  const [storeNameInput, setStoreNameInput] = useState(brandName);
  const [supportPhoneInput, setSupportPhoneInput] = useState(() => {
    try {
      return localStorage.getItem('orbit_support_phone') || user.phoneNumber || '';
    } catch {
      return user.phoneNumber || '';
    }
  });
  const [brandSaved, setBrandSaved] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const referralUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?ref=${user.phoneNumber}`
    : `https://orbitvtu.com/?ref=${user.phoneNumber}`;

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeNameInput.trim()) return;
    onUpdateBrandName(storeNameInput.trim());
    try {
      localStorage.setItem('orbit_support_phone', supportPhoneInput.trim());
    } catch {}
    setBrandSaved(true);
    setTimeout(() => setBrandSaved(false), 2500);
  };

  const is5XUnlocked = streakDays >= 7 || user.walletBalance >= 10000;
  const is4XUnlocked = activeReferrals >= 5;

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* ── MODULE 1: 5-Merchant Referral Engine (Unlocks 4X VIP) ── */}
      <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 relative overflow-hidden backdrop-blur-md">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-accent uppercase tracking-[0.2em] font-bold">Growth Engine</span>
              {is4XUnlocked && (
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold">
                  4X VIP UNLOCKED
                </span>
              )}
            </div>
            <h3 className="text-base font-bold uppercase tracking-tight text-white mt-0.5 flex items-center gap-2">
              <Users size={16} className="text-accent" />
              <span>Refer 5 Resellers · Unlock 4X VIP Rates</span>
            </h3>
          </div>
          <div className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-white font-bold text-[11px] shrink-0">
            {activeReferrals} / 5 MERCHANTS
          </div>
        </div>

        <p className="text-zinc-400 text-[11px] mb-4 font-sans leading-relaxed">
          Invite fellow students, coworkers, or merchants to start reselling data on OrbitVTU. Once 5 of your referrals complete their first vend, you permanently unlock <strong className="text-white">4X MAX VIP wholesale discounts</strong> (up to 24% off official telco prices)!
        </p>

        {/* 5-Step Visual Progress Indicator */}
        <div className="space-y-2 mb-4">
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((step) => {
              const completed = step <= activeReferrals;
              return (
                <div
                  key={step}
                  className={`h-2 transition-all ${
                    completed
                      ? 'bg-accent shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                      : 'bg-zinc-950 border border-zinc-800'
                  }`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>Entry (3X Triple)</span>
            <span>{5 - activeReferrals > 0 ? `${5 - activeReferrals} more to 4X` : '4X MAX Active'}</span>
            <span className="text-accent font-bold">4X MAX VIP</span>
          </div>
        </div>

        {/* Referral Link Copy Area */}
        <div className="p-3 bg-black/60 border border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5 min-w-0">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Your Reseller Invite Link:</span>
            <div className="text-[11px] text-zinc-200 truncate font-mono select-all">
              {referralUrl}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyReferral}
            className="px-4 py-2 bg-accent hover:bg-white text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 active:scale-95"
          >
            {copiedLink ? <Check size={13} /> : <Copy size={13} />}
            <span>{copiedLink ? 'LINK COPIED' : 'COPY INVITE LINK'}</span>
          </button>
        </div>
      </section>

      {/* ── MODULE 2: 7-Day Buying Streak Tracker (Unlocks 5X Ultra VIP) ── */}
      <section className={`border p-4 md:p-5 relative overflow-hidden backdrop-blur-md transition-all ${
        is5XUnlocked
          ? 'bg-gradient-to-br from-purple-950/40 via-zinc-900 to-emerald-950/40 border-purple-500/40'
          : 'bg-zinc-900/60 border-zinc-800'
      }`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-amber-400 uppercase tracking-[0.2em] font-bold">Loyalty & Streak</span>
              {is5XUnlocked && (
                <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-emerald-500 text-white text-[9px] font-bold uppercase tracking-wider">
                  5X ULTRA VIP ACTIVE
                </span>
              )}
            </div>
            <h3 className="text-base font-bold uppercase tracking-tight text-white mt-0.5 flex items-center gap-2">
              <Flame size={16} className="text-amber-400" />
              <span>7-Day Buying Streak · Unlock 5X VIP</span>
            </h3>
          </div>
          <div className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[11px] shrink-0">
            🔥 DAY {streakDays} OF 7
          </div>
        </div>

        <p className="text-zinc-400 text-[11px] mb-4 font-sans leading-relaxed">
          Maintain momentum by buying data at least once every 24 hours. Reaching Day 7 unlocks <strong className="text-white">5X Ultra VIP (Up to 30% off official prices, 50% merchant profit share)</strong> and the locked Data Reselling Tools!
        </p>

        {/* 7 Flame Tracker */}
        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const active = day <= streakDays;
            return (
              <div
                key={day}
                className={`py-2 text-center border flex flex-col items-center justify-center gap-1 transition-all ${
                  active
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 font-bold shadow-sm'
                    : 'bg-zinc-950/80 border-zinc-800 text-zinc-600'
                }`}
              >
                <Flame size={14} className={active ? 'text-amber-400 animate-pulse' : 'text-zinc-700'} />
                <span className="text-[10px]">D{day}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-zinc-400 pt-3 border-t border-zinc-800 gap-2">
          <span>
            ⚡ Fast-Track Option: Maintain <strong className="text-white">₦10,000+ wallet balance</strong> to bypass the streak and activate 5X VIP immediately.
          </span>
          <button
            type="button"
            onClick={onOpenQuickVend}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-[10px] uppercase tracking-wider border border-zinc-700 cursor-pointer shrink-0"
          >
            VEND NOW TO KEEP STREAK
          </button>
        </div>
      </section>

      {/* ── MODULE 3: Reseller Performance & Analytics ── */}
      <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-accent" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Reseller Analytics</h3>
          </div>
          <span className="text-[10px] text-zinc-500">REAL-TIME</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Today's Vends</span>
            <span className="text-lg font-bold text-white mt-1 block">
              {user.metrics?.totalOrders || 0}
            </span>
          </div>

          <div className="p-3 bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Today's Profit</span>
            <span className="text-lg font-bold text-accent mt-1 block">
              +₦{(user.metrics?.totalProfitNaira || 0).toLocaleString()}
            </span>
          </div>

          <div className="p-3 bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">All-Time Vends</span>
            <span className="text-lg font-bold text-zinc-300 mt-1 block">
              {user.metrics?.totalOrders || 0}
            </span>
          </div>

          <div className="p-3 bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">All-Time Revenue</span>
            <span className="text-lg font-bold text-zinc-300 mt-1 block">
              ₦{(user.metrics?.totalRevenueNaira || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      {/* ── MODULE 4: Custom Branding Suite ── */}
      <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Store size={16} className="text-accent" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Custom Brand Studio</h3>
          </div>
          <span className="text-[10px] text-zinc-500">AUTO-SYNCED</span>
        </div>

        <p className="text-zinc-400 text-[11px] mb-4 font-sans leading-relaxed">
          Your store name and WhatsApp support contact are automatically injected into your WhatsApp status drops, 5G price cards, and in-UI customer receipts.
        </p>

        <form onSubmit={handleSaveBranding} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                Store / Brand Name:
              </label>
              <input
                type="text"
                value={storeNameInput}
                onChange={(e) => setStoreNameInput(e.target.value)}
                placeholder="e.g. SwiftGig Telecom"
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 text-xs focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                Customer Support WhatsApp:
              </label>
              <input
                type="text"
                value={supportPhoneInput}
                onChange={(e) => setSupportPhoneInput(e.target.value)}
                placeholder="e.g. 08012345678"
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-3 py-2 text-xs focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-emerald-400 font-bold">
              {brandSaved && '✓ Brand settings saved to phone!'}
            </span>
            <button
              type="submit"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider border border-zinc-700 hover:border-accent transition-all cursor-pointer active:scale-95"
            >
              SAVE BRAND SETTINGS
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

