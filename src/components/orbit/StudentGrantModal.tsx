import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, GraduationCap, Phone, School, BookOpen, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

interface StudentGrantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (data: any) => void;
}

export default function StudentGrantModal({
  isOpen,
  onClose,
  onSuccess
}: StudentGrantModalProps) {
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [courseAndLevel, setCourseAndLevel] = useState('');
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState<'MTN' | 'GLO' | 'AIRTEL'>('MTN');
  const [purpose, setPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !institution.trim() || !phone.trim()) {
      setErrorMsg('Please fill out all required fields');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      setErrorMsg('Please enter a valid 11-digit phone number');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        fullName: fullName.trim(),
        institution: institution.trim(),
        courseAndLevel: courseAndLevel.trim(),
        phone: cleanPhone,
        network,
        purpose: purpose.trim()
      };

      const res = await fetch('/api/grants/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to submit application');
      }

      try {
        localStorage.setItem('orbit_grant_applied', JSON.stringify(payload));
      } catch {}

      setIsSubmitted(true);
      onSuccess?.(payload);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting application. Please try again.');
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
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <GraduationCap size={13} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Student Research Data Grant
              </h3>
              <p className="text-[9px] text-zinc-400">Sponsored by Clarion Digital Hub (CDH)</p>
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

        {isSubmitted ? (
          <div className="py-6 text-center space-y-4 font-mono">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={28} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white uppercase">Application Received!</h4>
              <p className="text-xs text-zinc-400 font-sans max-w-xs mx-auto leading-relaxed">
                Thank you, <strong className="text-white">{fullName}</strong>. Your grant request has been submitted to the Clarion Digital Hub review committee.
              </p>
            </div>
            <div className="p-3 bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 font-sans text-left space-y-1">
              <p>📍 <strong>Institution:</strong> {institution}</p>
              <p>📱 <strong>Delivery Line:</strong> {phone} ({network})</p>
              <p className="text-emerald-400 text-[10px] pt-1">✦ Grantees are selected weekly and credited automatically.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-accent hover:bg-white text-black font-bold uppercase tracking-wider text-xs transition-all cursor-pointer"
            >
              DONE
            </button>
          </div>
        ) : (
          /* Body Form */
          <form onSubmit={handleSubmit} className="space-y-3 pt-3 text-xs overflow-y-auto pr-0.5">
          <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 text-[11px] text-zinc-300 leading-relaxed font-sans">
            🎓 <strong>Free Student Data Grants:</strong> We disburse sponsored research data packages to Nigerian university and tertiary students to support thesis work, online research, and academic innovation.
          </div>

          {/* Full Name */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
              Full Name:
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Chioma Adebayo"
              required
              className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-3 py-2 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Institution */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
              University / Polytechnic / Institution:
            </label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g. UNILAG, ABU Zaria, UI, FUTA"
              required
              className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-3 py-2 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Department & Level */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
              Course / Department & Level:
            </label>
            <input
              type="text"
              value={courseAndLevel}
              onChange={(e) => setCourseAndLevel(e.target.value)}
              placeholder="e.g. Computer Science · 300L"
              required
              className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-3 py-2 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Phone & SIM Network */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                WhatsApp Phone:
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="08012345678"
                maxLength={11}
                required
                className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-3 py-2 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                Network:
              </label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value as any)}
                className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-sm px-2 py-2 focus:border-emerald-500 focus:outline-none"
              >
                <option value="MTN">MTN</option>
                <option value="GLO">GLO</option>
                <option value="AIRTEL">AIRTEL</option>
              </select>
            </div>
          </div>

          {/* Research / Study Purpose */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
              Brief Purpose / Research Area:
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Online coursework, final year project research, or coding tutorials."
              rows={2}
              required
              className="w-full bg-zinc-900 border border-zinc-700 text-white font-mono text-xs p-2 focus:border-emerald-500 focus:outline-none resize-none"
            />
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
              className={`w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase tracking-wider text-xs transition-all cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                isSubmitting ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin text-black" />
                  <span>Submitting Application...</span>
                </>
              ) : (
                <>
                  <GraduationCap size={15} />
                  <span>SUBMIT GRANT APPLICATION</span>
                </>
              )}
            </button>
          </div>
        </form>
        )}
      </motion.div>
    </div>
  );
}

