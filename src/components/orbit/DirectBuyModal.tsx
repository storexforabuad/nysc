import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Phone, ShieldCheck, Zap, Heart, AlertCircle, Loader2, ArrowUp } from 'lucide-react';

export interface DirectPlan {
  code: string;
  name: string;
  validity: string;
  network: 'mtn' | 'glo' | 'airtel';
  baseCost: number;
  sellPrice: number;
  officialPrice: number;
}

interface DirectBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlans?: {
    mtn: DirectPlan[];
    glo: DirectPlan[];
    airtel: DirectPlan[];
  };
}

export function getPlanOfficialPrice(plan: DirectPlan): number {
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
  if (name.includes('2.5GB')) return 1000;
  if (name.includes('3GB') && validity.includes('30 DAY')) return 2500;
  if (name.includes('3.2GB')) return 1200;
  if (name.includes('4GB')) return 1500;
  if (name.includes('5GB') && validity.includes('30 DAY')) return 3000;
  if (name.includes('7GB')) return 3500;
  if (name.includes('10GB')) return 4500;
  if (name.includes('14.5GB')) return 6000;
  if (name.includes('20GB')) return 8000;
  if (name.includes('25GB')) return 10000;
  if (name.includes('36GB')) return 13000;
  if (name.includes('100GB')) return 25000;

  return Math.max(plan.sellPrice, Math.ceil((plan.sellPrice * 1.25) / 50) * 50);
}

export function get4XWholesalePrice(plan: DirectPlan): number {
  // Pinned promotional prices
  if (plan.code === 'M1GB1D') return 290;
  if (plan.code === 'M1GBS') return 550;
  if (plan.code === 'M1GBS2') return 650;
  if (plan.code === 'G1GB1') return 390;
  if (plan.code === 'G1GB2') return 390;
  if (plan.code === 'G1GB4') return 450;
  if (plan.code === 'A1GB') return 800;

  const s = plan.sellPrice;
  const c = plan.baseCost || Math.round(plan.sellPrice * 0.7);
  const f = s < 2500 ? Math.round(s * 0.015) : Math.min(2000, Math.round(s * 0.015 + 100));
  const netP = Math.max(0, s - c - f);
  const rate = 0.40; // 4X VIP discount
  const discountAmount = Math.round(netP * rate);
  return Math.max(c, s - discountAmount);
}

