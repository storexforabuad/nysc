import fs from 'fs';

const filePath = 'src/components/admin/ManagementViews.tsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Update imports
content = content.replace(
  "import { Store, Bot, CreditCard, CheckCircle2, AlertCircle, RefreshCw, Pencil, Save, Loader2, Users, Download, Eye, FileSpreadsheet, X } from 'lucide-react';",
  "import { Store, Bot, CreditCard, CheckCircle2, AlertCircle, RefreshCw, Pencil, Save, Loader2, Users, Download, Eye, FileSpreadsheet, X, GraduationCap, PhoneCall, ExternalLink } from 'lucide-react';"
);

// 2. Add grants state
const stateTarget = `    const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false);`;
const stateReplacement = `    const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false);
    const [grants, setGrants] = useState<Array<{
        id: string;
        fullName: string;
        institution: string;
        courseAndLevel?: string;
        phone: string;
        network: string;
        purpose: string;
        appliedAt: string;
        status: string;
    }>>([]);
    const [isLoadingGrants, setIsLoadingGrants] = useState(false);`;

content = content.replace(stateTarget, stateReplacement);

// 3. Update fetchData
const fetchTarget = `            const [pRes, wRes, cRes] = await Promise.all([
                fetch('/api/admin/partners', { headers }),
                fetch('/api/admin/withdrawals/pending', { headers }),
                fetch('/api/admin/status-captions', { headers })
            ]);

            if (pRes.ok) setPartners(await pRes.json());
            if (wRes.ok) setWithdrawals(await wRes.json());
            if (cRes.ok) {
                const data = await cRes.json();
                setCaptions(data.captions || {});
            }`;

const fetchReplacement = `            const [pRes, wRes, cRes, wlRes, gRes] = await Promise.all([
                fetch('/api/admin/partners', { headers }),
                fetch('/api/admin/withdrawals/pending', { headers }),
                fetch('/api/admin/status-captions', { headers }),
                fetch('/api/admin/waitlist', { headers }),
                fetch('/api/admin/grants', { headers })
            ]);

            if (pRes.ok) setPartners(await pRes.json());
            if (wRes.ok) setWithdrawals(await wRes.json());
            if (cRes.ok) {
                const data = await cRes.json();
                setCaptions(data.captions || {});
            }
            if (wlRes && wlRes.ok) {
                const data = await wlRes.json();
                setWaitlist(data.waitlist || []);
            }
            if (gRes && gRes.ok) {
                const data = await gRes.json();
                setGrants(data.grants || []);
            }`;

content = content.replace(fetchTarget, fetchReplacement);

// 4. Add UI panels for Waitlist and Grants before the final closing </div>
const uiPanels = `
            {/* ── RESELLER WAITLIST APPLICATIONS ── */}
            <div className="pt-8 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Store size={16} className="text-accent" />
                        <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-widest">
                            Reseller Waitlist ({waitlist.length} Reserved)
                        </h3>
                    </div>
                    <button onClick={fetchData} className="text-zinc-500 hover:text-accent p-1">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {waitlist.length === 0 ? (
                    <div className="p-6 bg-zinc-950 border border-zinc-800 text-center font-mono text-xs text-zinc-500">
                        No reseller reservations recorded yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono">
                        {waitlist.map((w, idx) => {
                            const cleanPhone = (w.contact || '').replace(/\\D/g, '');
                            const waLink = \`https://wa.me/234\${cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone}?text=\${encodeURIComponent(\`Hello \${w.businessName}, this is Clarion Digital Hub regarding your OrbitVTU Reseller store reservation!\`)}\`;
                            return (
                                <div key={w.id || idx} className="bg-zinc-950 border border-zinc-800 p-4 rounded flex flex-col justify-between space-y-3">
                                    <div className="space-y-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="text-sm font-bold text-white uppercase truncate">{w.businessName}</h4>
                                            <span className="px-1.5 py-0.5 bg-accent/10 border border-accent/30 text-accent text-[9px] font-bold uppercase rounded shrink-0">
                                                {w.status || 'WAITLIST'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-400">📱 {w.contact}</p>
                                        {w.campus && <p className="text-[11px] text-zinc-500">📍 {w.campus}</p>}
                                        <p className="text-[10px] text-zinc-600">{new Date(w.registeredAt).toLocaleString()}</p>
                                    </div>
                                    <a
                                        href={waLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="py-2 px-3 bg-zinc-900 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider rounded text-center flex items-center justify-center gap-1.5 transition"
                                    >
                                        <PhoneCall size={12} />
                                        <span>Chat On WhatsApp</span>
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── STUDENT RESEARCH DATA GRANTS APPLICATIONS ── */}
            <div className="pt-8 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <GraduationCap size={16} className="text-emerald-400" />
                        <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-widest">
                            Student Research Data Grants ({grants.length} Applied)
                        </h3>
                    </div>
                    <button onClick={fetchData} className="text-zinc-500 hover:text-accent p-1">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {grants.length === 0 ? (
                    <div className="p-6 bg-zinc-950 border border-zinc-800 text-center font-mono text-xs text-zinc-500">
                        No student research grant applications submitted yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono">
                        {grants.map((g, idx) => {
                            const cleanPhone = (g.phone || '').replace(/\\D/g, '');
                            const waLink = \`https://wa.me/234\${cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone}?text=\${encodeURIComponent(\`Hello \${g.fullName}, this is Clarion Digital Hub regarding your Student Data Grant application!\`)}\`;
                            const netColor = g.network === 'MTN' ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' : g.network === 'GLO' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-red-400 bg-red-400/10 border-red-400/30';
                            return (
                                <div key={g.id || idx} className="bg-zinc-950 border border-zinc-800 p-4 rounded flex flex-col justify-between space-y-3">
                                    <div className="space-y-1.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="text-sm font-bold text-white uppercase truncate">{g.fullName}</h4>
                                            <span className={\`px-1.5 py-0.5 border text-[9px] font-bold uppercase rounded shrink-0 \${netColor}\`}>
                                                {g.network}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-300">🏛️ {g.institution}</p>
                                        {g.courseAndLevel && <p className="text-[11px] text-zinc-400">📚 {g.courseAndLevel}</p>}
                                        <p className="text-xs text-zinc-400">📱 {g.phone}</p>
                                        <div className="p-2 bg-zinc-900 border border-zinc-800/80 rounded text-[11px] text-zinc-400 font-sans italic">
                                            "{g.purpose}"
                                        </div>
                                        <p className="text-[10px] text-zinc-600">{new Date(g.appliedAt).toLocaleString()}</p>
                                    </div>
                                    <a
                                        href={waLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider rounded text-center flex items-center justify-center gap-1.5 transition"
                                    >
                                        <PhoneCall size={12} />
                                        <span>Message Student</span>
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
`;

// Insert before the last </div>
const lastDivIndex = content.lastIndexOf('</div>');
content = content.slice(0, lastDivIndex) + uiPanels + '\n        </div>\n    );\n}\n';

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched ManagementViews.tsx with Reseller Waitlist and Student Grants panels!');
