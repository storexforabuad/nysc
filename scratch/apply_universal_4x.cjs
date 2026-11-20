
const fs = require('fs');
const filePath = 'c:\\Users\\m\\Downloads\\nysc\\src\\components\\merchant\\MerchantDashboard.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update matrixSelectedTier default to 6
const oldMatrixTier = "const [matrixSelectedTier, setMatrixSelectedTier] = useState<number>(() => user.multiplierTier?.level || 1);";
const newMatrixTier = "const [matrixSelectedTier, setMatrixSelectedTier] = useState<number>(6);";

// 2. Add handleModalTopUpClick
const oldUnifiedVend = `  // Open Unified Quick-Vend Modal helper with favorite/recent auto-select
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
  };`;

const newUnifiedVend = `  // Open Unified Quick-Vend Modal helper with favorite/recent auto-select
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

  // 1-Click Top Up from Modal -> Switches to Wallet tab, auto-opens Top Up Area, and scrolls down
  const handleModalTopUpClick = () => {
    setVendingPlan(null);
    setActiveTab('wallet');
    setShowTopUpGuide(true);
    setTimeout(() => {
      topUpCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };`;

// 3. Update communityDrop (Slot 1)
const oldCommunityDrop = `  const communityDrop = \`💚 Smart Data That Gives Back 🇳🇬\\n\\n\` +
    \`Did you know? Every time you buy data or pay bills through \${brandName}:\\n\` +
    \`• You get verified, ultra-cheap data in seconds\\n\` +
    \`• A portion of every purchase quietly supports grassroots community projects & youth development in underserved local areas!\\n\\n\` +
    \`Fast data that empowers our community. 🏫✨\\n\` +
    \`📲 Reply to this status anytime with your network & budget to support!\`;`;

const newCommunityDrop = `  const communityDrop = \`✦ \${brandName} ⚡\\n\` +
    \`──────────────────────────────\\n\` +
    \`Hey everyone! 👋 You can now get fast, reliable data for MTN, Airtel & Glo directly from me.\\n\\n\` +
    \`💚 Smart Data That Gives Back:\\n\` +
    \`Did you know? Every time you buy data through \${brandName}:\\n\` +
    \`• You get verified, ultra-cheap data delivered in under 30 seconds\\n\` +
    \`• A portion of every purchase quietly supports grassroots community projects & youth development in underserved local areas!\\n\\n\` +
    \`Fast data that empowers our community. 🏫✨\\n\` +
    \`📲 DM me your network & size anytime you need data! ⚡\\n\` +
    \`— \${brandName}\`;`;

// 4. Top Banner & Liquidity Bar
const oldTopBanner = `          <div className="flex justify-between items-start mb-3">
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
                ₦{user.walletBalance.toLocaleString()} {user.multiplierTier?.nextThreshold ? \`/ ₦\${user.multiplierTier.nextThreshold.toLocaleString()}\` : '/ ₦10,000 (VIP Cap)'}
              </span>
            </div>
            <div className="w-full bg-zinc-950 border border-zinc-800 h-2.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: \`\${Math.min(100, Math.max(5, Math.round((user.walletBalance / 10000) * 100))) }%\` }}
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
          </div>`;

const newTopBanner = `          <div className="flex justify-between items-start mb-3">
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
              <span className="text-white font-bold">
                ₦{user.walletBalance.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-zinc-950 border border-zinc-800 h-2.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: \`\${Math.min(100, Math.max(5, Math.round((user.walletBalance / 10000) * 100))) }%\` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="bg-accent h-full shadow-[0_0_10px_rgba(255,255,255,0.4)]"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
            <p className="text-[11px] font-mono text-zinc-400">
              <span className="text-accent font-bold">🔥 You are at maximum VIP tier (Up to 24% off official Prices)!</span>
            </p>
            <button
              onClick={() => setShowTopUpGuide(!showTopUpGuide)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold transition-all cursor-pointer border border-zinc-700 shrink-0 text-center"
            >
              {showTopUpGuide ? 'HIDE ACCOUNT' : 'TOP UP WALLET'}
            </button>
          </div>`;

