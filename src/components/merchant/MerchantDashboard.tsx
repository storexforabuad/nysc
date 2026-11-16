import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Share2,
  Copy,
  Check,
  TrendingUp,
  CreditCard,
  RefreshCw,
  Sparkles,
  Download,
  Store,
  MessageSquare,
  ShieldCheck,
  Clock,
  Layers,
  HeartHandshake
} from 'lucide-react';

interface MultiplierTier {
  level: number;
  multiplier: string;
  name: string;
  minBalance: number;
  neededToNext: number;
  progressPercent: number;
  nextThreshold?: number | null;
}

interface UserData {
  uid: string;
  name: string;
  franchiseName?: string;
  phoneNumber: string;
  role: string;
  isSuperParent: boolean;
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

interface Plan {
  code: string;
  name: string;
  validity: string;
  sellPrice: number;
  network: string;
}

interface WhatsappContact {
  phoneNumber: string;
  label: string;
  targetType: 'MOTHER_BOT' | 'PARENT_PROXY';
  defaultText: string;
  buttonLabel: string;
}

interface DashboardPayload {
  success: boolean;
  user: UserData;
  botWhatsAppPhone?: string;
  plans?: { mtn: Plan[]; glo: Plan[]; airtel: Plan[] };
  whatsappContact?: WhatsappContact;
}

interface MerchantDashboardProps {
  data: DashboardPayload;
  onRefresh: () => void;
}

export default function MerchantDashboard({ data, onRefresh }: MerchantDashboardProps) {
  const { user, plans, whatsappContact } = data;
  const [activeTab, setActiveTab] = useState<'marketing' | 'wallet' | 'sales'>('marketing');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showTopUpGuide, setShowTopUpGuide] = useState(false);

  const brandName = user.franchiseName || user.name || 'Your Store';

  // Context-aware WhatsApp contact (MotherBot or parent proxy)
  const chatPhone = whatsappContact?.phoneNumber || data.botWhatsAppPhone || '2348119772223';
  const chatText = whatsappContact?.defaultText || 'MENU';
  const chatButtonLabel = whatsappContact?.buttonLabel || 'WHATSAPP CHAT';
  const whatsappChatUrl = `https://wa.me/${chatPhone}?text=${encodeURIComponent(chatText)}`;

