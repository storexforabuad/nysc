import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Share2, Copy, Check, X, Heart, ShieldCheck } from 'lucide-react';

export interface ReceiptDetails {
  brandName?: string;
  network: string;
  planName: string;
  recipientPhone: string;
  amountPaid: number;
  reference: string;
  date: string;
  savingsNaira?: number;
}

interface VendReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptDetails | null;
}

export default function VendReceiptModal({
  isOpen,
  onClose,
  receipt
}: VendReceiptModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !receipt) return null;

  const brand = receipt.brandName || 'Clarion Digital Hub (CDH) · OrbitVTU';

  const plainTextReceipt = `🧾 *OFFICIAL DATA PURCHASE RECEIPT*\n` +
    `Merchant: *${brand}*\n` +
    `──────────────────────────────\n` +
    `• Network: *${receipt.network.toUpperCase()}*\n` +
    `• Package: *${receipt.planName}*\n` +
    `• Recipient: *${receipt.recipientPhone}*\n` +
    `• Amount Paid: *₦${receipt.amountPaid.toLocaleString()}*${receipt.savingsNaira ? ` (Saved ₦${receipt.savingsNaira.toLocaleString()} vs Bank)` : ''}\n` +
    `• Ref: *${receipt.reference}*\n` +
    `• Date: *${receipt.date}*\n` +
    `• Status: *DISPATCHED & ACTIVE* ⚡\n` +
    `──────────────────────────────\n` +
    `💚 *Community Impact Note:*\n` +
    `"Thank you for your purchase! A portion of this transaction directly funds free student research data grants and community empowerment programs through Clarion Digital Hub."\n` +
    `──────────────────────────────\n` +
    `Powered by CDH · Data for you and yours 🙏`;

  const handleCopyText = () => {
    navigator.clipboard.writeText(plainTextReceipt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const encoded = encodeURIComponent(plainTextReceipt);
    const cleanPhone = receipt.recipientPhone.replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '234' + cleanPhone.slice(1) : cleanPhone;
    window.open(`https://wa.me/${intlPhone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm font-mono">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-zinc-950 border border-zinc-800 w-full max-w-sm p-5 shadow-2xl space-y-4 text-xs"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Payment & Vend Confirmed
              </h3>
              <p className="text-[10px] text-zinc-400">{brand}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Receipt Body */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 p-3.5 space-y-2">
          <div className="flex justify-between items-center text-zinc-400">
            <span>Network:</span>
            <span className="font-bold text-white uppercase">{receipt.network}</span>
          </div>

          <div className="flex justify-between items-center text-zinc-400">
            <span>Data Plan:</span>
            <span className="font-bold text-white">{receipt.planName}</span>
          </div>

          <div className="flex justify-between items-center text-zinc-400">
            <span>Recipient:</span>
            <span className="font-bold text-accent">{receipt.recipientPhone}</span>
          </div>

          <div className="flex justify-between items-center text-zinc-400">
            <span>Amount Paid:</span>
            <div className="text-right">
              <span className="font-bold text-white">₦{receipt.amountPaid.toLocaleString()}</span>
              {receipt.savingsNaira ? (
                <span className="text-[10px] text-emerald-400 block font-bold">
                  Saved ₦{receipt.savingsNaira.toLocaleString()}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex justify-between items-center text-zinc-400 pt-1 border-t border-zinc-800/80 text-[10px]">
            <span>Reference:</span>
            <span className="text-zinc-300 select-all">{receipt.reference}</span>
          </div>

          <div className="flex justify-between items-center text-zinc-400 text-[10px]">
            <span>Time:</span>
            <span className="text-zinc-400">{receipt.date}</span>
          </div>
        </div>

        {/* Giving Back / Community Impact Banner */}
        <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 space-y-1 text-[11px] leading-relaxed">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
            <Heart size={12} className="fill-emerald-400 text-emerald-400" />
            <span>Community Impact & Giving Back</span>
          </div>
          <p className="text-zinc-300 text-[10px] font-sans">
            Thank you for your purchase! A portion of this transaction directly funds free student research data grants and community empowerment programs through Clarion Digital Hub.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Share2 size={13} />
            <span>SHARE RECEIPT ON WHATSAPP</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'RECEIPT COPIED' : 'COPY AS TEXT'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 text-zinc-400 hover:text-white text-center text-[11px] uppercase tracking-wider transition-colors cursor-pointer"
        >
          CLOSE
        </button>
      </motion.div>
    </div>
  );
}