// 5. Terminology replacements
const oldTopUpDetails = `              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <p className="text-accent font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard size={14} />
                  <span>Central Hub Payment Details</span>
                </p>
                <span className="text-[10px] text-zinc-500 font-bold">INSTANT FLOAT CREDIT</span>
              </div>`;

const newTopUpDetails = `              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <p className="text-accent font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard size={14} />
                  <span>Top Up Area · Bank Transfer</span>
                </p>
                <span className="text-[10px] text-zinc-500 font-bold">INSTANT WALLET CREDIT</span>
              </div>`;

const oldFloatCredit = `                  <div className="flex justify-between">
                    <span>Float Balance to Credit:</span>
                    <span className="text-white font-bold">₦{fundAmount.toLocaleString()}</span>
                  </div>`;

const newFloatCredit = `                  <div className="flex justify-between">
                    <span>Wallet Balance to Credit:</span>
                    <span className="text-white font-bold">₦{fundAmount.toLocaleString()}</span>
                  </div>`;

const oldHowToTopUp = `                <p className="text-white font-bold flex items-center gap-1 text-[11px]">
                  ⚡ <span>How to Top Up Your Float:</span>
                </p>`;

const newHowToTopUp = `                <p className="text-white font-bold flex items-center gap-1 text-[11px]">
                  ⚡ <span>How to Top Up Your Wallet:</span>
                </p>`;

// 6. Slider label
const oldSliderLabel = "<span>{user.multiplierTier?.multiplier || '1X'} Wholesale Base</span>";
const newSliderLabel = "<span>4X Wholesale Base</span>";

// 7. Status Drops Header
const oldDropsBadge = `                      <span className="truncate">AI Coach · Status Drops</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 font-normal shrink-0">
                        4 DROPS
                      </span>`;

const newDropsBadge = `                      <span className="truncate">AI Coach · Status Drops</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold shrink-0">
                        2 SLOTS ACTIVE
                      </span>`;

const oldDropsSub = `                    {!statusDropsExpanded && (
                      <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        Morning · Community · Gifting · Streamers
                      </p>
                    )}`;

const newDropsSub = `                    {!statusDropsExpanded && (
                      <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        Slot 1: First Touch & Community · Slot 2: Active Timed Drop
                      </p>
                    )}`;

// 8. Status Drops Body
const oldStatusDropsSection = `                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-mono text-zinc-500">READY-TO-POST WHATSAPP TEMPLATES</span>
                      <span className="text-[10px] font-mono text-accent font-bold">1-CLICK COPY</span>
                    </div>

                    <div className="grid gap-3">
                      {/* Morning Drop */}
                      <div className="p-3 bg-zinc-950/70 border border-zinc-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 font-mono">
                            🌅 08:30 AM · Morning Hustle
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(morningDrop, 'drop_morning'); }}
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
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(communityDrop, 'drop_community'); }}
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
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(middayGiftingDrop, 'drop_midday'); }}
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
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(eveningDrop, 'drop_evening'); }}
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
                    </div>`;

const newStatusDropsSection = `                    <div className="flex justify-between items-center mb-2.5">
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
                              <span className={\`text-xs font-bold \${colorClass} flex items-center gap-1.5 font-mono\`}>
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
                    </div>`;

// 9. Price Card buttons: full-width
const oldMtnCardAction = `                        <div className="pt-2 border-t border-zinc-900 flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('MTN', plans?.mtn || [], brandName), 'card_mtn'); }}
                            className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_mtn' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_mtn' ? 'COPIED' : 'COPY LIST'}</span>
                          </button>
                          {(plans?.mtn?.length ?? 0) > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openUnifiedVendModal('mtn'); }}
                              className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-mono font-bold border border-amber-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Vend MTN data to a customer"
                            >
                              <Send size={10} />
                              <span>VEND</span>
                            </button>
                          )}
                        </div>`;