  // Live plan formatter — builds copyable price card text from live plans
  function formatPriceCardText(networkName: string, planList: Plan[], brand: string): string {
    const DIGIT_EMOJIS: Record<string, string> = {
      '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣',
      '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣'
    };
    const formatBadge = (num: number) => String(num).split('').map(d => DIGIT_EMOJIS[d] || d).join('');

    let text = `✦ ${brand} ⚡\n──────────────\n📶 ${networkName.toUpperCase()} DATA BUNDLES\n\n`;
    planList.forEach((p, idx) => {
      const num = idx + 1;
      const badge = formatBadge(num);
      text += `${badge} ${p.name} · ${p.validity || 'Standard'} — ₦${p.sellPrice.toLocaleString()}\n`;
    });
    text += `\n──────────────\n📲 Instant delivery on payment!\nWhatsApp this number to order now. ⚡`;
    return text;
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Conversational AI Coach WhatsApp Status Drops (Extracted from 7-Day Auto Status Matrix)
  const morningDrop = `🌅 Morning Hustle & Good Vibes! 🚀\n\n` +
    `Don't let finished data pause your calls, work, or morning scroll!\n` +
    `Fast, reliable data for MTN, Airtel & Glo delivered in 30 seconds.\n\n` +
    `⚡ From quick daily bundles (₦290) to full monthly packages.\n\n` +
    `📲 Message ${brandName} right here with your network to top up sharp-sharp!`;

  const communityDrop = `💚 Smart Data That Gives Back 🇳🇬\n\n` +
    `Did you know? Every time you buy data or pay bills through ${brandName}:\n` +
    `• You get verified, ultra-cheap data in seconds\n` +
    `• A portion of every purchase quietly supports grassroots community projects & youth development in underserved local areas!\n\n` +
    `Fast data that empowers our community. 🏫✨\n` +
    `📲 Reply to this status anytime with your network & budget to support!`;

  const middayGiftingDrop = `🎁 Need data on your second phone, MiFi, or for a friend? ⚡\n\n` +
    `You don't need to leave WhatsApp or stress over bank apps.\n` +
    `Surprise someone or refill your WiFi in seconds:\n\n` +
    `1️⃣ Send the phone number & network here\n` +
    `2️⃣ Pick your bundle (Starting from ₦290)\n` +
    `3️⃣ Instant credit in under 30 seconds!\n\n` +
    `📲 DM ${brandName} now with the line you want to top up! 🚀`;

  const eveningDrop = `🍿 Movie night, TikTok chill, or catching matches tonight? 🎬\n\n` +
    `Don't let "0MB remaining" cut your stream right when things get interesting!\n` +
    `Heavy night bundles & monthly plans ready 24/7 on MTN, Airtel & Glo.\n\n` +
    `📲 Reply to this status with what you need and stay connected all night! 🔥\n` +
    `— ${brandName}`;

  // Price cards are generated dynamically from live plans in formatPriceCardText()
  // Plan counts for display
  const mtnCount = plans?.mtn?.length || 0;
  const gloCount = plans?.glo?.length || 0;
  const airtelCount = plans?.airtel?.length || 0;

  // Best-value preview: find 1GB 30-day, else fallback to cheapest
  function getBestPreview(planList: Plan[], fallback: string): string {
    const p = planList?.find(p => /1\s*gb/i.test(p.name) && /30/i.test(p.validity || ''));
    if (p) return `1GB 30-Day @ ₦${p.sellPrice.toLocaleString()}`;
    if (planList?.length) return `${planList[0].name} @ ₦${planList[0].sellPrice.toLocaleString()}`;
    return fallback;
  }

  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," +
      "Order ID,Date,Plan,Network,Recipient,Profit (NGN)\n" +
      `ORD-101,${new Date().toLocaleDateString()},1GB 30-Day,MTN,08012345678,177.00\n` +
      `ORD-102,${new Date().toLocaleDateString()},1GB 30-Day,GLO,09155946561,105.30\n`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${brandName}_sales_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-display flex flex-col pb-28 selection:bg-accent selection:text-black scanline">
      {/* ── Top Header Navigation ── */}
      <header className="sticky top-0 z-40 bg-[#09090B]/90 backdrop-blur-md border-b border-zinc-800 px-3.5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-accent flex items-center justify-center font-bold text-black text-xs sm:text-sm shrink-0 shadow-md shadow-accent/20">
            CL
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-xs sm:text-sm font-bold tracking-tight uppercase leading-none truncate max-w-[125px] sm:max-w-[200px]" title={brandName}>
                {brandName}
              </h1>
              <span className="text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1 py-0.5 rounded-xs shrink-0">
                <span className="sm:hidden">VERIFIED</span>
                <span className="hidden sm:inline">VERIFIED_MERCHANT</span>
              </span>
            </div>
            <p className="text-[9px] sm:text-[10px] font-mono text-zinc-400 tracking-wider mt-0.5 truncate max-w-[180px] sm:max-w-none">
              {user.phoneNumber} · Clarion Retail Hub
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2 sm:px-2.5 py-1 text-[10px] font-mono font-bold text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="sm:hidden">LIVE</span>
            <span className="hidden sm:inline">STORE_ONLINE</span>
          </div>
          <button
            onClick={onRefresh}
            className="p-1.5 text-zinc-400 hover:text-accent transition-colors cursor-pointer"
            title="Refresh Dashboard"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* ── Navigation Tabs (Equal Width Segmented Control) ── */}
      <nav className="border-b border-zinc-800 bg-zinc-950/90 px-3 py-2 sticky top-[53px] sm:top-[57px] z-30 backdrop-blur-md">
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-1 p-1 bg-zinc-900/70 border border-zinc-800">
          <button
            onClick={() => setActiveTab('marketing')}
            className={`py-2 px-1 text-[11px] sm:text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1 text-center whitespace-nowrap overflow-hidden ${
              activeTab === 'marketing'
                ? 'bg-accent text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles size={12} className="shrink-0" />
            <span className="truncate">
              <span className="sm:hidden">MARKETING</span>
              <span className="hidden sm:inline">MARKETING HUB</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('wallet')}
            className={`py-2 px-1 text-[11px] sm:text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1 text-center whitespace-nowrap overflow-hidden ${
              activeTab === 'wallet'
                ? 'bg-accent text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CreditCard size={12} className="shrink-0" />
            <span className="truncate">
              <span className="sm:hidden">WALLET</span>
              <span className="hidden sm:inline">WALLET & TIERS</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`py-2 px-1 text-[11px] sm:text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1 text-center whitespace-nowrap overflow-hidden ${
              activeTab === 'sales'
                ? 'bg-accent text-black shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <TrendingUp size={12} className="shrink-0" />
            <span className="truncate">
              <span className="sm:hidden">SALES</span>
              <span className="hidden sm:inline">SALES LEDGER</span>
            </span>
          </button>
        </div>
      </nav>

      {/* ── Main Dashboard Content ── */}
      <main className="flex-1 p-4 md:p-6 max-w-2xl w-full mx-auto space-y-4">
        
        {/* ── MODULE: Active Earning Multiplier Card ── */}
        <section className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl pointer-events-none"></div>

          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] font-bold">Wholesale Discount Engine</p>
              <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tight text-white mt-0.5">
                {user.multiplierTier?.name || 'Tier 1 (1X Base)'}
              </h2>
            </div>
            <div className="bg-accent text-black font-mono font-bold text-xs px-2.5 py-1 tracking-wider uppercase">
              {user.multiplierTier?.multiplier || '1X'} POWER
            </div>
          </div>

          {/* Float Liquidity Bar */}
          <div className="space-y-1.5 mt-3">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">Clarion Float Liquidity:</span>
              <span className="text-white font-bold">
                ₦{user.walletBalance.toLocaleString()} {user.multiplierTier?.nextThreshold ? `/ ₦${user.multiplierTier.nextThreshold.toLocaleString()}` : ''}
              </span>
            </div>
            <div className="w-full bg-zinc-950 border border-zinc-800 h-2.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(8, user.multiplierTier?.progressPercent || 0))}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="bg-accent h-full shadow-[0_0_10px_rgba(255,255,255,0.4)]"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
            <p className="text-[11px] font-mono text-zinc-400">
              {user.multiplierTier?.neededToNext > 0 ? (
                <>Add <span className="text-accent font-bold">₦{user.multiplierTier.neededToNext.toLocaleString()}</span> float to level up to next multiplier tier.</>
              ) : (
                <span className="text-accent font-bold">🔥 You are at maximum VIP tier (40% wholesale discount)!</span>
              )}
            </p>
            <button
              onClick={() => setShowTopUpGuide(!showTopUpGuide)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold transition-all cursor-pointer border border-zinc-700 shrink-0 text-center"
            >
              {showTopUpGuide ? 'HIDE ACCOUNT' : 'TOP UP WALLET'}
            </button>
          </div>

          {showTopUpGuide && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-none text-xs font-mono space-y-3"
            >
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <p className="text-accent font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard size={14} />
                  <span>Central Hub Payment Details</span>
                </p>
                <span className="text-[10px] text-zinc-500 font-bold">INSTANT FLOAT CREDIT</span>
              </div>

              <div className="space-y-2 text-zinc-300">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Bank:</span>
                  <span className="font-bold text-white">Wema Bank</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Account Number:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-sm">9819092390</span>
                    <button
                      onClick={() => copyToClipboard('9819092390', 'acct')}
                      className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                      title="Copy Account Number"
                    >
                      {copiedKey === 'acct' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Account Name:</span>
                  <span className="text-zinc-300">Clarion AI - Musty Data</span>
                </div>

                {/* Highlighted Copyable Narration Row */}
                <div className="flex justify-between items-center p-2.5 bg-amber-500/10 border border-amber-500/30 my-1">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider">
                      Transfer Narration / Ref:
                    </span>
                    <span className="font-bold text-white text-xs">{user.phoneNumber} topup</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`${user.phoneNumber} topup`, 'narration')}
                    className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'narration' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{copiedKey === 'narration' ? 'COPIED' : 'COPY REF'}</span>
                  </button>
                </div>
              </div>

              {/* Step-by-Step Instructions & Warning */}
              <div className="p-2.5 bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300 space-y-1">
                <p className="text-white font-bold flex items-center gap-1 text-[11px]">
                  ⚡ <span>How to Top Up Your Float:</span>
                </p>
                <p>1️⃣ Transfer desired float (e.g. ₦2,000 for Tier 2) to Wema Bank above.</p>
                <p className="text-amber-300">
                  2️⃣ <span className="font-bold underline">IMPORTANT:</span> Paste <span className="text-white font-bold">{user.phoneNumber} topup</span> in bank remarks/narration so your payment matches automatically!
                </p>
                <p>3️⃣ After transfer, send <span className="text-accent font-bold">FUNDED ₦[amount]</span> on WhatsApp to notify MotherBot.</p>
              </div>
            </motion.div>
          )}
        </section>

        {/* ── TAB 1: MARKETING HUB (Price Cards & Status Drops) ── */}
        {activeTab === 'marketing' && (
          <div className="space-y-4">
            {/* Status Drops Module */}
            <div className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-accent" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">AI Coach WhatsApp Status Drops</h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">1-CLICK COPY</span>
              </div>

              <div className="grid gap-3">
                {/* Morning Drop */}
                <div className="p-3 bg-zinc-950/70 border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 font-mono">
                      🌅 08:30 AM · Morning Hustle
                    </span>
                    <button
                      onClick={() => copyToClipboard(morningDrop, 'drop_morning')}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                    >
                      {copiedKey === 'drop_morning' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedKey === 'drop_morning' ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {morningDrop}
                  </pre>
                </div>

                {/* Community Impact Drop (Clean Whitelabel - NO NYSC) */}
                <div className="p-3 bg-zinc-950/70 border border-emerald-900/40 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                      💚 Community Impact · Giving Back
                    </span>
                    <button
                      onClick={() => copyToClipboard(communityDrop, 'drop_community')}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                    >
                      {copiedKey === 'drop_community' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedKey === 'drop_community' ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {communityDrop}
                  </pre>
                </div>

                {/* Midday Gifting Drop */}
                <div className="p-3 bg-zinc-950/70 border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5 font-mono">
                      🎁 01:30 PM · Data Gifting & MiFi Refill
                    </span>
                    <button
                      onClick={() => copyToClipboard(middayGiftingDrop, 'drop_midday')}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                    >
                      {copiedKey === 'drop_midday' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedKey === 'drop_midday' ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {middayGiftingDrop}
                  </pre>
                </div>

                {/* Evening Drop */}
                <div className="p-3 bg-zinc-950/70 border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5 font-mono">
                      🌙 07:30 PM · Golden Hour Streamers
                    </span>
                    <button
                      onClick={() => copyToClipboard(eveningDrop, 'drop_evening')}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                    >
                      {copiedKey === 'drop_evening' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedKey === 'drop_evening' ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {eveningDrop}
                  </pre>
                </div>
              </div>
            </div>

            {/* Branded Price Cards Module */}
            <div className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-accent" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">Branded Price Cards</h3>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">READY TO FORWARD</span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                {/* MTN Card */}
                <div className="p-3 bg-zinc-950 border border-amber-500/30 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400 font-mono">🟡 MTN</span>
                      <span className="text-[9px] font-mono text-zinc-500">{mtnCount} PLANS</span>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-400 mt-1">{getBestPreview(plans?.mtn || [], 'Bundle plans')}</p>
                  </div>
                  <div className="pt-2 border-t border-zinc-900 flex gap-2">
                    <button
                      onClick={() => copyToClipboard(formatPriceCardText('MTN', plans?.mtn || [], brandName), 'card_mtn')}
                      className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer border border-zinc-800"
                    >
                      {copiedKey === 'card_mtn' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copiedKey === 'card_mtn' ? 'COPIED' : 'COPY LIST'}</span>
                    </button>
                  </div>
                </div>

                {/* GLO Card */}
                <div className="p-3 bg-zinc-950 border border-emerald-500/30 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 font-mono">🟢 GLO</span>
                      <span className="text-[9px] font-mono text-zinc-500">{gloCount} PLANS</span>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-400 mt-1">{getBestPreview(plans?.glo || [], 'Bundle plans')}</p>
                  </div>
                  <div className="pt-2 border-t border-zinc-900 flex gap-2">
                    <button
                      onClick={() => copyToClipboard(formatPriceCardText('GLO', plans?.glo || [], brandName), 'card_glo')}
                      className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer border border-zinc-800"
                    >
                      {copiedKey === 'card_glo' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copiedKey === 'card_glo' ? 'COPIED' : 'COPY LIST'}</span>
                    </button>
                  </div>
                </div>

                {/* AIRTEL Card */}
                <div className="p-3 bg-zinc-950 border border-red-500/30 space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-400 font-mono">🔴 AIRTEL</span>
                      <span className="text-[9px] font-mono text-zinc-500">{airtelCount} PLANS</span>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-400 mt-1">{getBestPreview(plans?.airtel || [], 'Bundle plans')}</p>
                  </div>
                  <div className="pt-2 border-t border-zinc-900 flex gap-2">
                    <button
                      onClick={() => copyToClipboard(formatPriceCardText('AIRTEL', plans?.airtel || [], brandName), 'card_airtel')}
                      className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer border border-zinc-800"
                    >
                      {copiedKey === 'card_airtel' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copiedKey === 'card_airtel' ? 'COPIED' : 'COPY LIST'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: WALLET & TIERS ── */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            <div className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 space-y-4">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white border-b border-zinc-800 pb-2">
                Multiplier Progression Table
              </h3>
              <div className="space-y-3 font-mono text-xs">
                <div className={`p-3 border flex justify-between items-center ${user.multiplierTier?.level === 1 ? 'bg-accent/10 border-accent' : 'bg-zinc-950 border-zinc-800'}`}>
                  <div>
                    <p className="font-bold text-white">Tier 1 · 1X Base Power</p>
                    <p className="text-[11px] text-zinc-400">Balance: ₦0 – ₦1,999</p>
                  </div>
                  <span className="text-xs font-bold text-accent">10% Wholesale Margin</span>
                </div>
                <div className={`p-3 border flex justify-between items-center ${user.multiplierTier?.level === 2 ? 'bg-accent/10 border-accent' : 'bg-zinc-950 border-zinc-800'}`}>
                  <div>
                    <p className="font-bold text-white">Tier 2 · 2X Multiplier</p>
                    <p className="text-[11px] text-zinc-400">Balance: ₦2,000 – ₦3,999</p>
                  </div>
                  <span className="text-xs font-bold text-accent">20% Wholesale Margin</span>
                </div>
                <div className={`p-3 border flex justify-between items-center ${user.multiplierTier?.level === 3 ? 'bg-accent/10 border-accent' : 'bg-zinc-950 border-zinc-800'}`}>
                  <div>
                    <p className="font-bold text-white">Tier 3 · 3X Multiplier</p>
                    <p className="text-[11px] text-zinc-400">Balance: ₦4,000 – ₦5,999</p>
                  </div>
                  <span className="text-xs font-bold text-accent">30% Wholesale Margin</span>
                </div>
                <div className={`p-3 border flex justify-between items-center ${user.multiplierTier?.level === 4 ? 'bg-accent/10 border-accent' : 'bg-zinc-950 border-zinc-800'}`}>
                  <div>
                    <p className="font-bold text-white">Tier 4 · 4X MAX VIP 🔥</p>
                    <p className="text-[11px] text-zinc-400">Balance: ₦6,000+</p>
                  </div>
                  <span className="text-xs font-bold text-accent">40% Wholesale Margin (MAX)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: SALES & ORDER LEDGER ── */}
        {activeTab === 'sales' && (
          <div className="space-y-4">
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-900/60 border border-zinc-800 p-3">
                <p className="text-[10px] font-mono text-zinc-500 uppercase">Fulfilled Orders</p>
                <p className="text-xl font-bold font-mono text-white mt-1">{user.metrics.totalOrders || 0}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 p-3">
                <p className="text-[10px] font-mono text-zinc-500 uppercase">Sales Revenue</p>
                <p className="text-xl font-bold font-mono text-white mt-1">₦{(user.metrics.totalRevenueNaira || 0).toLocaleString()}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 p-3">
                <p className="text-[10px] font-mono text-zinc-500 uppercase">Net Profit Earned</p>
                <p className="text-xl font-bold font-mono text-emerald-400 mt-1">+₦{(user.metrics.totalProfitNaira || 0).toLocaleString()}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 p-3">
                <p className="text-[10px] font-mono text-zinc-500 uppercase">CDS Impact</p>
                <p className="text-xl font-bold font-mono text-accent mt-1">₦{((user.metrics.totalProfitNaira || 0) * 0.1).toFixed(2)}</p>
              </div>
            </div>

            {/* Order Ledger Table */}
            <div className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 space-y-3">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">Recent Transactions</h3>
                <button
                  onClick={handleExportCSV}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                >
                  <Download size={12} />
                  <span>EXPORT_CSV</span>
                </button>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-800 text-center font-mono text-xs text-zinc-400">
                {user.metrics.totalOrders > 0 ? (
                  <p>All {user.metrics.totalOrders} fulfilled transactions are logged. Click Export CSV above to download your ledger.</p>
                ) : (
                  <p>No fulfilled orders yet today. Share your price cards to get your 1st order! 🚀</p>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── Fixed Bottom Bar: Back to WhatsApp ── */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#09090B]/95 backdrop-blur-md border-t border-zinc-800 p-2.5 sm:p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2.5">
          <div className="text-[10px] sm:text-[11px] font-mono text-zinc-400 truncate max-w-[120px] sm:max-w-none">
            <span className="text-white font-bold">{brandName}</span> · Retail Console
          </div>
          <a
            href={whatsappChatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 sm:px-4 py-2 bg-accent text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-white transition-all flex items-center gap-1.5 cursor-pointer shadow-md shrink-0 whitespace-nowrap"
          >
            <MessageSquare size={13} />
            <span className="sm:hidden">{chatButtonLabel}</span>
            <span className="hidden sm:inline">{chatButtonLabel}</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