export default function DirectBuyModal({ isOpen, onClose, initialPlans }: DirectBuyModalProps) {
  const [networkTab, setNetworkTab] = useState<'mtn' | 'glo' | 'airtel'>('mtn');
  const [plans, setPlans] = useState<{ mtn: DirectPlan[]; glo: DirectPlan[]; airtel: DirectPlan[] }>(() => {
    if (initialPlans) return initialPlans;
    return { mtn: [], glo: [], airtel: [] };
  });
  const [selectedPlan, setSelectedPlan] = useState<DirectPlan | null>(null);
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const planListRef = useRef<HTMLDivElement>(null);

  // Fetch plans from backend if not passed in
  useEffect(() => {
    if (!isOpen) return;
    if (plans.mtn.length > 0) {
      if (!selectedPlan && plans.mtn.length > 0) {
        const def = plans.mtn.find(p => p.code === 'M1GB1D') || plans.mtn[0];
        setSelectedPlan(def);
      }
      return;
    }

    setIsLoadingPlans(true);
    fetch('/api/proxy/09155946561/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.plans) {
          setPlans(d.plans);
          const def = (d.plans.mtn || []).find((p: DirectPlan) => p.code === 'M1GB1D') || d.plans.mtn?.[0] || null;
          setSelectedPlan(def);
        }
      })
      .catch(err => {
        console.error('Failed to fetch data plans:', err);
      })
      .finally(() => {
        setIsLoadingPlans(false);
      });
  }, [isOpen]);

  // Auto-scroll selected plan into view when selected
  useEffect(() => {
    if (selectedPlan && planListRef.current) {
      const el = planListRef.current.querySelector(`[data-plan-code="${selectedPlan.code}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedPlan?.code, networkTab]);

  // When network tab changes, select preferred plan of that network
  const handleNetworkChange = (net: 'mtn' | 'glo' | 'airtel') => {
    setNetworkTab(net);
    const netPlans = plans[net] || [];
    if (netPlans.length > 0) {
      const preferred = net === 'mtn' 
        ? netPlans.find(p => p.code === 'M1GB1D') || netPlans[0]
        : netPlans.find(p => p.name.includes('1GB')) || netPlans[0];
      setSelectedPlan(preferred);
    } else {
      setSelectedPlan(null);
    }
  };

  // Contact Picker Web API
  const handlePickContact = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['tel'];
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts && contacts.length > 0 && contacts[0].tel && contacts[0].tel.length > 0) {
          const raw = contacts[0].tel[0].replace(/\D/g, '');
          const clean = raw.startsWith('234') && raw.length === 13 ? '0' + raw.slice(3) : raw;
          setRecipientPhone(clean);
        }
      } catch (err) {
        console.warn('Contact picker cancelled or not supported:', err);
      }
    }
  };

  // Submit Direct Paystack Checkout
  const handleProceedToPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) {
      setErrorMsg('Please select a data plan');
      return;
    }
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      setErrorMsg('Please enter a valid 11-digit Nigerian phone number');
      return;
    }

    const price = get4XWholesalePrice(selectedPlan);
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/orbit/direct-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: selectedPlan.code,
          recipientPhone: cleanPhone,
          network: networkTab,
          amount: price
        })
      });

      const json = await res.json();
      if (!json.success || !json.authorizationUrl) {
        throw new Error(json.error || 'Failed to generate Paystack checkout session');
      }

      // Redirect customer to Paystack official checkout
      window.location.href = json.authorizationUrl;
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment initiation failed. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentPlans = plans[networkTab] || [];
  const activePlanPrice = selectedPlan ? get4XWholesalePrice(selectedPlan) : 0;
  const activeOfficialPrice = selectedPlan ? getPlanOfficialPrice(selectedPlan) : 0;
  const activeSavings = Math.max(0, activeOfficialPrice - activePlanPrice);
  const savingsPercent = activeOfficialPrice > 0 ? Math.round((activeSavings / activeOfficialPrice) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 font-mono">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-zinc-950 border-t sm:border border-zinc-800 w-full max-w-sm sm:max-w-md p-4 sm:p-5 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Zap size={13} className="text-emerald-400 fill-emerald-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Buy Data · Instant Dispense
              </h3>
              <p className="text-[9px] text-zinc-400">Direct Telco Delivery · Zero Wallet Top Up Needed</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors p-1 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-0.5 space-y-3.5 pt-2 text-xs">
          {/* Network Switcher Tabs (Matching Merchant Dashboard Quick Vend) */}
          <div className="space-y-1">
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block">
              1. Select Network:
            </label>
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
              {(['mtn', 'glo', 'airtel'] as const).map((net) => {
                const isSelected = networkTab === net;
                const netLabel = net === 'mtn' ? '🟡 MTN' : net === 'glo' ? '🟢 GLO' : '🔴 AIRTEL';
                const planCount = plans?.[net]?.length || 0;
                return (
                  <button
                    key={net}
                    type="button"
                    onClick={() => handleNetworkChange(net)}
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
                    <div>{netLabel}</div>
                    <div className="text-[9px] font-normal opacity-70">{planCount} plans</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plan Picker List */}
          <div>
            <div className="flex justify-between items-center mb-1 text-[10px] text-zinc-400 uppercase tracking-wider">
              <span>2. Select {networkTab.toUpperCase()} Data Plan:</span>
              <span className="text-zinc-500">{currentPlans.length} Available</span>
            </div>

            <div
              ref={planListRef}
              className="max-h-40 overflow-y-auto space-y-1 pr-1 border border-zinc-900 p-1 bg-black/50"
            >
              {isLoadingPlans ? (
                <div className="py-8 text-center text-zinc-500 flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  <span>Loading telco catalog...</span>
                </div>
              ) : currentPlans.length === 0 ? (
                <div className="py-6 text-center text-zinc-500">
                  No plans available for this network right now.
                </div>
              ) : (
                <>
                  {currentPlans.map((p) => {
                    const isSelected = selectedPlan?.code === p.code;
                    const price = get4XWholesalePrice(p);
                    const official = getPlanOfficialPrice(p);
                    const savings = Math.max(0, official - price);
                    const cleanName = (p.name || '').replace(/\s*\(\+\d+(\.\d+)?GB\s+all\s+night\s+streaming\)/gi, '').trim();

                    return (
                      <button
                        key={p.code}
                        data-plan-code={p.code}
                        type="button"
                        onClick={() => setSelectedPlan(p)}
                        className={`w-full text-left px-2.5 py-2 text-[11px] border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold shadow-sm'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-bold text-white">{cleanName}</span>
                          <span className="text-zinc-500 mx-1">·</span>
                          <span className="text-[10px] text-zinc-400">{p.validity}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-white">₦{price.toLocaleString()}</span>
                          {savings > 0 && (
                            <span className="text-[10px] text-emerald-400 font-mono ml-1.5 font-bold">
                              (−₦{savings.toLocaleString()} Off)
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* End of list utility note & scroll to top */}
                  <div className="pt-2 pb-1 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-500 font-mono px-1">
                    <span>✦ More plans will be added soon</span>
                    <button
                      type="button"
                      onClick={() => planListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="text-accent hover:underline flex items-center gap-1 cursor-pointer font-bold"
                    >
                      <ArrowUp size={11} />
                      <span>Back to top</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Form: Phone Number & Paystack Checkout */}
          <form onSubmit={handleProceedToPay} className="space-y-3">
            {/* Phone Number Input */}
            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                3. Recipient Phone Number:
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="08012345678"
                  maxLength={11}
                  required
                  className="flex-1 bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-3 py-2 focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handlePickContact}
                  className="px-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
                  title="Pick from contacts"
                >
                  <Phone size={14} />
                </button>
              </div>
            </div>

            {/* Price Summary Breakdown (Clean Mobile-Aligned Grid) */}
            {selectedPlan && (
              <div className="p-3 bg-zinc-900/90 border border-zinc-800 space-y-2 text-[11px] font-mono">
                <div className="flex justify-between items-center text-zinc-400">
                  <span className="truncate pr-2">Selected Bundle:</span>
                  <span className="font-bold text-white shrink-0">{selectedPlan.name} ({selectedPlan.validity})</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Official Bank Price:</span>
                  <span className="line-through text-zinc-500">₦{activeOfficialPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-emerald-400 font-bold">
                  <span>Wholesale Savings:</span>
                  <span>−₦{activeSavings.toLocaleString()} ({savingsPercent}% OFF)</span>
                </div>
                <div className="flex justify-between items-center text-zinc-400 pt-1.5 border-t border-zinc-800/80 text-[10px]">
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
                    <span>Paystack Fee:</span>
                  </span>
                  <span className="text-emerald-400 font-bold uppercase tracking-wider">₦0 (100% FREE)</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-zinc-800 text-xs">
                  <span className="font-bold text-white uppercase tracking-wider">Final Amount to Pay:</span>
                  <span className="font-black text-accent text-base">₦{activePlanPrice.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] flex items-center gap-1.5">
                <AlertCircle size={13} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* CDH Notice & Community Impact */}
            <div className="space-y-1 text-[10px] text-zinc-400 leading-tight">
              <div className="flex items-center gap-1">
                <ShieldCheck size={12} className="text-accent shrink-0" />
                <span>Secured by Paystack · Registered to <strong className="text-white">Clarion Digital Hub (CDH)</strong></span>
              </div>
              <div className="flex items-center gap-1 text-emerald-400/90">
                <Heart size={12} className="shrink-0 text-emerald-400" />
                <span>A portion of proceeds funds digital research data grants for Nigerian students.</span>
              </div>
            </div>

            {/* Paystack Primary Button */}
            <button
              type="submit"
              disabled={isSubmitting || !selectedPlan}
              className={`w-full py-3.5 px-4 bg-accent hover:bg-white text-black font-bold uppercase tracking-wider text-xs transition-all cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                isSubmitting ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin text-black" />
                  <span>Connecting to Paystack...</span>
                </>
              ) : (
                <>
                  <Zap size={15} className="fill-black" />
                  <span>PAY ₦{activePlanPrice.toLocaleString()} WITH PAYSTACK</span>
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
