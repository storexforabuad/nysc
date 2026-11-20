import fs from 'fs';

// 1. Update src/server.js
const serverPath = 'c:\\Users\\m\\Downloads\\nysc\\src\\server.js';
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Replace tier calculation in /api/merchant/:identifier/dashboard
const oldServerTier = `      const balance = await wallet.getBalance(matchedUid).catch(() => 0);
      const tier = wallet.getMultiplierTier(balance);`;

const newServerTier = `      const balance = await wallet.getBalance(matchedUid).catch(() => 0);
      // Universal 4X VIP Tier for all merchants (Day 1 unlock)
      const tier = {
        level: 6,
        multiplier: '4X',
        name: 'Tier 6 · 4X MAX VIP',
        minBalance: 0,
        neededToNext: 0,
        progressPercent: 100,
        nextThreshold: null
      };`;

if (serverContent.includes(oldServerTier)) {
  serverContent = serverContent.replace(oldServerTier, newServerTier);
  fs.writeFileSync(serverPath, serverContent, 'utf8');
  console.log('src/server.js updated successfully!');
} else {
  console.error('Failed to find oldServerTier in src/server.js');
}

// 2. Update src/components/merchant/MerchantDashboard.tsx
const dashboardPath = 'c:\\Users\\m\\Downloads\\nysc\\src\\components\\merchant\\MerchantDashboard.tsx';
let dashContent = fs.readFileSync(dashboardPath, 'utf8');

// A. Update handleModalTopUpClick to accept neededAmount
const oldTopUpHandler = `  // 1-Click Top Up from Modal -> Switches to Wallet tab, auto-opens Top Up Area, and scrolls down
  const handleModalTopUpClick = () => {
    setVendingPlan(null);
    setActiveTab('wallet');
    setShowTopUpGuide(true);
    setTimeout(() => {
      topUpCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };`;

const newTopUpHandler = `  // 1-Click Top Up from Modal -> Switches to Wallet tab, auto-opens Top Up Area, pre-fills needed amount, and scrolls down
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
  };`;

// B. Call handleModalTopUpClick with deficit in modal alert
const oldModalAlertButton = `                        <button
                          type="button"
                          onClick={handleModalTopUpClick}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm shrink-0 active:scale-95"
                        >
                          TOP UP
                        </button>`;

const newModalAlertButton = `                        <button
                          type="button"
                          onClick={() => handleModalTopUpClick(modalWholesaleCost - (user.walletBalance || 0))}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm shrink-0 active:scale-95"
                        >
                          TOP UP
                        </button>`;

// C. Update Account Number copy button to [ COPY ] / [ COPIED ]
const oldAcctCopyBtn = `                    <button
                      onClick={() => copyToClipboard('9819092390', 'acct')}
                      className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                      title="Copy Account Number"
                    >
                      {copiedKey === 'acct' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>`;

const newAcctCopyBtn = `                    <button
                      type="button"
                      onClick={() => copyToClipboard('9819092390', 'acct')}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === 'acct' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{copiedKey === 'acct' ? 'COPIED' : 'COPY'}</span>
                    </button>`;

// D. Update Wholesale Discount Engine banner (lines 836-879)
const oldEngineCard = `          <div className="flex justify-between items-start mb-3">
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

const newEngineCard = `          <div className="flex justify-between items-start mb-3">
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
          </div>`;

dashContent = dashContent.replace(oldTopUpHandler, newTopUpHandler);
dashContent = dashContent.replace(oldModalAlertButton, newModalAlertButton);
dashContent = dashContent.replace(oldAcctCopyBtn, newAcctCopyBtn);
dashContent = dashContent.replace(oldEngineCard, newEngineCard);

fs.writeFileSync(dashboardPath, dashContent, 'utf8');
console.log('MerchantDashboard.tsx updated successfully!');