const newMtnCardAction = `                        <div className="pt-2 border-t border-zinc-900">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('MTN', plans?.mtn || [], brandName), 'card_mtn'); }}
                            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_mtn' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_mtn' ? 'COPIED TO CLIPBOARD' : 'COPY MTN 5G PRICE LIST'}</span>
                          </button>
                        </div>`;

const oldGloCardAction = `                        <div className="pt-2 border-t border-zinc-900 flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('GLO', plans?.glo || [], brandName), 'card_glo'); }}
                            className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_glo' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_glo' ? 'COPIED' : 'COPY LIST'}</span>
                          </button>
                          {(plans?.glo?.length ?? 0) > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openUnifiedVendModal('glo'); }}
                              className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Vend GLO data to a customer"
                            >
                              <Send size={10} />
                              <span>VEND</span>
                            </button>
                          )}
                        </div>`;

const newGloCardAction = `                        <div className="pt-2 border-t border-zinc-900">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('GLO', plans?.glo || [], brandName), 'card_glo'); }}
                            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_glo' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_glo' ? 'COPIED TO CLIPBOARD' : 'COPY GLO 5G PRICE LIST'}</span>
                          </button>
                        </div>`;

const oldAirtelCardAction = `                        <div className="pt-2 border-t border-zinc-900 flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('AIRTEL', plans?.airtel || [], brandName), 'card_airtel'); }}
                            className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_airtel' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_airtel' ? 'COPIED' : 'COPY LIST'}</span>
                          </button>
                          {(plans?.airtel?.length ?? 0) > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openUnifiedVendModal('airtel'); }}
                              className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-mono font-bold border border-red-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Vend Airtel data to a customer"
                            >
                              <Send size={10} />
                              <span>VEND</span>
                            </button>
                          )}
                        </div>`;

const newAirtelCardAction = `                        <div className="pt-2 border-t border-zinc-900">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(formatPriceCardText('AIRTEL', plans?.airtel || [], brandName), 'card_airtel'); }}
                            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-zinc-800"
                          >
                            {copiedKey === 'card_airtel' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedKey === 'card_airtel' ? 'COPIED TO CLIPBOARD' : 'COPY AIRTEL 5G PRICE LIST'}</span>
                          </button>
                        </div>`;

// 10. Modal Alert: double line
const oldModalAlert = `                    {hasInsufficientFloat && (
                      <div className="text-red-400 text-[11px] p-2.5 bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertCircle size={13} className="shrink-0 text-red-400" />
                          <span className="truncate">
                            Insufficient wallet balance! Need ₦{modalWholesaleCost.toLocaleString()}, available: ₦{user.walletBalance.toLocaleString()}.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setVendingPlan(null);
                            setActiveTab('wallet');
                          }}
                          className="shrink-0 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold border border-red-500/40 uppercase cursor-pointer transition-colors text-[10px]"
                        >
                          Top Up
                        </button>
                      </div>
                    )}`;

const newModalAlert = `                    {hasInsufficientFloat && (
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
                          onClick={handleModalTopUpClick}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm shrink-0 active:scale-95"
                        >
                          TOP UP
                        </button>
                      </div>
                    )}`;

// Replacements
content = content.replace(oldMatrixTier, newMatrixTier);
content = content.replace(oldUnifiedVend, newUnifiedVend);
content = content.replace(oldCommunityDrop, newCommunityDrop);
content = content.replace(oldTopBanner, newTopBanner);
content = content.replace(oldTopUpDetails, newTopUpDetails);
content = content.replace(oldFloatCredit, newFloatCredit);
content = content.replace(oldHowToTopUp, newHowToTopUp);
content = content.replace(oldSliderLabel, newSliderLabel);
content = content.replace(oldDropsBadge, newDropsBadge);
content = content.replace(oldDropsSub, newDropsSub);
content = content.replace(oldStatusDropsSection, newStatusDropsSection);
content = content.replace(oldMtnCardAction, newMtnCardAction);
content = content.replace(oldGloCardAction, newGloCardAction);
content = content.replace(oldAirtelCardAction, newAirtelCardAction);
content = content.replace(oldModalAlert, newModalAlert);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Node script applied all replacements successfully!');
