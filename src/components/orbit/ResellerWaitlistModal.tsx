import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Store, Mail, Phone, MapPin, CheckCircle2, Zap, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

interface ResellerWaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { businessName: string; contact: string; campus?: string }) => void;
}

export default function ResellerWaitlistModal({
  isOpen,
  onClose,
  onSuccess
}: ResellerWaitlistModalProps) {
  const [businessName, setBusinessName] = useState('');
  const [contact, setContact] = useState('');
  const [campus, setCampus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setErrorMsg('Please enter your desired business or store name');
      return;
    }
    if (!contact.trim()) {
      setErrorMsg('Please enter your phone number or email address');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/waitlist/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          contact: contact.trim(),
          campus: campus.trim() || undefined
        })
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to submit waitlist registration');
      }

      const record = {
        businessName: businessName.trim(),
        contact: contact.trim(),
        campus: campus.trim() || undefined
      };

      // Persist in localStorage
      try {
        localStorage.setItem('orbit_reseller_waitlist', JSON.stringify(record));
      } catch { }

      onSuccess(record);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error joining waitlist. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 font-mono">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-zinc-950 border-t sm:border border-zinc-800 w-full max-w-sm sm:max-w-md p-4 sm:p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
              <Store size={13} className="text-accent" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Reserve Your Branded Data Store
              </h3>
              <p className="text-[9px] text-zinc-400">Priority Merchant Onboarding · AI Data Resell Coach Access</p>
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

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 pt-3 text-xs">
          <div className="p-2.5 bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-300 leading-relaxed font-sans">
            🌐 <strong>Autonomous Branded Storefront:</strong> Reserve your business name to get a dedicated web portal link where your customers purchase data directly under your brand. Keep 100% of your retail markup with VIP wholesale rates.
          </div>

          {/* Desired Store Name */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
              Desired Business / Store Name:
            </label>
            <div className="relative">
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. SwiftGig Telecom, Musty Data"
                required
                className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm pl-8 pr-3 py-2 focus:border-accent focus:outline-none"
              />
              <Store size={14} className="text-zinc-500 absolute left-2.5 top-3" />
            </div>
          </div>

          {/* Contact (Phone or Email) */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
              Phone or Email for Portal Delivery:
            </label>
            <div className="relative">
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. 08012345678 or name@email.com"
                required
                className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm pl-8 pr-3 py-2 focus:border-accent focus:outline-none"
              />
              <Phone size={14} className="text-zinc-500 absolute left-2.5 top-3" />
            </div>
          </div>

          {/* Location / Campus */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
              State, City or Campus (Optional):
            </label>
            <div className="relative">
              <input
                type="text"
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
                placeholder="e.g. Lagos / UNILAG / Abuja"
                className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm pl-8 pr-3 py-2 focus:border-accent focus:outline-none"
              />
              <MapPin size={14} className="text-zinc-500 absolute left-2.5 top-3" />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] flex items-center gap-1.5">
              <AlertCircle size={13} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3.5 px-4 bg-accent hover:bg-white text-black font-bold uppercase tracking-wider text-xs transition-all cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-wait' : ''
                }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin text-black" />
                  <span>Reserving your brand...</span>
                </>
              ) : (
                <>
                  <Zap size={14} className="fill-black text-black" />
                  <span>⚡ Join WaitList</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

