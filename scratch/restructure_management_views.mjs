import fs from 'fs';

const filePath = 'src/components/admin/ManagementViews.tsx';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add activeTab state
const stateMarker = `    const [isLoadingGrants, setIsLoadingGrants] = useState(false);`;
const stateReplacement = `    const [isLoadingGrants, setIsLoadingGrants] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'waitlist' | 'grants' | 'partners' | 'payouts' | 'tools'>('all');`;
content = content.replace(stateMarker, stateReplacement);

// 2. Remove the waitlist and grants blocks from the bottom
const waitlistGrantsBottomMarker = `            {/* ── RESELLER WAITLIST APPLICATIONS ── */}`;
const bottomStartIndex = content.indexOf(waitlistGrantsBottomMarker);

if (bottomStartIndex !== -1) {
    const lastClosingDiv = content.lastIndexOf('</div>');
    // cut from bottomStartIndex up to lastClosingDiv
    content = content.slice(0, bottomStartIndex) + '</div>\n    );\n}\n';
}

// 3. Define the new Top Navigation Tabs and Sections
const topTabsAndSections = `            {/* ── STICKY CATEGORY NAVIGATION TABS ── */}
            <div className="sticky top-14 z-30 bg-[#09090B]/95 backdrop-blur border-b border-zinc-800 pb-3 pt-2 -mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar font-mono text-xs">
                <button
                    onClick={() => setActiveTab('all')}
                    className={\`px-3 py-1.5 rounded transition uppercase font-bold shrink-0 cursor-pointer \${activeTab === 'all' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}\`}
                >
                    All Operations
                </button>
                <button
                    onClick={() => setActiveTab('waitlist')}
                    className={\`px-3 py-1.5 rounded transition uppercase font-bold shrink-0 flex items-center gap-1.5 cursor-pointer \${activeTab === 'waitlist' ? 'bg-accent text-black' : 'bg-zinc-900 text-zinc-400 hover:text-accent border border-zinc-800'}\`}
                >
                    <Store size={13} />
                    <span>Reseller Waitlist</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono font-bold">
                        {waitlist.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('grants')}
                    className={\`px-3 py-1.5 rounded transition uppercase font-bold shrink-0 flex items-center gap-1.5 cursor-pointer \${activeTab === 'grants' ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400 hover:text-emerald-400 border border-zinc-800'}\`}
                >
                    <GraduationCap size={13} />
                    <span>Student Grants</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono font-bold">
                        {grants.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('partners')}
                    className={\`px-3 py-1.5 rounded transition uppercase font-bold shrink-0 flex items-center gap-1.5 cursor-pointer \${activeTab === 'partners' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}\`}
                >
                    <Bot size={13} />
                    <span>Partners ({partners.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('payouts')}
                    className={\`px-3 py-1.5 rounded transition uppercase font-bold shrink-0 flex items-center gap-1.5 cursor-pointer \${activeTab === 'payouts' ? 'bg-red-500 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-red-400 border border-zinc-800'}\`}
                >
                    <CreditCard size={13} />
                    <span>Payouts ({withdrawals.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('tools')}
                    className={\`px-3 py-1.5 rounded transition uppercase font-bold shrink-0 cursor-pointer \${activeTab === 'tools' ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}\`}
                >
                    Studio & Tools
                </button>
            </div>

            {/* ── PRIORITY 1: RESELLER WAITLIST APPLICATIONS (NOW AT TOP) ── */}
            {(activeTab === 'all' || activeTab === 'waitlist') && (
                <div id="section-waitlist" className="p-4 sm:p-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Store size={18} className="text-accent" />
                            <div>
                                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                    <span>Reseller Waitlist</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-accent/10 border border-accent/30 text-accent font-bold">
                                        {waitlist.length} RESERVED
                                    </span>
                                </h3>
                                <p className="text-[10px] font-mono text-zinc-500">Autonomous Branded Storefront Reservations</p>
                            </div>
                        </div>
                        <button onClick={fetchData} className="text-zinc-500 hover:text-accent p-1.5 bg-zinc-900 border border-zinc-800 rounded">
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {waitlist.length === 0 ? (
                        <div className="p-8 bg-zinc-950 border border-zinc-800/80 rounded text-center font-mono text-xs text-zinc-500 space-y-1">
                            <Store size={24} className="mx-auto text-zinc-700 mb-2" />
                            <p className="font-bold text-zinc-400 uppercase">No Reseller Reservations Recorded Yet</p>
                            <p className="text-[11px] text-zinc-600">Submissions from the landing page waitlist modal will appear here instantly.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono">
                            {waitlist.map((w, idx) => {
                                const cleanPhone = (w.contact || '').replace(/\\D/g, '');
                                const waLink = \`https://wa.me/234\${cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone}?text=\${encodeURIComponent(\`Hello \${w.businessName}, this is Clarion Digital Hub regarding your OrbitVTU Reseller store reservation!\`)}\`;
                                return (
                                    <div key={w.id || idx} className="bg-zinc-950 border border-zinc-800/90 p-4 rounded-lg flex flex-col justify-between space-y-3 hover:border-zinc-700 transition">
                                        <div className="space-y-1.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <h4 className="text-sm font-bold text-white uppercase truncate">{w.businessName}</h4>
                                                <span className="px-1.5 py-0.5 bg-accent/10 border border-accent/30 text-accent text-[9px] font-bold uppercase rounded shrink-0">
                                                    {w.status || 'WAITLIST'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-300">📱 {w.contact}</p>
                                            {w.campus && <p className="text-[11px] text-zinc-400">📍 {w.campus}</p>}
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
            )}

            {/* ── PRIORITY 2: STUDENT RESEARCH DATA GRANTS (NOW AT TOP) ── */}
            {(activeTab === 'all' || activeTab === 'grants') && (
                <div id="section-grants" className="p-4 sm:p-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <GraduationCap size={18} className="text-emerald-400" />
                            <div>
                                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                    <span>Student Research Data Grants</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                                        {grants.length} APPLIED
                                    </span>
                                </h3>
                                <p className="text-[10px] font-mono text-zinc-500">Sponsored by Clarion Digital Hub (CDH)</p>
                            </div>
                        </div>
                        <button onClick={fetchData} className="text-zinc-500 hover:text-accent p-1.5 bg-zinc-900 border border-zinc-800 rounded">
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {grants.length === 0 ? (
                        <div className="p-8 bg-zinc-950 border border-zinc-800/80 rounded text-center font-mono text-xs text-zinc-500 space-y-1">
                            <GraduationCap size={24} className="mx-auto text-zinc-700 mb-2" />
                            <p className="font-bold text-zinc-400 uppercase">No Student Research Grant Applications Submitted Yet</p>
                            <p className="text-[11px] text-zinc-600">Applications from the landing page grant modal will appear here.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono">
                            {grants.map((g, idx) => {
                                const cleanPhone = (g.phone || '').replace(/\\D/g, '');
                                const waLink = \`https://wa.me/234\${cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone}?text=\${encodeURIComponent(\`Hello \${g.fullName}, this is Clarion Digital Hub regarding your Student Data Grant application!\`)}\`;
                                const netColor = g.network === 'MTN' ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' : g.network === 'GLO' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-red-400 bg-red-400/10 border-red-400/30';
                                return (
                                    <div key={g.id || idx} className="bg-zinc-950 border border-zinc-800/90 p-4 rounded-lg flex flex-col justify-between space-y-3 hover:border-zinc-700 transition">
                                        <div className="space-y-1.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <h4 className="text-sm font-bold text-white uppercase truncate">{g.fullName}</h4>
                                                <span className={\`px-1.5 py-0.5 border text-[9px] font-bold uppercase rounded shrink-0 \${netColor}\`}>
                                                    {g.network}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-200">🏛️ {g.institution}</p>
                                            {g.courseAndLevel && <p className="text-[11px] text-zinc-400">📚 {g.courseAndLevel}</p>}
                                            <p className="text-xs text-zinc-400">📱 {g.phone}</p>
                                            <div className="p-2.5 bg-zinc-900 border border-zinc-800/80 rounded text-[11px] text-zinc-300 font-sans italic">
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
            )}
`;

