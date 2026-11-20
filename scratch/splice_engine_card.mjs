import fs from 'fs';

const filePath = 'src/components/merchant/MerchantDashboard.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Lines 839 to 876 (0-indexed: 838 to 875)
const newBlockLines = [
  '          <div className="flex justify-between items-start mb-3">',
  '            <div>',
  '              <p className="text-[10px] font-mono text-accent uppercase tracking-[0.2em] font-bold">Wholesale Discount Engine</p>',
  '              <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tight text-white mt-0.5">',
  '                Tier 6 · 4X MAX VIP',
  '              </h2>',
  '            </div>',
  '            <div className="bg-accent text-black font-mono font-bold text-xs px-2.5 py-1 tracking-wider uppercase">',
  '              4X VIP POWER',
  '            </div>',
  '          </div>',
  '',
  '          {/* Wallet Balance Bar */}',
  '          <div className="space-y-1.5 mt-3">',
  '            <div className="flex justify-between text-xs font-mono">',
  '              <span className="text-zinc-400">Clarion Wallet Balance:</span>',
  '              <span className="text-white font-bold">₦{user.walletBalance.toLocaleString()}</span>',
  '            </div>',
  '            <div className="w-full bg-zinc-950 border border-zinc-800 h-2.5 overflow-hidden">',
  '              <div className="bg-accent h-full w-full shadow-[0_0_10px_rgba(255,255,255,0.4)]" />',
  '            </div>',
  '          </div>',
  '',
  '          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">',
  '            <div className="text-[11px] font-mono space-y-0.5">',
  '              <p className="text-accent font-bold">',
  '                ⚡ Maximum VIP Tier Active · Up to 24% off official Prices!',
  '              </p>',
  '              <p className="text-zinc-400 text-[10px]">',
  '                No minimum balance required to maintain 4X rates. Fund what you need to vend.',
  '              </p>',
  '            </div>'
];

lines.splice(838, 38, ...newBlockLines);
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Successfully spliced Wholesale Engine card into MerchantDashboard.tsx!');

