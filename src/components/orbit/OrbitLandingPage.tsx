import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Zap, ArrowRight, CheckCircle2, Heart, Sparkles, Store, Check, Edit2, GraduationCap } from 'lucide-react';
import DirectBuyModal from './DirectBuyModal';
import ResellerWaitlistModal from './ResellerWaitlistModal';
import StudentGrantModal from './StudentGrantModal';
import VendReceiptModal, { ReceiptDetails } from '../merchant/VendReceiptModal';

export default function OrbitLandingPage() {
  const [searchParams] = useSearchParams();
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptDetails | null>(null);

  // Check if user has already joined the waitlist
  const [waitlistRecord, setWaitlistRecord] = useState<{
    businessName: string;
    contact: string;
    campus?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('orbit_reseller_waitlist');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Check if user just returned from a successful Paystack payment redirect
  useEffect(() => {
    const status = searchParams.get('status');
    const reference = searchParams.get('reference');
    const plan = searchParams.get('plan');
    const network = searchParams.get('network');
    const phone = searchParams.get('phone');
    const amount = searchParams.get('amount');

    if (status === 'success' && reference) {
      setReceiptData({
        brandName: 'Clarion Digital Hub (CDH) · OrbitVTU',
        network: network || 'MTN',
        planName: plan || 'Data Bundle',
        recipientPhone: phone || 'Customer',
        amountPaid: Number(amount) || 0,
        reference,
        date: new Date().toLocaleString(),
        savingsNaira: plan?.includes('1GB') ? 350 : 200
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-display flex flex-col selection:bg-accent selection:text-black">
      {/* ── Top Brand Header ── */}
      <header className="px-4 py-4 md:px-8 border-b border-zinc-800 bg-[#09090B]/90 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-accent flex items-center justify-center font-bold text-black text-lg font-mono">
            OV
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight uppercase leading-none">OrbitVTU</h1>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-0.5">
              Data for you and yours
            </p>
          </div>
        </div>

        {/* Quick Buy Header Shortcut */}
        <button
          type="button"
          onClick={() => setIsBuyModalOpen(true)}
          className="px-3.5 py-1.5 bg-accent hover:bg-white text-black font-mono text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
        >
          <Zap size={13} className="fill-emerald-950 text-emerald-950" />
          <span>BUY DATA</span>
        </button>
      </header>

      {/* ── Main Hero Section ── */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 md:py-14 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-950/40 border border-emerald-500/30 text-accent font-mono text-[11px] font-bold uppercase tracking-widest rounded-full shadow-sm">
              <Zap size={13} className="fill-accent text-accent shrink-0" />
              <span>Direct Wholesale Telco Pricing · Up to 35% Off Official Prices</span>
            </div>

            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight leading-[0.95] text-white">
              Stop Buying Data <br />
              <span className="text-accent underline decoration-accent/40 underline-offset-8">
                At Bank Prices.
              </span>
            </h2>

            <p className="text-sm sm:text-base font-mono text-zinc-400 max-w-xl mx-auto pt-2">
              Wholesale data for you and yours. Delivered directly to any phone in seconds.
            </p>

            {/* Price Pill & Value Hook */}
            <div className="pt-2 space-y-2">
              <div className="inline-block px-4 py-2 bg-zinc-900 border border-zinc-700 text-white font-mono text-sm sm:text-base font-bold tracking-tight shadow-lg">
                🏷️ STARTING FROM <span className="text-accent font-black">₦290/GB</span>
              </div>
              <p className="text-xs font-mono text-zinc-400">
                Save up to 35% on MTN, Airtel & Glo plans
              </p>
              <div className="text-[11px] font-mono font-bold tracking-[0.25em] text-accent uppercase pt-1">
                ✦ BUY · GIFT · RESELL ✦
              </div>
            </div>

            {/* ── Single Primary CTA: [ ⚡ BUY DATA ] (Strictly ONE dark green zap) ── */}
            <div className="pt-4 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => setIsBuyModalOpen(true)}
                className="w-full py-4 px-6 bg-accent hover:bg-white text-black font-mono font-black text-sm sm:text-base uppercase tracking-wider shadow-2xl transition-all cursor-pointer flex items-center justify-center gap-2 group active:scale-95"
              >
                <Zap size={18} className="fill-emerald-950 text-emerald-950" />
                <span>BUY DATA</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <p className="text-[10px] font-mono text-zinc-500 mt-2">
                Instant automated delivery in seconds · No signup or wallet funding needed
              </p>
            </div>
        </motion.div>

        {/* ── Trust Pillars & Guarantees (2x2 Grid - 4 Pillars) ── */}
        <section className="bg-zinc-950 border border-zinc-800 p-4 sm:p-5 font-mono text-xs">
          <div className="grid grid-cols-2 gap-3">
            {[
              { title: 'No Wallet Funding', desc: 'Pay per vend directly' },
              { title: 'No App Download', desc: 'Runs instantly in browser' },
              { title: 'Zero Hidden Fees', desc: '100% free Paystack processing' },
              { title: 'Paystack Secured', desc: 'Card, USSD & Bank Transfer' }
            ].map((pillar, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-zinc-900/40 border border-zinc-800/80">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white block text-[11px]">{pillar.title}</span>
                  <span className="text-[10px] text-zinc-500 block leading-tight">{pillar.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Reseller Portal & Dynamic Waitlist Transformation Section ── */}
        <section className="p-5 bg-gradient-to-br from-zinc-900 via-black to-zinc-950 border border-zinc-800 font-mono space-y-3">
          {waitlistRecord ? (
            /* State 2: Registered Waitlist Banner */
            <div className="space-y-3 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <Check size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                      Priority Reseller Waitlist Active
                    </span>
                    <h4 className="text-base font-bold text-white uppercase">
                      Brand Reserved: "{waitlistRecord.businessName}"
                    </h4>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsWaitlistModalOpen(true)}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 size={11} />
                  <span>EDIT RESERVATION</span>
                </button>
              </div>

              <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                You're on the priority onboarding queue for your autonomous branded data store. Your custom portal link and AI Data Resell Coach activation will be delivered to <strong className="text-white">{waitlistRecord.contact}</strong> as onboarding waves roll out!
              </p>
            </div>
          ) : (
            /* State 1: Call to Action to Join Waitlist */
            <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent/10 border border-accent/30 text-accent text-[11px] font-bold uppercase tracking-wider">
                  <Store size={14} />
                  <span>🏪 RESELLER OPPORTUNITY · AI DATA RESELL COACH ACCESS</span>
                </div>
                <h4 className="text-lg sm:text-xl font-bold uppercase text-white tracking-tight">
                  WANT YOUR OWN BRANDED DATA STORE?
                </h4>
                  <p className="text-xs text-zinc-300 max-w-lg mx-auto font-sans leading-relaxed">
                    Get a personalized web portal link branded to your Business name. Your customers buy data directly and autonomously, while you unlock deeper wholesale discounts and keep 100% profit.
                  </p>

                    {/* Feature Bullets */}
                    <div className="max-w-md mx-auto grid grid-cols-1 gap-1.5 py-1 text-left">
                      {[
                        '✦ Autonomous Branded Link',
                        '✦ Exclusive Reseller Rates',
                        '✦ AI Marketing & Status Coach Coming Soon'
                      ].map((bullet, idx) => (
                        <div key={idx} className="px-3 py-1.5 bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-300 font-mono flex items-center gap-2">
                          <span className="text-accent">{bullet}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setIsWaitlistModalOpen(true)}
                        className="px-6 py-2.5 bg-accent hover:bg-white text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95 flex items-center justify-center gap-1.5 mx-auto"
                      >
                        <Zap size={14} className="fill-black text-black" />
                        <span>⚡ Join WaitList</span>
                      </button>
                    </div>
                  </div>
          )}
                </section>

                {/* ── Community Giving Back Impact Banner with Apply Button ── */}
                <section className="p-4 sm:p-5 bg-emerald-950/20 border border-emerald-500/30 text-center font-mono space-y-2">
                  <div className="inline-flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
                    <Heart size={14} className="fill-emerald-400 text-emerald-400" />
                    <span>Data That Gives Back</span>
                  </div>
                  <h4 className="text-sm sm:text-base font-bold uppercase text-white tracking-tight">
                    Empowering Nigerian Students & Creators
                  </h4>
                  <p className="text-xs text-zinc-300 max-w-lg mx-auto font-sans leading-relaxed">
                    Every gigabyte purchased on OrbitVTU helps fund free digital research data grants for underprivileged university students and community innovators through Clarion Digital Hub.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsGrantModalOpen(true)}
                      className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
                    >
                      <GraduationCap size={14} />
                      <span>APPLY FOR DATA GRANT</span>
                    </button>
                  </div>
                </section>
              </main>

              {/* ── Minimalist Clean Footer with CDH Branding ── */}
              <footer className="p-4 md:p-6 border-t border-zinc-800 bg-zinc-950 text-center font-mono text-[10px] text-zinc-500 space-y-2">
                <p className="text-zinc-300 font-bold uppercase tracking-wider">
                  Powered by CDH (Clarion Digital Hub) · Paystack Secured
                </p>
                <p className="text-zinc-600 pt-1">
                  OrbitVTU · Data for you and yours · All rights reserved
                </p>
              </footer>

              {/* ── Direct Buy Modal ── */}
              {isBuyModalOpen && (
                <DirectBuyModal
                  isOpen={isBuyModalOpen}
                  onClose={() => setIsBuyModalOpen(false)}
                />
              )}

              {/* ── Reseller Waitlist Modal ── */}
              {isWaitlistModalOpen && (
                <ResellerWaitlistModal
                  isOpen={isWaitlistModalOpen}
                  onClose={() => setIsWaitlistModalOpen(false)}
                  onSuccess={(record) => setWaitlistRecord(record)}
                />
              )}

              {/* ── Student Research Data Grant Modal ── */}
              {isGrantModalOpen && (
                <StudentGrantModal
                  isOpen={isGrantModalOpen}
                  onClose={() => setIsGrantModalOpen(false)}
                />
              )}

              {/* ── Post-Payment Digital Receipt Modal with Charity Thank You ── */}
              {receiptData && (
                <VendReceiptModal
                  isOpen={!!receiptData}
                  onClose={() => setReceiptData(null)}
                  receipt={receiptData}
                />
              )}
            </div>
          );
}
