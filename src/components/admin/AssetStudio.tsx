import React, { useState } from 'react';
import { Image, Sparkles, Download, Copy, RefreshCw, Eye, Check, ChevronDown, ChevronUp, Layers, Award, FileText, Share2, Tag, Heart } from 'lucide-react';

interface AssetConfig {
    id: string;
    title: string;
    badge: string;
    aspectRatio: string;
    dimensions: string;
    description: string;
    icon: any;
    color: string;
}

const ASSET_CATALOG: AssetConfig[] = [
    {
        id: 'FRANCHISE_CARD',
        title: 'Franchise License ID Card',
        badge: 'OFFICIAL CERTIFICATE',
        aspectRatio: '3:4',
        dimensions: '1080 × 1420 px',
        description: 'Official NYSC SAED Enterprise license card featuring operator identity, CDS Odometer, and GTCO virtual account.',
        icon: Award,
        color: 'text-amber-400 border-amber-500/20 bg-amber-500/10'
    },
    {
        id: 'DONATION_CERTIFICATE',
        title: 'Community Champion Receipt',
        badge: 'DONATION PROOF',
        aspectRatio: '3:4',
        dimensions: '1080 × 1420 px',
        description: 'Personalized NYSC CDS Champion certificate dispatched when a donor contributes to the CDS fund.',
        icon: Heart,
        color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
    },
    {
        id: 'RECEIPT',
        title: 'Customer Order Receipt',
        badge: 'PAYMENT PROOF',
        aspectRatio: '2:3',
        dimensions: '800 × 1200 px',
        description: 'Digital transaction receipt attached to WhatsApp order fulfillment confirmations.',
        icon: FileText,
        color: 'text-teal-400 border-teal-500/20 bg-teal-500/10'
    },
    {
        id: 'PRICE_CARD',
        title: 'Subsidized Data Rate Sheet',
        badge: 'TELCO FLYER',
        aspectRatio: '3:4',
        dimensions: '1080 × 1440 px',
        description: 'Clean rate flyer showcasing MTN, Airtel, Glo & 9mobile subsidized pricing tables for WhatsApp Status.',
        icon: Tag,
        color: 'text-sky-400 border-sky-500/20 bg-sky-500/10'
    },
    {
        id: 'SHARE_CARD',
        title: 'Storefront Launch Poster',
        badge: '1:1 SOCIAL POST',
        aspectRatio: '1:1',
        dimensions: '1080 × 1080 px',
        description: 'Square viral poster with WhatsApp store line link & quick purchase commands.',
        icon: Share2,
        color: 'text-purple-400 border-purple-500/20 bg-purple-500/10'
    },
    {
        id: 'GIVEAWAY_POSTER',
        title: 'Promo Fuel Giveaway Poster',
        badge: 'MARKETING AIRDROP',
        aspectRatio: '1:1',
        dimensions: '1080 × 1080 px',
        description: 'High-converting promo poster firing when vendors fund Day 1 Promo Fuel for free 500MB giveaways.',
        icon: Sparkles,
        color: 'text-rose-400 border-rose-500/20 bg-rose-500/10'
    }
];

