import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  HeartHandshake,
  Send,
  ArrowDownToLine,
  Phone,
  UserCheck,
  AlertCircle,
  X,
  Sliders,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  Maximize2,
  Building2,
  Bell
} from 'lucide-react';
import NotificationsModal from '../orbit/NotificationsModal';
import OrbitTab from '../orbit/OrbitTab';
import { generateMotherBotNotifications, markAllNotificationsAsRead, type MotherBotNotification } from '../../services/motherBotEngine';

interface MultiplierTier {
  level: number;
  multiplier: string;
  name: string;
  minBalance: number;
  neededToNext: number;
  progressPercent: number;
  nextThreshold?: number | null;
}

interface TierDefinition {
  level: number;
  multiplier: string;
  name: string;
  balanceRange: string;
  minBalance: number;
  maxBalance: number | null;
  ratePercent: number;
  description: string;
}

const ALL_TIERS: TierDefinition[] = [
  { level: 1, multiplier: '1X', name: 'Tier 1 · 1X Base Power', balanceRange: '₦0 – ₦1,999', minBalance: 0, maxBalance: 1999, ratePercent: 10, description: 'Default entry tier. Earn guaranteed 10% wholesale margin on every customer order.' },
  { level: 2, multiplier: '1.5X', name: 'Tier 2 · 1.5X Power', balanceRange: '₦2,000 – ₦3,999', minBalance: 2000, maxBalance: 3999, ratePercent: 15, description: '50% more earning power! Margin jumps to 15% and unlocks cashouts to your bank.' },
  { level: 3, multiplier: '2X', name: 'Tier 3 · 2X Double Power', balanceRange: '₦4,000 – ₦5,999', minBalance: 4000, maxBalance: 5999, ratePercent: 20, description: 'Double earning power! Earn 20% margin on all personal retail volume.' },
  { level: 4, multiplier: '2.5X', name: 'Tier 4 · 2.5X Power', balanceRange: '₦6,000 – ₦7,999', minBalance: 6000, maxBalance: 7999, ratePercent: 25, description: '25% margin. Unlocks squad mentorship & downstream commissions.' },
  { level: 5, multiplier: '3X', name: 'Tier 5 · 3X Triple Power', balanceRange: '₦8,000 – ₦9,999', minBalance: 8000, maxBalance: 9999, ratePercent: 30, description: 'Triple power! 30% margin on all personal data transactions.' },
  { level: 6, multiplier: '4X', name: 'Tier 6 · 4X MAX VIP 🔥', balanceRange: '₦10,000+', minBalance: 10000, maxBalance: null, ratePercent: 40, description: 'Maximum VIP tier. 40% margin — the highest earning rate in the ecosystem.' }
];

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
    bankCode?: string;
    bankName: string;
    accountNumber?: string;
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
  baseCost?: number;
  officialPrice?: number;
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
  const [activeTab, setActiveTab] = useState<'marketing' | 'wallet' | 'sales' | 'orbit'>('marketing');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showTopUpGuide, setShowTopUpGuide] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifications, setNotifications] = useState<MotherBotNotification[]>(() =>
    generateMotherBotNotifications({
      todayVends: (data.user.metrics?.totalOrders || 0),
      todayProfit: (data.user.metrics?.totalProfitNaira || 0),
      streakDays: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_streak_days') || '4') : '4', 10),
      activeReferrals: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_active_referrals') || '3') : '3', 10),
      brandName: data.user.franchiseName || data.user.name || undefined
    })
  );
  const unreadNotifCount = notifications.filter(n => !n.read).length;
  const refreshNotifications = () =>
    setNotifications(generateMotherBotNotifications({
      todayVends: (data.user.metrics?.totalOrders || 0),
      todayProfit: (data.user.metrics?.totalProfitNaira || 0),
      streakDays: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_streak_days') || '4') : '4', 10),
      activeReferrals: parseInt(typeof window !== 'undefined' ? (localStorage.getItem('orbit_active_referrals') || '3') : '3', 10),
      brandName: data.user.franchiseName || data.user.name || undefined
    }));

  // Top Up Calculator State
  const [fundAmount, setFundAmount] = useState<number>(2000);
  const [isSubmittingFund, setIsSubmittingFund] = useState(false);
  const [fundSuccessMsg, setFundSuccessMsg] = useState<string | null>(null);

  // Paystack Inflow Fee Calculation Formula
  const calculateInflowPaystackFee = (amount: number) => {
    const num = Number(amount) || 0;
    if (num <= 0) return 0;
    if (num < 2500) {
      return Math.round(num * 0.015);
    }
    return Math.min(2000, Math.round(num * 0.015 + 100));
  };
  const paystackFee = calculateInflowPaystackFee(fundAmount);
  const totalToTransfer = fundAmount + paystackFee;

  // Withdrawal / Cashout Modal State
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('2000');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState<string | null>(null);

  // Bank Linking Modal State
  const [showBankModal, setShowBankModal] = useState(false);
  const [banksList, setBanksList] = useState<Array<{ name: string; code: string }>>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(false);
  const [selectedBankCode, setSelectedBankCode] = useState<string>('');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>('');
  const [resolvedAccountName, setResolvedAccountName] = useState<string | null>(null);
  const [isResolvingBank, setIsResolvingBank] = useState(false);
  const [resolveBankError, setResolveBankError] = useState<string | null>(null);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [saveBankError, setSaveBankError] = useState<string | null>(null);
  const [saveBankSuccessMsg, setSaveBankSuccessMsg] = useState<string | null>(null);

  // Direct Vending Modal State & Unified Terminal
  const [vendingPlan, setVendingPlan] = useState<Plan | null>(null);
  const vendPlanListRef = useRef<HTMLDivElement>(null);
  const [vendNetworkTab, setVendNetworkTab] = useState<'mtn' | 'glo' | 'airtel'>('mtn');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [isVending, setIsVending] = useState(false);
  const [vendError, setVendError] = useState<string | null>(null);
  const [vendSuccessMsg, setVendSuccessMsg] = useState<string | null>(null);
  const [lastVendedBundle, setLastVendedBundle] = useState<{
    code: string;
    network: string;
    name: string;
    validity: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('clarion_last_vended_bundle');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Auto-scroll selected plan into visible viewport in vend modal
  useEffect(() => {
    if (vendingPlan && vendPlanListRef.current) {
      const selectedEl = vendPlanListRef.current.querySelector(`[data-plan-code="${vendingPlan.code}"]`) as HTMLElement | null;
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [vendingPlan?.code, vendNetworkTab]);

  // Open Unified Quick-Vend Modal helper with favorite/recent auto-select
  const openUnifiedVendModal = (targetNetwork?: 'mtn' | 'glo' | 'airtel') => {
    const net = targetNetwork || (lastVendedBundle?.network?.toLowerCase() as 'mtn' | 'glo' | 'airtel') || 'mtn';
    setVendNetworkTab(net);
    const netPlans = plans?.[net] || [];
    const matchedPlan = lastVendedBundle && lastVendedBundle.network.toLowerCase() === net
      ? netPlans.find(p => p.code === lastVendedBundle.code) || netPlans[0]
      : netPlans[0];
    setVendingPlan(matchedPlan || null);
    setRecipientPhone('');
    setVendError(null);
    setVendSuccessMsg(null);
  };

  // 1-Click Top Up from Modal -> Switches to Wallet tab, auto-opens Top Up Area, pre-fills needed amount, and scrolls down
  const handleModalTopUpClick = (neededAmount?: number) => {
    setVendingPlan(null);
    setActiveTab('wallet');
    setShowTopUpGuide(true);
    if (neededAmount && neededAmount > 0) {
      setFundAmount(neededAmount);
    }
    setTimeout(() => {
      topUpCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  // Collapsible Marketing Sections & Click-Outside Auto-Collapse
  const [statusDropsExpanded, setStatusDropsExpanded] = useState<boolean>(false);
  const [priceCardsExpanded, setPriceCardsExpanded] = useState<boolean>(false);
  const statusDropsRef = useRef<HTMLDivElement>(null);
  const priceCardsRef = useRef<HTMLDivElement>(null);

  // Progressive Multiplier Progression Table & Auto-Fold
  const [showAllTiers, setShowAllTiers] = useState<boolean>(false);
  const progressionTableRef = useRef<HTMLDivElement>(null);
  const topUpCardRef = useRef<HTMLDivElement>(null);

  // Interactive Tier Breakdown Modal
  const [selectedTierForModal, setSelectedTierForModal] = useState<TierDefinition | null>(null);

  // Full-Screen Wholesale Pricing & Tier Matrix Modal
  const [showPricingMatrixModal, setShowPricingMatrixModal] = useState<boolean>(false);
  const [matrixNetworkFilter, setMatrixNetworkFilter] = useState<'ALL' | 'MTN' | 'GLO' | 'AIRTEL'>('ALL');
  const [matrixSelectedTier, setMatrixSelectedTier] = useState<number>(6);
  const [matrixSearchQuery, setMatrixSearchQuery] = useState<string>('');

  // Viewport Auto-Adjust Helper with Sticky Navigation Clearance (~105px)
  const smoothScrollToElement = (el: HTMLElement | null, offset = 105) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + window.pageYOffset;
    const targetY = Math.max(0, absoluteTop - offset);
    window.scrollTo({
      top: targetY,
      behavior: 'smooth'
    });
  };

  const toggleStatusDrops = () => {
    setStatusDropsExpanded((prev) => !prev);
  };

  const togglePriceCards = () => {
    setPriceCardsExpanded((prev) => !prev);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (statusDropsRef.current && !statusDropsRef.current.contains(target)) {
        setStatusDropsExpanded(false);
      }
      if (priceCardsRef.current && !priceCardsRef.current.contains(target)) {
        setPriceCardsExpanded(false);
      }
      if (progressionTableRef.current && !progressionTableRef.current.contains(target)) {
        setShowAllTiers(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch Nigerian Banks List when Bank Modal Opens
  useEffect(() => {
    if (showBankModal && banksList.length === 0) {
      setIsLoadingBanks(true);
      fetch('/api/banks')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.banks)) {
            setBanksList(data.banks);
          }
        })
        .catch((err) => {
          console.error('Failed to load banks:', err);
        })
        .finally(() => {
          setIsLoadingBanks(false);
        });
    }
  }, [showBankModal, banksList.length]);

  // Real-time Paystack Account Resolution
  useEffect(() => {
    const cleanAcc = bankAccountNumber.replace(/\D/g, '');
    if (cleanAcc.length === 10 && selectedBankCode) {
      let isCurrent = true;
      setIsResolvingBank(true);
      setResolveBankError(null);

      fetch('/api/banks/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankCode: selectedBankCode, accountNumber: cleanAcc })
      })
        .then((res) => res.json())
        .then((data) => {
          if (!isCurrent) return;
          const resolvedName = data.accountName || data.account_name;
          if (data.success && resolvedName) {
            setResolvedAccountName(resolvedName);
            setResolveBankError(null);
          } else {
            setResolvedAccountName(null);
            setResolveBankError(data.error || 'Could not verify account with bank');
          }
        })
        .catch((err) => {
          if (!isCurrent) return;
          setResolvedAccountName(null);
          setResolveBankError(err.message || 'Verification failed');
        })
        .finally(() => {
          if (isCurrent) setIsResolvingBank(false);
        });

      return () => {
        isCurrent = false;
      };
    } else {
      setResolvedAccountName(null);
      if (cleanAcc.length > 0 && cleanAcc.length !== 10) {
        setResolveBankError(null);
      }
    }
  }, [bankAccountNumber, selectedBankCode]);

  // Dynamic Pricing Strategy Slider:
  // Default to 25% (Campus) on first load so it feels alive. Min is 0% (no floor).
  const [pricingSlider, setPricingSlider] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('clarion_merchant_pricing_slider');
      const num = saved !== null ? Number(saved) : 25;
      return Math.max(0, num);
    } catch {
      return 25;
    }
  });

  const handleSliderChange = (newVal: number) => {
    const clampedVal = Math.max(0, newVal);
    setPricingSlider(clampedVal);
    try {
      localStorage.setItem('clarion_merchant_pricing_slider', String(clampedVal));
    } catch {}
  };

  // Pricing Calculation Helpers
  function getPlanOfficialPrice(plan: Plan): number {
    if (plan.officialPrice) return plan.officialPrice;
    const name = String(plan.name || '').toUpperCase();
    const validity = String(plan.validity || '').toUpperCase();

    if (name.includes('110MB')) return 100;
    if (name.includes('300MB')) return 250;
    if (name.includes('500MB')) return 500;
    if (name.includes('600MB')) return 400;
    if (name.includes('1.2GB')) return 600;
    if (name.includes('1GB') && validity.includes('1 DAY')) return 500;
    if (name.includes('1GB') && validity.includes('3 DAY')) return 400;
    if (name.includes('1GB') && validity.includes('7 DAY')) return 800;
    if (name.includes('1GB') && validity.includes('30 DAY')) return 1000;
    if (name.includes('2GB') && validity.includes('30 DAY')) return 2000;
    if (name.includes('2GB') && validity.includes('7 DAY')) return 1500;
    if (name.includes('2.5GB')) return 1000;
    if (name.includes('3GB') && validity.includes('30 DAY')) return 2500;
    if (name.includes('3GB')) return 1500;
    if (name.includes('3.2GB')) return 1200;
    if (name.includes('4GB')) return 1500;
    if (name.includes('5GB') && validity.includes('30 DAY')) return 3000;
    if (name.includes('5GB')) return 2200;
    if (name.includes('6GB')) return 2000;
    if (name.includes('7GB')) return 3500;
    if (name.includes('10GB')) return 4500;
    if (name.includes('14.5GB')) return 6000;
    if (name.includes('20GB')) return 8000;
    if (name.includes('25GB')) return 10000;
    if (name.includes('36GB')) return 13000;
    if (name.includes('100GB')) return 25000;

    return Math.max(plan.sellPrice, Math.ceil((plan.sellPrice * 1.25) / 50) * 50);
  }

  function getPlanBaseCost(plan: Plan): number {
    return plan.baseCost || Math.round(plan.sellPrice * 0.7);
  }

  function getEffectivePrice(plan: Plan): number {
    const official = getPlanOfficialPrice(plan);
    const cost = getMerchantWholesaleCost(plan, user.walletBalance);
    const floor = Math.max(getPlanBaseCost(plan), cost) + 1; // Strict floor: guaranteed minimum ₦1 profit
    const ceiling = Math.max(official, floor);
    const t = Math.max(0, Math.min(100, pricingSlider)) / 100;
    const raw = ceiling - t * (ceiling - floor);
    const rounded = Math.round(raw / 10) * 10;
    return Math.max(floor, rounded);
  }

  function getMerchantWholesaleCost(plan: Plan, _balance?: number): number {
    // Exact locked wholesale prices for merchants on hot 1GB packages
    if (plan.code === 'M1GB1D') return 290;
    if (plan.code === 'M1GBS') return 550;
    if (plan.code === 'M1GBS2') return 650;
    if (plan.code === 'G1GB1') return 390;
    if (plan.code === 'G1GB2') return 390;
    if (plan.code === 'G1GB4') return 450;
    if (plan.code === 'A1GB') return 800;

    const s = plan.sellPrice;
    const c = getPlanBaseCost(plan);
    const f = s < 2500 ? Math.round(s * 0.015) : Math.min(2000, Math.round(s * 0.015 + 100));
    const netP = Math.max(0, s - c - f);
    // Universal 4X VIP Wholesale Power: All merchants enjoy top 40% margin pool allocation
    const rate = 0.40;
    const discountAmount = Math.round(netP * rate);
    return Math.max(c, s - discountAmount);
  }

  // Clarion Wholesale Price = Base + Paystack Fee + 60% of available gross profit pool
  function calculateClarionWholesalePrice(plan: Plan): number {
    const official = getPlanOfficialPrice(plan);
    const base = getPlanBaseCost(plan);
    const fee = official < 2500 ? Math.round(official * 0.015) : Math.min(2000, Math.round(official * 0.015 + 100));
    const pool = Math.max(1, official - base - fee);
    return Math.round(base + fee + 0.60 * pool);
  }

  // Merchant Wholesale Cost for a specific tier level (1 to 6)
  function calculateTierWholesaleCost(plan: Plan, tierLevel: number): number {
    const official = getPlanOfficialPrice(plan);
    const base = getPlanBaseCost(plan);
    const fee = official < 2500 ? Math.round(official * 0.015) : Math.min(2000, Math.round(official * 0.015 + 100));
    const pool = Math.max(1, official - base - fee);
    const rate = tierLevel === 6 ? 0.40 : tierLevel === 5 ? 0.30 : tierLevel === 4 ? 0.25 : tierLevel === 3 ? 0.20 : tierLevel === 2 ? 0.15 : 0.10;
    const discount = Math.round(rate * pool);
    return Math.max(base, official - discount);
  }

  const brandName = user.franchiseName || user.name || 'Your Store';

  // Context-aware WhatsApp contact (MotherBot or parent proxy)
  // Opens the MotherBot chat directly — no pre-filled text
  const chatPhone = whatsappContact?.phoneNumber || data.botWhatsAppPhone || '2348119772223';
  const chatButtonLabel = whatsappContact?.buttonLabel || 'WHATSAPP CHAT';
  const whatsappChatUrl = `https://wa.me/${chatPhone}`;

  // Live plan formatter — dynamically builds price card text applying the slider discount
  function formatPriceCardText(networkName: string, planList: Plan[], brand: string): string {
    const DIGIT_EMOJIS: Record<string, string> = {
      '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣',
      '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣'
    };
    const formatBadge = (num: number) => String(num).split('').map(d => DIGIT_EMOJIS[d] || d).join('');

    // Network-aware colour emoji
    const networkEmoji: Record<string, string> = { MTN: '🟡', GLO: '🟢', AIRTEL: '🔴' };
    const icon = networkEmoji[networkName.toUpperCase()] || '📶';

    // Dynamic highest savings across active plans for this network (aligned flush, no leading spaces)
    const maxSaving = Math.max(0, ...planList.map(p => getPlanOfficialPrice(p) - getEffectivePrice(p)));
    const savingsSubtitle = maxSaving > 0
      ? `💰 Save up to ₦${maxSaving.toLocaleString()} vs official prices!\n\n`
      : '\n';

    let text = `✦ ${brand} ⚡\n──────────────\n${icon} ${networkName.toUpperCase()} 5G PLANS\n${savingsSubtitle}`;

    planList.forEach((p, idx) => {
      const num = idx + 1;
      const badge = formatBadge(num);
      const effPrice = getEffectivePrice(p);
      // Clean off (+2GB/4GB all night streaming) text for clean presentation
      const cleanName = (p.name || '').replace(/\s*\(\+\d+(\.\d+)?GB\s+all\s+night\s+streaming\)/gi, '').trim();
      text += `${badge} ${cleanName} · ${p.validity || 'Standard'} — ₦${effPrice.toLocaleString()}\n`;
    });

    // Footer: merchant bank details if linked, else DM prompt
    const bank = user.bankDetails;
    if (bank?.accountNumber) {
      text += `\n──────────────\n💳 Pay directly to:\nBank: ${bank.bankName}\nAcct: ${bank.accountNumber}\nName: ${bank.accountName}\n\n💬 Or DM me here to top up fast anytime! ⚡`;
    } else {
      text += `\n──────────────\n📲 Instant delivery on payment!\n💬 DM me here — tell me your network & size!\nI'll sort you out in under 30 seconds! ⚡`;
    }
    return text;
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Find dynamic lowest price across all loaded plans for marketing drops
  const allLoadedPlans = [
    ...(plans?.mtn || []),
    ...(plans?.glo || []),
    ...(plans?.airtel || [])
  ];
  const lowestDailyPrice = allLoadedPlans.length > 0
    ? Math.min(...allLoadedPlans.map(p => getEffectivePrice(p)))
    : 290;

  // Conversational AI Coach WhatsApp Status Drops (Extracted from 7-Day Auto Status Matrix)
  const morningDrop = `🌅 Morning Hustle & Good Vibes! 🚀\n\n` +
    `Don't let finished data pause your calls, work, or morning scroll!\n` +
    `Fast, reliable data for MTN, Airtel & Glo delivered in 30 seconds.\n\n` +
    `⚡ From quick daily bundles (₦${lowestDailyPrice.toLocaleString()}) to full monthly packages.\n\n` +
    `📲 Message ${brandName} right here with your network to top up sharp-sharp!`;

  const communityDrop = `✦ ${brandName} ⚡\n` +
    `──────────────────────────────\n` +
    `Hey everyone! 👋 You can now get fast, reliable data for MTN, Airtel & Glo directly from me.\n\n` +
    `💚 Smart Data That Gives Back:\n` +
    `Did you know? Every time you buy data through ${brandName}:\n` +
    `• You get verified, ultra-cheap data delivered in under 30 seconds\n` +
    `• A portion of every purchase quietly supports grassroots community projects & youth development in underserved local areas!\n\n` +
    `Fast data that empowers our community. 🏫✨\n` +
    `📲 DM me your network & size anytime you need data! ⚡\n` +
    `— ${brandName}`;

  const middayGiftingDrop = `🎁 Need data on your second phone, MiFi, or for a friend? ⚡\n\n` +
    `You don't need to leave WhatsApp or stress over bank apps.\n` +
    `Surprise someone or refill your WiFi in seconds:\n\n` +
    `1️⃣ Send the phone number & network here\n` +
    `2️⃣ Pick your bundle (Starting from ₦${lowestDailyPrice.toLocaleString()})\n` +
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
    if (p) return `1GB 30-Day @ ₦${getEffectivePrice(p).toLocaleString()}`;
    if (planList?.length) return `${planList[0].name} @ ₦${getEffectivePrice(planList[0]).toLocaleString()}`;
    return fallback;
  }

  const handleNotifyTransfer = async () => {
    setIsSubmittingFund(true);
    setFundSuccessMsg(null);
    try {
      const cleanPhone = (user.phoneNumber || '').replace(/\D/g, '');
      const res = await fetch(`/api/merchant/${cleanPhone}/fund-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: fundAmount,
          totalTransferred: totalToTransfer
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to log transfer');
      setFundSuccessMsg(`Transfer of ₦${totalToTransfer.toLocaleString()} logged! Hub will credit your wallet shortly.`);
      setTimeout(() => setFundSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Error logging transfer');
    } finally {
      setIsSubmittingFund(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingWithdraw(true);
    setWithdrawError(null);
    setWithdrawSuccessMsg(null);
    try {
      const cleanPhone = (user.phoneNumber || '').replace(/\D/g, '');
      const numAmt = parseFloat(withdrawAmount);
      if (!numAmt || numAmt < 2000) {
        throw new Error('Minimum withdrawal is ₦2,000');
      }
      const res = await fetch(`/api/merchant/${cleanPhone}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numAmt })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Withdrawal failed');
      setWithdrawSuccessMsg(`Withdrawal of ₦${numAmt.toLocaleString()} requested! Net payout: ₦${json.netPayout.toLocaleString()}`);
      onRefresh();
      setTimeout(() => {
        setShowWithdrawModal(false);
        setWithdrawSuccessMsg(null);
      }, 3500);
    } catch (err: any) {
      setWithdrawError(err.message || 'Withdrawal failed');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const openBankModal = () => {
    setShowBankModal(true);
    setResolveBankError(null);
    setSaveBankError(null);
    setSaveBankSuccessMsg(null);
    if (user.bankDetails) {
      setSelectedBankCode(user.bankDetails.bankCode || '');
      setBankAccountNumber(user.bankDetails.accountNumber || '');
      setResolvedAccountName(user.bankDetails.accountName || null);
    } else {
      setSelectedBankCode('');
      setBankAccountNumber('');
      setResolvedAccountName(null);
    }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = (user.phoneNumber || '').replace(/\D/g, '');
    const cleanAcc = bankAccountNumber.replace(/\D/g, '');
    if (!selectedBankCode || cleanAcc.length !== 10) {
      setSaveBankError('Please select a bank and enter a valid 10-digit account number');
      return;
    }
    setIsSavingBank(true);
    setSaveBankError(null);
    setSaveBankSuccessMsg(null);
    try {
      const selectedBank = banksList.find((b) => b.code === selectedBankCode);
      const res = await fetch(`/api/merchant/${cleanPhone}/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankCode: selectedBankCode,
          bankName: selectedBank?.name || 'Commercial Bank',
          accountNumber: cleanAcc,
          accountName: resolvedAccountName || ''
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save bank details');
      }
      setSaveBankSuccessMsg(`Bank linked successfully! ${data.bankDetails.bankName} (${data.bankDetails.accountName})`);
      onRefresh();
      setTimeout(() => {
        setShowBankModal(false);
        setSaveBankSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      setSaveBankError(err.message || 'Failed to link bank');
    } finally {
      setIsSavingBank(false);
    }
  };

  const handlePickContact = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['tel'];
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts && contacts[0] && contacts[0].tel && contacts[0].tel.length > 0) {
          const rawTel = contacts[0].tel[0];
          const clean = rawTel.replace(/\D/g, '');
          setRecipientPhone(clean);
        }
      } catch (e) {
        // User cancelled or browser rejected
      }
    } else {
      alert('Address book picker is available on supported mobile browsers (Chrome on Android). You can also type or paste the number directly!');
    }
  };

  const handleExecuteVend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendingPlan) return;
    setIsVending(true);
    setVendError(null);
    setVendSuccessMsg(null);
    try {
      const cleanPhone = (user.phoneNumber || '').replace(/\D/g, '');
      const res = await fetch(`/api/merchant/${cleanPhone}/vend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: vendingPlan.code,
          recipientPhone,
          brandName,
          customRetailPrice: getEffectivePrice(vendingPlan)
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Dispense failed');
      setVendSuccessMsg(`🎉 Successfully dispensed ${vendingPlan.name} to ${json.recipient}! Profit: +₦${json.profit}`);
      const savedBundle = {
        code: vendingPlan.code,
        network: vendNetworkTab || vendingPlan.network?.toLowerCase() || 'mtn',
        name: vendingPlan.name,
        validity: vendingPlan.validity
      };
      setLastVendedBundle(savedBundle);
      try {
        localStorage.setItem('clarion_last_vended_bundle', JSON.stringify(savedBundle));
      } catch {}
      onRefresh();
      setTimeout(() => {
        setVendingPlan(null);
        setRecipientPhone('');
        setVendSuccessMsg(null);
      }, 3500);
    } catch (err: any) {
      setVendError(err.message || 'Dispense failed');
    } finally {
      setIsVending(false);
    }
  };

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
            type="button"
            onClick={() => setShowNotifModal(true)}
            className="relative p-1.5 text-zinc-400 hover:text-accent transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell size={15} />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full text-[9px] text-black font-black flex items-center justify-center leading-none animate-pulse">
                {unreadNotifCount}
              </span>
            )}
          </button>
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
              <span className="hidden sm:inline">WALLET & CASHOUT</span>
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
        <section ref={topUpCardRef} className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-2xl pointer-events-none"></div>

          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] font-bold">Wholesale Discount Engine</p>
              <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tight text-white mt-0.5">
                Tier 6 · 4X MAX VIP
              </h2>
            </div>
            <div className="bg-accent text-black font-mono font-bold text-xs px-2.5 py-1 tracking-wider uppercase">
              4X VIP POWER
            </div>
          </div>

          {/* Wallet Balance Bar */}
          <div className="space-y-1.5 mt-3">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">Clarion Wallet Balance:</span>
              <span className="text-white font-bold">₦{user.walletBalance.toLocaleString()}</span>
            </div>
            <div className="w-full bg-zinc-950 border border-zinc-800 h-2.5 overflow-hidden">
              <div className="bg-accent h-full w-full shadow-[0_0_10px_rgba(255,255,255,0.4)]" />
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
            <div className="text-[11px] font-mono space-y-0.5">
              <p className="text-accent font-bold">
                ⚡ Maximum VIP Tier Active · Up to 24% off official Prices!
              </p>
              <p className="text-zinc-400 text-[10px]">
                No minimum balance required to maintain 4X rates. Fund what you need to vend.
              </p>
            </div>
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
                  <span>Top Up Area · Bank Transfer</span>
                </p>
                <span className="text-[10px] text-zinc-500 font-bold">INSTANT WALLET CREDIT</span>
              </div>

              {/* Amount to Fund Selector & Fee Breakdown */}
              <div className="p-3 bg-zinc-900/80 border border-zinc-800 space-y-2.5">
                <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  Select Amount to Fund:
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[2000, 4000, 6000, 8000, 10000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFundAmount(amt)}
                      className={`py-1.5 px-0.5 text-center font-mono text-[11px] font-bold border transition-all cursor-pointer ${
                        fundAmount === amt
                          ? 'bg-accent text-black border-accent shadow-sm'
                          : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      ₦{amt >= 1000 ? `${amt / 1000}k` : amt}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-zinc-500 text-xs">Or custom:</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">₦</span>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={fundAmount || ''}
                      onChange={(e) => setFundAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      placeholder="Amount"
                      className="w-full bg-zinc-950 border border-zinc-800 text-white font-mono text-xs pl-6 pr-2 py-1 focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                {/* Live Mathematical Fee Breakdown */}
                <div className="p-2.5 bg-black/60 border border-zinc-800/80 space-y-1.5 text-[11px] text-zinc-400 font-mono">
                  <div className="flex justify-between">
                    <span>Wallet Balance to Credit:</span>
                    <span className="text-white font-bold">₦{fundAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>1-Time Paystack Fee:</span>
                    <span className="text-amber-400 font-bold">+₦{paystackFee.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-zinc-800 pt-1 flex justify-between text-xs font-bold">
                    <span className="text-accent uppercase tracking-wider">Final Amount to Transfer:</span>
                    <span className="text-accent text-sm">₦{totalToTransfer.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-zinc-300 pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Bank:</span>
                  <span className="font-bold text-white">Wema Bank</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Account Number:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-sm">9819092390</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('9819092390', 'acct')}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'acct' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copiedKey === 'acct' ? 'COPIED' : 'COPY'}</span>
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
                  ⚡ <span>How to Top Up Your Wallet:</span>
                </p>
                <p>1️⃣ Transfer <span className="text-accent font-bold">₦{totalToTransfer.toLocaleString()}</span> to Wema Bank 9819092390 above.</p>
                <p className="text-amber-300">
                  2️⃣ <span className="font-bold underline">IMPORTANT:</span> Paste <span className="text-white font-bold">{user.phoneNumber} topup</span> in remarks/narration so your payment matches automatically!
                </p>
                <p>3️⃣ Click below to notify Central Hub immediately:</p>
              </div>

              {/* 1-Click Payment Notification Button */}
              {fundSuccessMsg ? (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-2">
                  <Check size={14} />
                  <span>{fundSuccessMsg}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleNotifyTransfer}
                  disabled={isSubmittingFund || fundAmount <= 0}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-[0.98]"
                >
                  {isSubmittingFund ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>LOG TRANSFER — ₦{totalToTransfer.toLocaleString()}</span>
                </button>
              )}
            </motion.div>
          )}
        </section>

        {/* ── TAB 1: MARKETING HUB (Price Cards & Status Drops) ── */}
        {activeTab === 'marketing' && (
          <div className="space-y-4">
            {/* Dynamic Pricing Strategy & Discount Slider */}
            <div className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2">
                  <Sliders size={14} className="text-accent shrink-0" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                    Pricing Strategy
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold text-accent self-start sm:self-auto whitespace-nowrap">
                  {pricingSlider === 0 && '👑 MAX PROFIT (0% OFF)'}
                  {pricingSlider > 0 && pricingSlider <= 5 && '⚡ SWEET SPOT (5% OFF)'}
                  {pricingSlider > 5 && pricingSlider < 40 && `⚡ SWEET SPOT (${pricingSlider}% OFF)`}
                  {pricingSlider >= 40 && pricingSlider < 90 && `🚀 CAMPUS PENETRATION (${pricingSlider}% OFF)`}
                  {pricingSlider >= 90 && '🔥 WHOLESALE FLOOR (MAX OFF)'}
                </span>
              </div>

              {/* Preset Quick-Buttons */}
              <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => handleSliderChange(5)}
                  className={`py-1.5 px-1 border transition-all cursor-pointer text-center ${
                    pricingSlider === 5
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Sweet Spot (5%)
                </button>
                <button
                  type="button"
                  onClick={() => handleSliderChange(25)}
                  className={`py-1.5 px-1 border transition-all cursor-pointer text-center ${
                    pricingSlider === 25
                      ? 'bg-accent/20 border-accent text-accent font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Campus (25%)
                </button>
                <button
                  type="button"
                  onClick={() => handleSliderChange(50)}
                  className={`py-1.5 px-1 border transition-all cursor-pointer text-center ${
                    pricingSlider === 50
                      ? 'bg-blue-500/20 border-blue-400 text-blue-300 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Student (50%)
                </button>
                <button
                  type="button"
                  onClick={() => handleSliderChange(100)}
                  className={`py-1.5 px-1 border transition-all cursor-pointer text-center ${
                    pricingSlider === 100
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  Floor (Max)
                </button>
              </div>

              {/* Slider Control */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                  <span>0% Off</span>
                  <span className="text-white font-bold">{pricingSlider}% Discount</span>
                  <span>4X Wholesale Base</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={pricingSlider}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  className="w-full accent-emerald-400 bg-zinc-800 h-2 cursor-pointer"
                />
              </div>

              {/* Live Impact Preview */}
              <div className="p-2.5 bg-black/60 border border-zinc-800 text-[11px] font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-zinc-400">
                <span>
                  💡 All WhatsApp drops & price cards automatically sync to this discount.
                </span>
                <span className="text-emerald-400 font-bold shrink-0">
                  ✓ Guaranteed Profit ≥ ₦1
                </span>
              </div>
            </div>

            {/* Status Drops Module (Collapsible with Click-Outside Auto-Collapse) */}
            <div ref={statusDropsRef} className="scroll-mt-28 bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 transition-all">
              <div
                onClick={toggleStatusDrops}
                className="flex items-center justify-between cursor-pointer select-none group"
              >
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-accent shrink-0" />
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white group-hover:text-accent transition-colors flex items-center gap-2 min-w-0">
                      <span className="truncate">AI Coach · Status Drops</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                        2 SLOTS ACTIVE
                      </span>
                    </h3>
                    {!statusDropsExpanded && (
                      <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        Slot 1: First Touch & Community · Slot 2: Active Timed Drop
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-accent hidden sm:inline">
                    {statusDropsExpanded ? 'COLLAPSE' : 'TAP TO VIEW'}
                  </span>
                  <div className="p-1 bg-zinc-950 border border-zinc-800 text-zinc-400 group-hover:text-white transition-colors">
                    {statusDropsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {statusDropsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                    animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    onAnimationComplete={() => {
                      if (statusDropsExpanded) {
                        smoothScrollToElement(statusDropsRef.current, 105);
                      }
                    }}
                    className="overflow-hidden border-t border-zinc-800/80 pt-3"
                  >
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-[10px] font-mono text-zinc-500">2-SLOT MARKETING ENGINE</span>
                      <span className="text-[10px] font-mono text-accent font-bold">1-CLICK COPY</span>
                    </div>

                    <div className="grid gap-3">
                      {/* Slot 1: Permanent First-Touch & Community Impact Drop */}
                      <div className="p-3 bg-zinc-950/70 border border-emerald-900/50 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                            ★ SLOT 1: First Touch & Community Impact
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(communityDrop, 'drop_community'); }}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                          >
                            {copiedKey === 'drop_community' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            <span>{copiedKey === 'drop_community' ? 'COPIED' : 'COPY'}</span>
                          </button>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 p-1.5 bg-black/40 border border-zinc-800/80 leading-normal">
                          📱 <span className="text-white font-bold">Target:</span> Send directly as a DM to all your close contacts + post to WhatsApp Status. Perfect for introducing your business to your circle!
                        </div>
                        <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">
                          {communityDrop}
                        </pre>
                      </div>

                      {/* Slot 2: Dynamic Time-of-Day Drop (Auto-Switches by Local Hour) */}
                      {(() => {
                        const hr = new Date().getHours();
                        const isMorning = hr >= 6 && hr < 12;
                        const isMidday = hr >= 12 && hr < 17;
                        
                        const title = isMorning
                          ? '🌅 SLOT 2 (Morning Hustle): 06:00 AM – 12:00 PM'
                          : isMidday
                          ? '🎁 SLOT 2 (Midday Gifting): 12:00 PM – 05:00 PM'
                          : '🌙 SLOT 2 (Golden Hour Streamers): 05:00 PM – 06:00 AM';
                          
                        const text = isMorning
                          ? morningDrop
                          : isMidday
                          ? middayGiftingDrop
                          : eveningDrop;

                        const dropKey = isMorning ? 'drop_morning' : isMidday ? 'drop_midday' : 'drop_evening';
                        const colorClass = isMorning ? 'text-amber-400' : isMidday ? 'text-blue-400' : 'text-purple-400';

                        return (
                          <div className="p-3 bg-zinc-950/70 border border-zinc-800 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className={`text-xs font-bold ${colorClass} flex items-center gap-1.5 font-mono`}>
                                {title}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(text, dropKey); }}
                                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer border border-zinc-700"
                              >
                                {copiedKey === dropKey ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                <span>{copiedKey === dropKey ? 'COPIED' : 'COPY'}</span>
                              </button>
                            </div>
                            <div className="text-[10px] font-mono text-zinc-400 p-1.5 bg-black/40 border border-zinc-800/80 leading-normal">
                              🕒 <span className="text-white font-bold">Target:</span> Post to your WhatsApp Status right now. Synced to peak customer demand at this hour.
                            </div>
                            <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">
                              {text}
                            </pre>
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Branded Price Cards Module (Collapsible with Click-Outside Auto-Collapse) */}
            <div ref={priceCardsRef} className="scroll-mt-28 bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 transition-all">
              <div
                onClick={togglePriceCards}
                className="flex items-center justify-between cursor-pointer select-none group"
              >
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-accent shrink-0" />
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white group-hover:text-accent transition-colors flex items-center gap-2">
                      <span>Branded Price Cards</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 font-normal">
                        3 NETWORKS
                      </span>
                    </h3>
                    {!priceCardsExpanded && (
                      <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        MTN ({mtnCount}) · GLO ({gloCount}) · AIRTEL ({airtelCount})
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-accent hidden sm:inline">
                    {priceCardsExpanded ? 'COLLAPSE' : 'TAP TO VIEW'}
                  </span>
                  <div className="p-1 bg-zinc-950 border border-zinc-800 text-zinc-400 group-hover:text-white transition-colors">
                    {priceCardsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {priceCardsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                    animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    onAnimationComplete={() => {
                      if (priceCardsExpanded) {
                        smoothScrollToElement(priceCardsRef.current, 105);
                      }
                    }}
                    className="overflow-hidden border-t border-zinc-800/80 pt-3"
                  >
                    {/* Price Cards Header Row — mobile-safe, no wrapping */}
                    <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-zinc-800/60 font-mono text-[10px]">
                      <div className="flex items-center gap-1.5 text-zinc-500 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <span className="truncate">SYNCED TO DISCOUNT SLIDER</span>
                      </div>
                      <span className="px-2 py-0.5 bg-accent/10 border border-accent/30 text-accent font-bold uppercase tracking-wider text-[9px] whitespace-nowrap shrink-0 flex items-center gap-1">
                        <span>✓</span>
                        <span>READY TO FORWARD</span>
                      </span>
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
                        <div className="pt-2 border-t border-zinc-900">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('MTN', plans?.mtn || [], brandName), 'card_mtn'); }}
                            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_mtn' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_mtn' ? 'COPIED TO CLIPBOARD' : 'COPY MTN 5G PRICE LIST'}</span>
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
                        <div className="pt-2 border-t border-zinc-900">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('GLO', plans?.glo || [], brandName), 'card_glo'); }}
                            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_glo' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_glo' ? 'COPIED TO CLIPBOARD' : 'COPY GLO 5G PRICE LIST'}</span>
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
                        <div className="pt-2 border-t border-zinc-900">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('AIRTEL', plans?.airtel || [], brandName), 'card_airtel'); }}
                            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_airtel' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_airtel' ? 'COPIED TO CLIPBOARD' : 'COPY AIRTEL 5G PRICE LIST'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* View Full Wholesale & Tier Matrix Action — single-line terminal bar */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowPricingMatrixModal(true); }}
                        className="w-full py-2.5 px-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-accent/50 transition-all font-mono text-xs flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Sliders size={13} className="text-accent group-hover:scale-110 transition-transform shrink-0" />
                          <span className="font-bold text-white tracking-wide truncate">40-PLAN WHOLESALE MATRIX</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-accent font-bold shrink-0">
                          <span>ALL TIERS</span>
                          <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── TAB 2: WALLET & TIERS ── */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            {/* Payout Bank & Cashout Module */}
            <div className="bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Building2 size={15} className="text-emerald-400" />
                  <span>Payout Bank & Cashout</span>
                </h3>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest hidden sm:inline">
                  Direct Paystack NIP Settlement
                </span>
              </div>

              {user.bankDetails ? (
                /* Linked Bank State */
                <div className="p-4 bg-zinc-950 border border-zinc-800 space-y-3 font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{user.bankDetails.bankName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                          <Check size={10} /> Verified NUBAN
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 tracking-wider">
                        {user.bankDetails.maskedAccount}
                      </p>
                      <p className="text-xs font-bold text-emerald-400 tracking-wide uppercase">
                        {user.bankDetails.accountName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openBankModal}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-mono font-bold transition-all self-start sm:self-center cursor-pointer"
                    >
                      CHANGE BANK
                    </button>
                  </div>

                  {/* Cashout Profit CTA inside Bank Card */}
                  <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase">Available Profit</p>
                      <p className="text-lg font-bold text-emerald-400">
                        +₦{(user.metrics.totalProfitNaira || 0).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowWithdrawModal(true);
                        setWithdrawAmount(String(user.metrics.totalProfitNaira || 0));
                        setWithdrawError(null);
                        setWithdrawSuccessMsg(null);
                      }}
                      disabled={(user.metrics.totalProfitNaira || 0) < 2000}
                      className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
                    >
                      <ArrowDownToLine size={13} />
                      <span>CASH OUT PROFIT</span>
                      {(user.metrics.totalProfitNaira || 0) < 2000 && (
                        <span className="text-black/70 text-[10px] font-normal">(Min. ₦2,000)</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Empty Bank State */
                <div className="p-5 bg-amber-500/5 border border-dashed border-amber-500/30 font-mono text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                    <Building2 size={20} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">No Payout Bank Linked</h4>
                    <p className="text-[11px] text-zinc-400 max-w-md mx-auto leading-relaxed">
                      Link your Nigerian bank or fintech account (OPay, PalmPay, Kuda, GTBank, Access, Zenith, etc.) to withdraw your earned profits instantly.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openBankModal}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-amber-500/10"
                  >
                    <Zap size={13} />
                    <span>LINK BANK ACCOUNT</span>
                  </button>
                </div>
              )}
            </div>

            <div ref={progressionTableRef} className="scroll-mt-28 bg-zinc-900/60 border border-zinc-800 p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                    Multiplier Progression Table
                  </h3>
                  <p className="text-[10px] font-mono text-zinc-500">
                    Tap any tier to view live earning breakdowns & case studies
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPricingMatrixModal(true)}
                  className="px-2.5 py-1 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-mono font-bold text-[10px] flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition-all"
                >
                  <Sliders size={12} />
                  <span>WHOLESALE MATRIX</span>
                </button>
              </div>

              {/* Progressive Tiers List */}
              <div className="space-y-2.5 font-mono text-xs">
                {(() => {
                  const currentLevel = user.multiplierTier?.level || 1;
                  const visibleTiers = (showAllTiers || currentLevel >= 6)
                    ? ALL_TIERS
                    : ALL_TIERS.filter((t) => t.level <= Math.min(6, currentLevel + 1));

                  return (
                    <>
                      {visibleTiers.map((t) => {
                        const isCurrent = user.multiplierTier?.level === t.level;
                        const isUnlocked = (user.walletBalance || 0) >= t.minBalance;

                        return (
                          <div
                            key={t.level}
                            onClick={() => setSelectedTierForModal(t)}
                            className={`p-3 border flex justify-between items-center cursor-pointer transition-all group ${
                              isCurrent
                                ? 'bg-accent/10 border-accent shadow-sm shadow-accent/5'
                                : isUnlocked
                                ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700'
                                : 'bg-zinc-950/40 border-zinc-800/80 border-dashed hover:border-zinc-700'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={`font-bold ${isCurrent ? 'text-accent' : 'text-white'}`}>
                                  {t.name}
                                </p>
                                {isCurrent && (
                                  <span className="text-[9px] px-1.5 py-0.2 bg-accent text-black font-bold uppercase">
                                    CURRENT
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-0.5">
                                Float Balance: {t.balanceRange}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 text-right">
                              <span className={`text-xs font-bold ${isCurrent ? 'text-accent' : 'text-zinc-300'}`}>
                                {t.ratePercent}% Margin
                              </span>
                              <ChevronRight size={14} className="text-zinc-600 group-hover:text-accent transition-colors" />
                            </div>
                          </div>
                        );
                      })}

                      {/* Progressive View Toggle Button */}
                      {currentLevel < 6 && (
                        <div className="pt-1">
                          {showAllTiers ? (
                            <button
                              type="button"
                              onClick={() => setShowAllTiers(false)}
                              className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                            >
                              <ChevronUp size={13} className="text-accent" />
                              <span>FOLD TO ACTIVE TIERS</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setShowAllTiers(true);
                                setTimeout(() => {
                                  smoothScrollToElement(progressionTableRef.current, 105);
                                }, 150);
                              }}
                              className="w-full py-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-dashed border-zinc-800 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                            >
                              <ChevronDown size={13} className="text-accent" />
                              <span>VIEW ALL TIERS (3X – 4X VIP)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
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
              <div className="bg-zinc-900/60 border border-zinc-800 p-3 flex flex-col gap-2">
                <div>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase">Net Profit Earned</p>
                  <p className="text-xl font-bold font-mono text-emerald-400 mt-1">+₦{(user.metrics.totalProfitNaira || 0).toLocaleString()}</p>
                </div>
                {user.bankDetails ? (
                  <button
                    onClick={() => { setShowWithdrawModal(true); setWithdrawAmount(String(user.metrics.totalProfitNaira || 0)); setWithdrawError(null); setWithdrawSuccessMsg(null); }}
                    disabled={(user.metrics.totalProfitNaira || 0) < 2000}
                    className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-400 border border-emerald-500/30 font-mono font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <ArrowDownToLine size={12} />
                    <span>CASH OUT PROFIT</span>
                    {(user.metrics.totalProfitNaira || 0) < 2000 && <span className="text-zinc-500 font-normal">(Min. ₦2,000)</span>}
                  </button>
                ) : (
                  <button
                    onClick={openBankModal}
                    className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Zap size={12} />
                    <span>LINK PAYOUT BANK</span>
                  </button>
                )}
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

        {/* ── TAB 4: ORBIT ── */}
        {activeTab === 'orbit' && (
          <OrbitTab
            user={user}
            brandName={brandName}
            onUpdateBrandName={(newName) => {
              try { localStorage.setItem('clarion_merchant_brand', newName); } catch {}
            }}
            onOpenQuickVend={() => openUnifiedVendModal()}
          />
        )}

      </main>

      {/* ── Notifications Modal ── */}
      {showNotifModal && (
        <NotificationsModal
          isOpen={showNotifModal}
          onClose={() => setShowNotifModal(false)}
          notifications={notifications}
          onRefreshNotifications={refreshNotifications}
          onActionClick={(actionType, payload) => {
            setShowNotifModal(false);
            if (actionType === 'QUICK_VEND') openUnifiedVendModal();
            else if (actionType === 'VIEW_ORBIT') setActiveTab('orbit');
            else if (actionType === 'COPY_STATUS') setActiveTab('marketing');
          }}
        />
      )}

      {/* ── Withdrawal / Cash-Out Modal Overlay ── */}
      <AnimatePresence>
        {showWithdrawModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-950 border border-zinc-800 w-full max-w-sm p-5 font-mono space-y-4 shadow-2xl"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ArrowDownToLine size={16} className="text-emerald-400" />
                  Cash Out Profit
                </h3>
                <button
                  onClick={() => { setShowWithdrawModal(false); setWithdrawError(null); setWithdrawSuccessMsg(null); }}
                  className="text-zinc-500 hover:text-white transition-colors p-1"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Available Balance */}
              <div className="p-2.5 bg-emerald-500/5 border border-emerald-500/20 flex justify-between items-center">
                <span className="text-[11px] text-zinc-400">Available Profit:</span>
                <span className="text-emerald-400 font-bold text-sm">₦{(user.metrics.totalProfitNaira || 0).toLocaleString()}</span>
              </div>

              <form onSubmit={handleWithdrawSubmit} className="space-y-3">
                {/* Amount Input */}
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-1.5">Amount to Withdraw:</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-bold">₦</span>
                    <input
                      type="number"
                      min={2000}
                      step={100}
                      max={user.metrics.totalProfitNaira || 0}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm pl-7 pr-3 py-2.5 focus:border-emerald-500 focus:outline-none transition-colors"
                      placeholder="2000"
                    />
                  </div>
                </div>

                {/* Fee Breakdown */}
                <div className="p-3 bg-black/60 border border-zinc-800 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-zinc-400">
                    <span>Amount Requested:</span>
                    <span className="text-white font-bold">₦{parseFloat(withdrawAmount || '0').toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Paystack NIP Transfer Fee:</span>
                    <span className="text-red-400">−₦50.00</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Platform Processing Fee:</span>
                    <span className="text-red-400">−₦50.00</span>
                  </div>
                  <div className="border-t border-zinc-700 pt-1.5 flex justify-between font-bold text-xs">
                    <span className="text-emerald-400">Net Payout to Bank:</span>
                    <span className="text-emerald-400">₦{Math.max(0, parseFloat(withdrawAmount || '0') - 100).toLocaleString()}</span>
                  </div>
                </div>

                {/* Bank Details */}
                {user.bankDetails ? (
                  <div className="text-[11px] text-zinc-400 p-2.5 bg-zinc-900/80 border border-zinc-800 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <ShieldCheck size={13} className={user.bankDetails.verified ? 'text-emerald-400 mt-0.5 shrink-0' : 'text-zinc-500 mt-0.5 shrink-0'} />
                      <div>
                        <div>
                          <span className="text-white font-bold">{user.bankDetails.bankName}</span>
                          <span className="text-zinc-500 mx-1">·</span>
                          <span>{user.bankDetails.maskedAccount}</span>
                          {user.bankDetails.verified && <span className="text-emerald-400 ml-1.5 text-[10px]">✓ Verified</span>}
                        </div>
                        <p className="text-[10px] text-zinc-400 uppercase mt-0.5">{user.bankDetails.accountName}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWithdrawModal(false);
                        openBankModal();
                      }}
                      className="text-[10px] text-accent hover:underline shrink-0 font-bold cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-400 p-3 bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span className="font-bold">No payout bank linked!</span>
                    </div>
                    <p className="text-zinc-400 text-[10px] leading-relaxed">
                      You must link a verified Nigerian bank account before you can cash out your profits.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWithdrawModal(false);
                        openBankModal();
                      }}
                      className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <Zap size={11} />
                      <span>Link Bank Account Now</span>
                    </button>
                  </div>
                )}

                {withdrawError && (
                  <div className="text-red-400 text-[11px] p-2.5 bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                    <AlertCircle size={12} className="shrink-0" />
                    {withdrawError}
                  </div>
                )}
                {withdrawSuccessMsg && (
                  <div className="text-emerald-400 text-[11px] p-2.5 bg-emerald-500/10 border border-emerald-500/30">
                    {withdrawSuccessMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!user.bankDetails || isSubmittingWithdraw || parseFloat(withdrawAmount || '0') < 2000 || parseFloat(withdrawAmount || '0') > (user.metrics.totalProfitNaira || 0)}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                >
                  {isSubmittingWithdraw ? <RefreshCw size={13} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                  <span>{isSubmittingWithdraw ? 'PROCESSING...' : 'CONFIRM WITHDRAWAL'}</span>
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bank Account Linking / Edit Modal Overlay ── */}
      <AnimatePresence>
        {showBankModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-950 border border-zinc-800 w-full max-w-sm p-5 font-mono space-y-4 shadow-2xl"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Building2 size={16} className="text-emerald-400" />
                  <span>{user.bankDetails ? 'Update Payout Bank' : 'Link Payout Bank'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => { setShowBankModal(false); setSaveBankError(null); setSaveBankSuccessMsg(null); }}
                  className="text-zinc-500 hover:text-white transition-colors p-1 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Enter your 10-digit NUBAN account number. We resolve account names in real-time with Paystack.
              </p>

              <form onSubmit={handleSaveBank} className="space-y-3.5">
                {/* Bank Select */}
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-1.5">
                    Select Bank / Fintech:
                  </label>
                  <select
                    value={selectedBankCode}
                    onChange={(e) => {
                      setSelectedBankCode(e.target.value);
                      setResolvedAccountName(null);
                      setResolveBankError(null);
                    }}
                    disabled={isLoadingBanks}
                    className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-xs px-3 py-2.5 focus:border-emerald-500 focus:outline-none transition-colors"
                  >
                    <option value="">{isLoadingBanks ? 'Loading banks list...' : '-- Choose your bank --'}</option>
                    {banksList.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Account Number Input */}
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-1.5">
                    10-Digit NUBAN Account Number:
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={bankAccountNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setBankAccountNumber(val);
                    }}
                    placeholder="0123456789"
                    className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-3 py-2.5 focus:border-emerald-500 focus:outline-none tracking-widest placeholder:text-zinc-600"
                  />
                </div>

                {/* Live Paystack Account Name Resolution Status */}
                {isResolvingBank && (
                  <div className="p-2.5 bg-zinc-900/90 border border-zinc-800 text-zinc-400 text-xs flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin text-emerald-400 shrink-0" />
                    <span>Resolving account name with Paystack...</span>
                  </div>
                )}

                {resolvedAccountName && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                      <ShieldCheck size={13} />
                      <span>Verified Account Name:</span>
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wide text-white">
                      {resolvedAccountName}
                    </div>
                  </div>
                )}

                {resolveBankError && (
                  <div className="text-red-400 text-[11px] p-2.5 bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{resolveBankError}</span>
                  </div>
                )}

                {saveBankError && (
                  <div className="text-red-400 text-[11px] p-2.5 bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>{saveBankError}</span>
                  </div>
                )}

                {saveBankSuccessMsg && (
                  <div className="text-emerald-400 text-[11px] p-2.5 bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
                    <Check size={12} className="shrink-0" />
                    <span>{saveBankSuccessMsg}</span>
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowBankModal(false); setSaveBankError(null); }}
                    className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border border-zinc-800"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBank || !resolvedAccountName || isResolvingBank}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
                  >
                    {isSavingBank ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
                    <span>{isSavingBank ? 'SAVING...' : 'SAVE BANK'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Vending Modal Overlay ── */}
      <AnimatePresence>
        {vendingPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-950 border border-zinc-800 w-full max-w-sm p-5 font-mono space-y-4 shadow-2xl"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <Zap size={13} className="text-emerald-400 fill-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Quick Vend Data
                    </h3>
                    <p className="text-[9px] text-zinc-400">Multi-Network Point-of-Sale</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setVendingPlan(null); setVendError(null); setVendSuccessMsg(null); setRecipientPhone(''); }}
                  className="text-zinc-500 hover:text-white transition-colors p-1"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Network Switcher Tabs */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                  {(['mtn', 'glo', 'airtel'] as const).map((net) => {
                    const isSelected = vendNetworkTab === net;
                    const netEmoji = net === 'mtn' ? '🟡 MTN' : net === 'glo' ? '🟢 GLO' : '🔴 AIRTEL';
                    const planCount = plans?.[net]?.length || 0;
                    return (
                      <button
                        key={net}
                        type="button"
                        onClick={() => {
                          setVendNetworkTab(net);
                          const netPlans = plans?.[net] || [];
                          if (netPlans.length > 0) setVendingPlan(netPlans[0]);
                        }}
                        className={`py-2 px-1 text-center font-bold uppercase transition-all cursor-pointer border ${
                          isSelected
                            ? net === 'mtn'
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                              : net === 'glo'
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-sm'
                              : 'bg-red-500/20 border-red-400 text-red-300 shadow-sm'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <div>{netEmoji}</div>
                        <div className="text-[9px] font-normal opacity-70">{planCount} plans</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1-Tap Quick Re-Vend / Favorite Chip */}
              {lastVendedBundle && (
                <div className="p-2 bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5 truncate text-zinc-300">
                    <span className="text-amber-400">★</span>
                    <span className="text-zinc-500">Recent:</span>
                    <span className="font-bold text-white uppercase">{lastVendedBundle.network}</span>
                    <span className="truncate">{lastVendedBundle.name} ({lastVendedBundle.validity})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const net = lastVendedBundle.network.toLowerCase() as 'mtn' | 'glo' | 'airtel';
                      setVendNetworkTab(net);
                      const netPlans = plans?.[net] || [];
                      const target = netPlans.find(p => p.code === lastVendedBundle.code) || netPlans[0];
                      if (target) setVendingPlan(target);
                    }}
                    className="shrink-0 px-2 py-0.5 bg-accent/20 hover:bg-accent/30 text-accent font-bold border border-accent/40 uppercase cursor-pointer transition-colors"
                  >
                    1-Tap Auto Fill
                  </button>
                </div>
              )}

              {/* Plan Selector */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] text-zinc-500 uppercase tracking-wider">
                  <span>Select {vendNetworkTab.toUpperCase()} Data Plan:</span>
                  <span className="text-zinc-400">{plans?.[vendNetworkTab]?.length || 0} Available</span>
                </div>
                <div ref={vendPlanListRef} className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {(plans?.[vendNetworkTab] || []).map((p) => {
                    const isSelected = vendingPlan?.code === p.code;
                    const cleanName = (p.name || '').replace(/\s*\(\+\d+(\.\d+)?GB\s+all\s+night\s+streaming\)/gi, '').trim();
                    const eff = getEffectivePrice(p);
                    const cost = getMerchantWholesaleCost(p, user.walletBalance);
                    const profit = Math.max(0, eff - cost);
                    return (
                      <button
                        key={p.code}
                        data-plan-code={p.code}
                        type="button"
                        onClick={() => setVendingPlan(p)}
                        className={`w-full text-left px-2.5 py-2 text-[11px] border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-accent/20 border-accent text-accent font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-bold">{cleanName}</span>
                          <span className="text-zinc-500 mx-1">·</span>
                          <span className="text-[10px] text-zinc-400">{p.validity}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-white">₦{eff.toLocaleString()}</span>
                          <span className="text-[9px] text-emerald-400 font-mono ml-1.5">(+₦{profit})</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Plan Summary & Pre-Vend Profit Breakdown */}
              {(() => {
                const modalEffectivePrice = getEffectivePrice(vendingPlan);
                const modalWholesaleCost = getMerchantWholesaleCost(vendingPlan, user.walletBalance);
                const modalProfit = Math.max(0, modalEffectivePrice - modalWholesaleCost);
                const modalMargin = modalEffectivePrice > 0 ? Math.round((modalProfit / modalEffectivePrice) * 100) : 0;
                const modalBalanceAfter = user.walletBalance - modalWholesaleCost;
                const hasInsufficientFloat = user.walletBalance < modalWholesaleCost;

                return (
                  <>
                    <div className="p-3 bg-zinc-900/90 border border-emerald-500/30 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">Customer Retail Price:</span>
                        <span className="text-white font-bold font-mono">₦{modalEffectivePrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">Wholesale Wallet Debit (4X VIP):</span>
                        <span className="text-red-400 font-bold font-mono">−₦{modalWholesaleCost.toLocaleString()}</span>
                      </div>
                      <div className="border-t border-zinc-800 pt-1.5 flex justify-between items-center">
                        <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          💵 Instant Cash Profit:
                        </span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono">
                          +₦{modalProfit.toLocaleString()} <span className="text-[10px] text-emerald-500/80 font-normal">({modalMargin}%)</span> 🔥
                        </span>
                      </div>
                      <div className="border-t border-zinc-800/60 pt-1 flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                        <span>Wallet Left After Vend:</span>
                        <span className={hasInsufficientFloat ? 'text-red-400 font-bold' : 'text-zinc-200'}>
                          ₦{Math.max(0, modalBalanceAfter).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {hasInsufficientFloat && (
                      <div className="p-2.5 bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 font-mono">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase tracking-wider">
                            <AlertCircle size={13} className="shrink-0" />
                            <span>Insufficient Wallet Balance</span>
                          </div>
                          <p className="text-[11px] text-zinc-300 truncate">
                            Need <span className="text-white font-bold">₦{modalWholesaleCost.toLocaleString()}</span> · Available: <span className="text-red-400 font-bold">₦{user.walletBalance.toLocaleString()}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleModalTopUpClick(modalWholesaleCost - (user.walletBalance || 0))}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm shrink-0 active:scale-95"
                        >
                          TOP UP
                        </button>
                      </div>
                    )}

                    <form onSubmit={handleExecuteVend} className="space-y-3">
                      {/* Customer Phone */}
                      <div>
                        <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-1.5">Customer Phone Number:</label>
                        <div className="flex gap-2">
                          <input
                            type="tel"
                            value={recipientPhone}
                            onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, ''))}
                            placeholder="08012345678"
                            maxLength={11}
                            className="flex-1 bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-3 py-2.5 focus:border-accent focus:outline-none transition-colors"
                            required
                          />
                          <button
                            type="button"
                            onClick={handlePickContact}
                            className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
                            title="Pick from phone contacts"
                          >
                            <Phone size={15} />
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                          <Phone size={9} />
                          Tap the icon to pick from your contacts
                        </p>
                      </div>

                      {vendError && (
                        <div className="text-red-400 text-[11px] p-2.5 bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                          <AlertCircle size={12} className="shrink-0" />
                          {vendError}
                        </div>
                      )}
                      {vendSuccessMsg && (
                        <div className="text-emerald-400 text-[11px] p-2.5 bg-emerald-500/10 border border-emerald-500/30">
                          {vendSuccessMsg}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isVending || recipientPhone.length < 10 || hasInsufficientFloat}
                        className="w-full py-3 bg-accent hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                      >
                        {isVending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                        <span>{isVending ? 'DISPENSING...' : `DISPENSE NOW (+₦${modalProfit.toLocaleString()} PROFIT) ⚡`}</span>
                      </button>
                    </form>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Interactive Tier Detail & Case Study Modal ── */}
      <AnimatePresence>
        {selectedTierForModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-zinc-950 border border-zinc-800 w-full max-w-sm p-5 font-mono space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-accent/10 border border-accent/30 text-accent font-bold text-xs">
                    {selectedTierForModal.multiplier}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      {selectedTierForModal.name}
                    </h3>
                    <p className="text-[10px] text-zinc-400">
                      Balance: {selectedTierForModal.balanceRange}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTierForModal(null)}
                  className="text-zinc-500 hover:text-white transition-colors p-1 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tier Specs */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-zinc-900/80 border border-zinc-800 space-y-0.5">
                  <span className="text-zinc-500 uppercase text-[9px]">Wholesale Margin:</span>
                  <p className="text-sm font-bold text-accent">
                    {selectedTierForModal.ratePercent}% Margin
                  </p>
                </div>
                <div className="p-2.5 bg-zinc-900/80 border border-zinc-800 space-y-0.5">
                  <span className="text-zinc-500 uppercase text-[9px]">Earning Multiplier:</span>
                  <p className="text-sm font-bold text-white">
                    {selectedTierForModal.multiplier} Power
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {selectedTierForModal.description}
              </p>

              {/* Real High-Margin Case Study: MTN 1GB 30-Day Monthly */}
              {(() => {
                const officialBenchmark = 1000;
                const baseCost = 280;
                const paystackFee = 15;
                const profitPool = officialBenchmark - baseCost - paystackFee;
                const tierProfit = Math.round(profitPool * (selectedTierForModal.ratePercent / 100));
                const tier1Profit = Math.round(profitPool * 0.10);
                const tierWholesaleCost = officialBenchmark - tierProfit;

                return (
                  <div className="p-3 bg-zinc-900/90 border border-accent/30 space-y-2">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                      <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                        📈 Live Plan Case Study
                      </span>
                      <span className="text-[9px] text-zinc-400">MTN 1GB (30-DAY)</span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-zinc-400">
                        <span>Official Telco Retail:</span>
                        <span className="text-zinc-200">₦{officialBenchmark.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Your Tier Wholesale Cost:</span>
                        <span className="text-white font-bold">₦{tierWholesaleCost.toLocaleString()}</span>
                      </div>
                      <div className="border-t border-zinc-800 pt-1 flex justify-between font-bold text-xs text-emerald-400">
                        <span>Your Net Profit per Sale:</span>
                        <span>+₦{tierProfit.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="pt-1 text-[10px] text-zinc-400 bg-black/40 p-2 border border-zinc-800/80">
                      {selectedTierForModal.level === 1 ? (
                        <span>✨ Baseline tier. You keep ₦{tierProfit} per customer sale with zero upfront float required.</span>
                      ) : (
                        <span>
                          🚀 You make <strong className="text-accent">{selectedTierForModal.multiplier} MORE</strong> profit (+₦{tierProfit} vs ₦{tier1Profit}) on every gigabyte sold compared to Tier 1!
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Tier Unlock Status & Top-Up CTA */}
              {(() => {
                const isUnlocked = (user.walletBalance || 0) >= selectedTierForModal.minBalance;
                const deficit = Math.max(0, selectedTierForModal.minBalance - (user.walletBalance || 0));
                const deficitFee = calculateInflowPaystackFee(deficit);

                if (isUnlocked) {
                  return (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5">
                      <Check size={14} />
                      <span>TIER UNLOCKED & ACTIVE</span>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span>Float Needed to Unlock:</span>
                        <span className="font-bold">₦{deficit.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Paystack Inflow Fee:</span>
                        <span>+₦{deficitFee.toLocaleString()}</span>
                      </div>
                      <div className="border-t border-amber-500/30 pt-1 flex justify-between font-bold text-xs text-white">
                        <span>Total to Transfer:</span>
                        <span>₦{(deficit + deficitFee).toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTierForModal(null);
                        setFundAmount(deficit);
                        setShowTopUpGuide(true);
                        setTimeout(() => {
                          topUpCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 150);
                      }}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-amber-500/10"
                    >
                      <Zap size={14} />
                      <span>TOP UP ₦{deficit.toLocaleString()} TO UNLOCK</span>
                    </button>
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={() => setSelectedTierForModal(null)}
                className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase transition-colors cursor-pointer border border-zinc-800"
              >
                CLOSE
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full-Screen Wholesale Pricing & Tier Profit Matrix Modal ── */}
      <AnimatePresence>
        {showPricingMatrixModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col p-3 sm:p-6 overflow-hidden font-mono"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-accent/10 border border-accent/30 text-accent font-bold text-xs">
                  <Sliders size={16} />
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>Wholesale Pricing & Tier Profit Matrix</span>
                  </h2>
                  <p className="text-[10px] text-zinc-400">
                    Benchmarked directly against official telco USSD retail schedules
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPricingMatrixModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer border border-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Controls Bar: Network Filter & Search */}
            <div className="py-3 flex flex-col gap-2 border-b border-zinc-900 shrink-0">
              {/* Network Tabs — equal grid, no overflow scroll needed */}
              <div className="grid grid-cols-4 gap-1">
                {(['ALL', 'MTN', 'GLO', 'AIRTEL'] as const).map((net) => (
                  <button
                    key={net}
                    type="button"
                    onClick={() => setMatrixNetworkFilter(net)}
                    className={`py-1.5 text-[11px] font-bold font-mono uppercase transition-all cursor-pointer border text-center ${
                      matrixNetworkFilter === net
                        ? 'bg-accent text-black border-accent'
                        : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    {net === 'ALL' ? 'ALL' : net}
                  </button>
                ))}
              </div>

              {/* Search Box — full width */}
              <div className="relative w-full">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search plan or validity..."
                  value={matrixSearchQuery}
                  onChange={(e) => setMatrixSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs font-mono pl-8 pr-3 py-2 focus:border-accent focus:outline-none placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Interactive Tier Switcher Bar */}
            <div className="py-2.5 border-b border-zinc-900 shrink-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  Select Active Tier Multiplier:
                </span>
                <span className="text-[10px] text-zinc-400">
                  (Simulate profit at each balance tier)
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {ALL_TIERS.map((tier) => {
                  const isUserActiveTier = user.multiplierTier?.level === tier.level;
                  const isSelected = matrixSelectedTier === tier.level;

                  return (
                    <button
                      key={tier.level}
                      type="button"
                      onClick={() => setMatrixSelectedTier(tier.level)}
                      className={`p-1.5 text-center border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-accent/20 border-accent text-accent font-bold shadow-sm shadow-accent/10'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs font-bold">{tier.multiplier}</span>
                        {isUserActiveTier && (
                          <span className="text-[8px] px-1 py-0.2 bg-accent text-black font-bold uppercase">
                            YOU
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-zinc-400 mt-0.5">{tier.ratePercent}% Margin</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Matrix Table */}
            <div className="flex-1 overflow-y-auto mt-2 -mx-3 sm:mx-0 pr-1">
              {(() => {
                const allPlans = [
                  ...(plans?.mtn || []).map((p) => ({ ...p, _network: 'MTN' })),
                  ...(plans?.glo || []).map((p) => ({ ...p, _network: 'GLO' })),
                  ...(plans?.airtel || []).map((p) => ({ ...p, _network: 'AIRTEL' })),
                ];

                const filtered = allPlans.filter((p) => {
                  if (matrixNetworkFilter !== 'ALL' && p._network !== matrixNetworkFilter) return false;
                  if (matrixSearchQuery.trim()) {
                    const q = matrixSearchQuery.toLowerCase();
                    return p.name.toLowerCase().includes(q) || p.validity.toLowerCase().includes(q);
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No data plans found matching your search.
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/80 sticky top-0 text-[10px] uppercase text-zinc-400 tracking-wider">
                          <th className="p-2 sm:p-2.5">Plan & Network</th>
                          <th className="p-2 sm:p-2.5">Validity</th>
                          <th className="p-2 sm:p-2.5 text-right">Official Price</th>
                          <th className="p-2 sm:p-2.5 text-right text-amber-400">Clarion Wholesale</th>
                          <th className="p-2 sm:p-2.5 text-right text-white">Your Cost</th>
                          <th className="p-2 sm:p-2.5 text-right text-emerald-400 font-bold">Your Net Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {filtered.map((plan) => {
                          const official = getPlanOfficialPrice(plan);
                          const clarionWholesale = calculateClarionWholesalePrice(plan);
                          const yourCost = calculateTierWholesaleCost(plan, matrixSelectedTier);
                          const profit = Math.max(0, official - yourCost);
                          const marginPercent = official > 0 ? Math.round((profit / official) * 100) : 0;

                          return (
                            <tr key={plan.code} className="hover:bg-zinc-900/40 transition-colors">
                              <td className="p-2 sm:p-2.5 font-bold text-white whitespace-nowrap">
                                <span className={`mr-1.5 text-[10px] px-1 py-0.2 font-bold ${
                                  plan._network === 'MTN'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : plan._network === 'GLO'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}>
                                  {plan._network}
                                </span>
                                <span>{plan.name}</span>
                              </td>
                              <td className="p-2 sm:p-2.5 text-zinc-400 text-[11px] whitespace-nowrap">
                                {plan.validity}
                              </td>
                              <td className="p-2 sm:p-2.5 text-right text-zinc-300 whitespace-nowrap">
                                ₦{official.toLocaleString()}
                              </td>
                              <td className="p-2 sm:p-2.5 text-right text-amber-400 font-bold whitespace-nowrap" title="Base + Fee + 60% gross profit floor">
                                ₦{clarionWholesale.toLocaleString()}
                              </td>
                              <td className="p-2 sm:p-2.5 text-right text-white font-bold whitespace-nowrap">
                                ₦{yourCost.toLocaleString()}
                              </td>
                              <td className="p-2 sm:p-2.5 text-right font-bold text-emerald-400 whitespace-nowrap">
                                +₦{profit.toLocaleString()} <span className="text-[10px] text-emerald-400/80 font-normal">({marginPercent}%)</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-zinc-800 flex flex-col gap-2 shrink-0">
              <p className="text-[10px] text-zinc-500">
                💡 All retail markups are calculated dynamically. Clarion guarantees your profit never falls below ₦1 at any slider position.
              </p>
              <button
                type="button"
                onClick={() => setShowPricingMatrixModal(false)}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border border-zinc-800 flex items-center justify-center gap-1.5"
              >
                <X size={12} />
                <span>CLOSE</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Fixed Bottom Bar: Dual-Action Quick Vend & WhatsApp ── */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#09090B]/95 backdrop-blur-md border-t border-zinc-800 p-2.5 sm:p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          {/* Store label: hidden on mobile, visible sm+ */}
          <div className="hidden sm:block text-[11px] font-mono text-zinc-400 truncate">
            <span className="text-white font-bold">{brandName}</span> · Retail Console
          </div>
          {/* Dual Action Dock: Quick Vend + WhatsApp Chat */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => openUnifiedVendModal()}
              className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md whitespace-nowrap active:scale-[0.98]"
            >
              <Zap size={14} className="fill-black" />
              <span>QUICK VEND</span>
            </button>
            <a
              href={whatsappChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md whitespace-nowrap"
            >
              <MessageSquare size={13} className="text-emerald-400" />
              <span>{chatButtonLabel}</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