// Insert the new topTabsAndSections right after `<div className="w-full space-y-12">`
const containerMarker = `<div className="w-full space-y-12">`;
content = content.replace(containerMarker, `${containerMarker}\n${topTabsAndSections}`);

// Wrap Partner Operations with `(activeTab === 'all' || activeTab === 'partners') && (`
content = content.replace(
    `{/* ── PARTNER LIST (MOBILE CARDS) ── */}\n            <div>`,
    `{/* ── PARTNER LIST (MOBILE CARDS) ── */}\n            {(activeTab === 'all' || activeTab === 'partners') && (\n            <div>`
);

// Close the Partner Operations block before Contacts Viewer Modal
content = content.replace(
    `            {/* ── CONTACTS VIEWER MODAL ── */}`,
    `            )}\n\n            {/* ── CONTACTS VIEWER MODAL ── */}`
);

// Wrap Payout Queue with `(activeTab === 'all' || activeTab === 'payouts') && (`
content = content.replace(
    `{/* ── WITHDRAWAL QUEUE (MOBILE CARDS) ── */}\n            <div>`,
    `{/* ── WITHDRAWAL QUEUE (MOBILE CARDS) ── */}\n            {(activeTab === 'all' || activeTab === 'payouts') && (\n            <div>`
);

// Close Payout Queue block
content = content.replace(
    `                        </motion.div>\n                    ))}\n                </div>\n            </div>`,
    `                        </motion.div>\n                    ))}\n                </div>\n            </div>\n            )}`
);

// Wrap Studio & Tools with `(activeTab === 'all' || activeTab === 'tools') && (`
content = content.replace(
    `{/* ── BRAND & ASSET GENERATION STUDIO ── */}`,
    `{(activeTab === 'all' || activeTab === 'tools') && (\n            <>\n            {/* ── BRAND & ASSET GENERATION STUDIO ── */}`
);

// Close Studio & Tools before the final closing
content = content.replace(
    `{/* ── WITHDRAWAL QUEUE (MOBILE CARDS) ── */}`,
    `</>\n            )}\n\n            {/* ── WITHDRAWAL QUEUE (MOBILE CARDS) ── */}`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully restructured ManagementViews.tsx with top priority tabs & sections!');

