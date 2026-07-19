import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, Zap, BarChart3, Users, MessageSquare, Terminal } from 'lucide-react';
import AdminLogin from './components/AdminLogin';
import MetricsDisplay from './components/admin/MetricsDisplay';
import ManagementViews from './components/admin/ManagementViews';

function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-display flex flex-col selection:bg-accent selection:text-black">
      {/* Header Navigation */}
      <header className="flex flex-col md:flex-row items-center justify-between px-4 md:px-8 py-4 md:py-6 border-b border-zinc-800 bg-[#09090B] gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 bg-accent flex items-center justify-center font-bold text-black text-xl shrink-0">CL</div>
          <div>
            <h2 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Clarion A.I. Orchestration Layer</h2>
            <h1 className="text-base md:text-lg font-display font-bold uppercase tracking-tight">Clarion Digital Hub <span className="text-accent italic">v2.5</span></h1>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-8 text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
          <span className="hover:text-accent transition-colors cursor-pointer">Documentation</span>
          <span className="hover:text-accent transition-colors cursor-pointer">Pricing_API</span>
          <div className="flex items-center gap-2 text-accent">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            <span>SYSTEM_ONLINE</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/admin')}
          className="w-full md:w-auto px-6 py-3 md:py-2 border border-zinc-700 font-mono text-xs hover:bg-white hover:text-black transition-all cursor-pointer font-bold"
        >
          INIT_DASHBOARD
        </button>
      </header>

      {/* Main Command Center */}
      <main className="flex-1 flex flex-col xl:flex-row overflow-hidden scanline">
        {/* Sidebar: Status & Metadata */}
        <aside className="w-full xl:w-80 border-b xl:border-r border-zinc-800 p-6 md:p-8 flex flex-col gap-6 md:gap-12 bg-[#09090B]/50 order-2 xl:order-1">
          <div>
            <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-4 md:mb-6 font-bold">Active Enterprise Nodes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              {[
                { id: 'PROX_LAG_012', state: 'Lagos (CDS-04)', active: true },
                { id: 'PROX_ABJ_005', state: 'Abuja (FCT-B)', active: false },
                { id: 'PROX_KAD_009', state: 'Kaduna (CDS-01)', active: false }
              ].map((node) => (
                <div key={node.id} className={`p-4 border-l-2 ${node.active ? 'bg-zinc-100/10 border-accent' : 'bg-zinc-900/30 border-zinc-700 opacity-60'} transition-all`}>
                  <div className="text-xs font-bold font-mono">{node.id}</div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase">{node.state}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 xl:mt-auto">
            <div className="text-4xl md:text-5xl font-display font-bold leading-none mb-2 tracking-tighter italic text-accent xl:text-right">84</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest xl:text-right font-bold">Total Active Instances</div>
          </div>
        </aside>

        {/* Central Content */}
        <section className="flex-1 p-6 md:p-12 xl:p-16 flex flex-col justify-center overflow-y-auto order-1 xl:order-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 md:mb-12"
          >
            <h4 className="text-[10px] font-mono text-accent mb-4 uppercase tracking-[0.3em] font-bold underline decoration-accent/30 underline-offset-4">
              [Clarion SAED Ecosystem]
            </h4>
            <h2 className="text-4xl sm:text-6xl lg:text-8xl font-display font-bold leading-[0.9] tracking-tighter w-full uppercase break-words">
              Automated <br />
              <span className="text-accent italic">Vending</span> Hub
            </h2>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            <div className="space-y-6">
              <p className="text-zinc-400 font-mono text-xs md:text-sm leading-relaxed max-w-md italic">
                Digitizing entrepreneurship through Clarion A.I. Digital Hubs.
                Built for co-members, inspired by NYSC SAED.
              </p>

              <div className="space-y-3">
                <div className="flex justify-between items-end border-b border-zinc-800 pb-2 text-[10px] font-mono font-bold uppercase">
                  <span className="text-zinc-500">Clarion Protocol</span>
                  <span className="text-accent tracking-widest">READY</span>
                </div>
                <div className="flex justify-between items-end border-b border-zinc-800 pb-2 text-[10px] font-mono font-bold uppercase">
                  <span className="text-zinc-500">Monnify Settlement</span>
                  <span className="text-accent tracking-widest">VERIFIED</span>
                </div>
                <div className="flex justify-between items-end border-b border-zinc-800 pb-2 text-[10px] font-mono font-bold uppercase">
                  <span className="text-zinc-500">SAED Philanthropy</span>
                  <span className="text-accent tracking-widest">20% ALLOC.</span>
                </div>
              </div>

              <div className="pt-4 md:pt-8 w-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="w-full flex items-center gap-4 bg-zinc-900 border border-zinc-800 p-4 md:p-5 rounded-none cursor-pointer group hover:border-accent transition-all"
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 bg-accent flex items-center justify-center text-black">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <p className="text-[9px] md:text-[10px] text-zinc-500 uppercase font-mono font-bold tracking-widest">Connect Clarion Hub</p>
                    <p className="font-mono text-xs md:text-sm text-accent font-bold tracking-tighter italic">MSG ".start" TO ACTIVATE</p>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Feature Modules (Small Cards) */}
            <div className="grid grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 shadow-2xl shadow-accent/5">
              {[
                { icon: <ShieldCheck size={18} />, title: "SECURE", val: "AES-256" },
                { icon: <Zap size={18} />, title: "SPEED", val: "250ms" },
                { icon: <BarChart3 size={18} />, title: "YIELD", val: "50/50" },
                { icon: <Terminal size={18} />, title: "ENV", val: "NODE.JS" }
              ].map((f, i) => (
                <div key={i} className="bg-[#09090B] p-4 md:p-6 group hover:bg-zinc-900 transition-colors">
                  <div className="text-accent mb-2 md:mb-4 group-hover:scale-110 transition-transform origin-left">{f.icon}</div>
                  <div className="text-[9px] md:text-[10px] font-mono text-zinc-500 uppercase mb-1 tracking-widest font-bold">{f.title}</div>
                  <div className="text-base md:text-lg font-display font-bold uppercase tracking-tight">{f.val}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Terminal Footer */}
      <footer className="bg-zinc-900 px-4 md:px-8 py-4 flex flex-col lg:flex-row items-center justify-between text-[10px] font-mono text-zinc-500 gap-4 border-t border-zinc-800">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5 md:gap-2"><span className="w-1 h-1 bg-accent rounded-full"></span> NODE: prod-ams-01</span>
          <span className="flex items-center gap-1.5 md:gap-2"><span className="w-1 h-1 bg-accent rounded-full"></span> SESSION: baileys_v5</span>
          <span className="flex items-center gap-1.5 md:gap-2"><span className="w-1 h-1 bg-accent rounded-full"></span> STORAGE: firestore_cloud</span>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6">
          <span className="text-accent animate-pulse font-bold tracking-widest">// SYSTEM_SECURE_READY //</span>
          <div className="flex items-center gap-2 font-bold uppercase tracking-widest text-[#000] bg-accent px-2 py-0.5">
            <Users size={12} />
            <span>15K+ ENTERPRISES</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Dummy placeholder for Phase 2/3 Dashboard
function AdminDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem('clarion_admin_token');

  if (!token) {
    navigate('/admin');
    return null;
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col font-display selection:bg-accent selection:text-black scanline">
      {/* Top Bar Navigation */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-zinc-800 bg-[#09090B] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-accent flex items-center justify-center font-bold text-black text-lg md:text-xl shrink-0">CA</div>
          <div>
            <h1 className="text-sm md:text-lg font-display font-bold uppercase tracking-tight leading-none">Clarion Admin</h1>
            <h2 className="text-[8px] md:text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Command Center</h2>
          </div>
        </div>
        <button
          onClick={() => { localStorage.removeItem('clarion_admin_token'); navigate('/admin'); }}
          className="px-4 py-2 bg-zinc-900 border border-zinc-700 font-mono text-[10px] uppercase font-bold hover:bg-white hover:text-black transition-all"
        >
          LOGOUT
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto space-y-8">
        <MetricsDisplay />

        {/* Phase 3: Partner & Payout Management */}
        <div className="w-full mt-12 pt-8 border-t border-zinc-800">
          <ManagementViews />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