export default function AssetStudio() {
    const [showControls, setShowControls] = useState(false);
    const [loadingAsset, setLoadingAsset] = useState<string | null>(null);
    const [activeAsset, setActiveAsset] = useState<{ id: string; imageBase64: string; title: string } | null>(null);
    const [copied, setCopied] = useState(false);

    // Custom Mock Inputs
    const [mockParams, setMockParams] = useState({
        name: 'BABATUNDE OLUWASEUN ADEYEMI',
        stateCode: 'LA/26A/4892',
        franchiseName: 'Clarion AI - Babatunde Enterprise',
        donationTier: 'MASTER',
        phone: '08119772223',
        planName: 'MTN 5GB SME',
        amount: '1300',
        buyerPhone: '08012345678'
    });

    const handleInputChange = (field: string, val: string) => {
        setMockParams(prev => ({ ...prev, [field]: val }));
    };

    const handleGenerate = async (asset: AssetConfig) => {
        setLoadingAsset(asset.id);
        try {
            const token = localStorage.getItem('clarion_admin_token');
            const res = await fetch('/api/admin/generate-asset-sample', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    assetType: asset.id,
                    customParams: mockParams
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to generate asset');
            }

            const data = await res.json();
            if (data.imageBase64) {
                setActiveAsset({
                    id: asset.id,
                    imageBase64: data.imageBase64,
                    title: asset.title
                });
            }
        } catch (e: any) {
            alert(e.message || 'Asset generation failed');
        } finally {
            setLoadingAsset(null);
        }
    };

    const handleDownload = () => {
        if (!activeAsset) return;
        const link = document.createElement('a');
        link.href = activeAsset.imageBase64;
        link.download = `clarion_${activeAsset.id.toLowerCase()}_sample.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCopyBase64 = () => {
        if (!activeAsset) return;
        navigator.clipboard.writeText(activeAsset.imageBase64);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="w-full space-y-6">
            {/* ── HEADER ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-accent/10 border border-accent/20 rounded-lg text-accent">
                        <Image size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-mono font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                            Brand & Asset Generation Studio
                            <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-accent/10 text-accent border border-accent/20 rounded">LIVE CANVAS</span>
                        </h3>
                        <p className="text-xs font-mono text-zinc-500 mt-0.5">
                            Real-time rendering engine for certificates, receipts, price flyers & promotional cards.
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setShowControls(!showControls)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded transition self-start md:self-auto"
                >
                    <Layers size={14} />
                    {showControls ? 'Hide Custom Inputs' : 'Customize Mock Data'}
                    {showControls ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {/* ── MOCK DATA CUSTOMIZER PANEL ── */}
            {showControls && (
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Operator Name</label>
                        <input
                            type="text"
                            value={mockParams.name}
                            onChange={e => handleInputChange('name', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">State Code</label>
                        <input
                            type="text"
                            value={mockParams.stateCode}
                            onChange={e => handleInputChange('stateCode', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Franchise Brand Name</label>
                        <input
                            type="text"
                            value={mockParams.franchiseName}
                            onChange={e => handleInputChange('franchiseName', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Partnership Tier</label>
                        <select
                            value={mockParams.donationTier}
                            onChange={e => handleInputChange('donationTier', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        >
                            <option value="MEMBER">MEMBER (20% CDS)</option>
                            <option value="MASTER">MASTER (50% CDS)</option>
                            <option value="LORD">LORD (80% CDS)</option>
                            <option value="PIONEER">PIONEER (Gold Badge)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Sample Plan Name</label>
                        <input
                            type="text"
                            value={mockParams.planName}
                            onChange={e => handleInputChange('planName', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Sample Price (₦)</label>
                        <input
                            type="text"
                            value={mockParams.amount}
                            onChange={e => handleInputChange('amount', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Store Phone Number</label>
                        <input
                            type="text"
                            value={mockParams.phone}
                            onChange={e => handleInputChange('phone', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">Buyer Phone Number</label>
                        <input
                            type="text"
                            value={mockParams.buyerPhone}
                            onChange={e => handleInputChange('buyerPhone', e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-accent"
                        />
                    </div>
                </div>
            )}

            {/* ── ASSET CATALOG GRID ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ASSET_CATALOG.map(asset => {
                    const IconComp = asset.icon;
                    const isLoading = loadingAsset === asset.id;

                    return (
                        <div
                            key={asset.id}
                            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-5 rounded-xl flex flex-col justify-between transition group"
                        >
                            <div>
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-zinc-800 rounded-lg text-zinc-300 group-hover:text-accent transition">
                                            <IconComp size={18} />
                                        </div>
                                        <div>
                                            <h4 className="font-mono text-xs uppercase font-bold text-zinc-200">{asset.title}</h4>
                                            <p className="text-[10px] font-mono text-zinc-500">{asset.dimensions}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border shrink-0 ${asset.color}`}>
                                        {asset.badge}
                                    </span>
                                </div>

                                <p className="text-xs font-mono text-zinc-400 leading-relaxed mb-4">
                                    {asset.description}
                                </p>
                            </div>

                            <button
                                onClick={() => handleGenerate(asset)}
                                disabled={isLoading}
                                className="w-full py-2.5 bg-zinc-800 hover:bg-accent hover:text-black font-mono font-bold text-xs rounded transition flex items-center justify-center gap-2 border border-zinc-700 hover:border-accent shadow-sm disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        <span>RENDERING CANVAS...</span>
                                    </>
                                ) : (
                                    <>
                                        <Eye size={14} />
                                        <span>GENERATE SAMPLE</span>
                                    </>
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* ── HIGH-RES PREVIEW MODAL ── */}
            {activeAsset && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                            <div>
                                <h3 className="text-sm font-mono font-bold text-zinc-200 uppercase tracking-wide">
                                    {activeAsset.title}
                                </h3>
                                <p className="text-[10px] font-mono text-zinc-500">Live Generated Preview Payload</p>
                            </div>
                            <button
                                onClick={() => setActiveAsset(null)}
                                className="text-zinc-500 hover:text-zinc-200 font-mono text-sm px-2 py-1 bg-zinc-800 rounded"
                            >
                                ✕ Close
                            </button>
                        </div>

                        {/* Image Canvas Container */}
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-center max-h-[60vh] overflow-auto">
                            <img
                                src={activeAsset.imageBase64}
                                alt={activeAsset.title}
                                className="max-h-[55vh] w-auto object-contain rounded-lg shadow-lg"
                            />
                        </div>

                        {/* Modal Action Footer */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopyBase64}
                                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs rounded transition flex items-center gap-1.5 border border-zinc-700"
                                >
                                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                    <span>{copied ? 'Copied Payload!' : 'Copy Base64'}</span>
                                </button>
                            </div>

                            <button
                                onClick={handleDownload}
                                className="px-4 py-2 bg-accent hover:bg-amber-400 text-black font-mono font-bold text-xs rounded transition flex items-center gap-2 shadow-md"
                            >
                                <Download size={14} />
                                <span>DOWNLOAD HIGH-RES PNG</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
