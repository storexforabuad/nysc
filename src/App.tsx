import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Zap, BarChart3, Users, MessageSquare, Terminal } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-display flex flex-col selection:bg-accent selection:text-black">
      {/* Header Navigation */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-zinc-800 bg-[#09090B]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-accent flex items-center justify-center font-bold text-black text-xl">CL</div>
          <div>
            <h2 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Clarion A.I. Orchestration Layer</h2>
            <h1 className="text-lg font-display font-bold uppercase tracking-tight">Clarion Digital Hub <span className="text-accent italic">v2.5</span></h1>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8 text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
          <a href="#" className="hover:text-accent transition-colors">Documentation</a>
          <a href="#" className="hover:text-accent transition-colors">Pricing_API</a>
          <div className="flex items-center gap-2 text-accent">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            <span>SYSTEM_ONLINE</span>
          </div>
        </div>
        <button className="px-6 py-2 border border-zinc-700 font-mono text-xs hover:bg-white hover:text-black transition-all cursor-pointer font-bold">
          INIT_DASHBOARD
        </button>
      </header>

      {/* Main Command Center */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden scanline">
        {/* Sidebar: Status & Metadata */}
        <aside className="w-full md:w-80 border-r border-zinc-800 p-8 flex flex-col gap-12 bg-[#09090B]/50">
          <div>
            <h3 className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-6 font-bold">Active Enterprise Nodes</h3>
            <div className="space-y-4">
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

          <div className="mt-auto">
            <div className="text-5xl font-display font-bold leading-none mb-2 tracking-tighter italic text-accent text-right">84</div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-right font-bold">Total Active Instances</div>
          </div>
        </aside>

        {/* Central Content */}
        <section className="flex-1 p-8 md:p-16 flex flex-col justify-center overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-12"
          >
            <h4 className="text-[10px] font-mono text-accent mb-4 uppercase tracking-[0.3em] font-bold underline decoration-accent/30 underline-offset-4 font-bold">
              [Clarion SAED Ecosystem]
            </h4>
            <h2 className="text-6xl md:text-8xl font-display font-bold leading-[0.85] tracking-tighter max-w-2xl uppercase">
              Automated <br />
              <span className="text-accent italic">Vending</span> Hub.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div className="space-y-6">
              <p className="text-zinc-400 font-mono text-sm leading-relaxed max-w-md italic">
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

              <div className="pt-8">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="inline-flex items-center gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-none cursor-pointer group hover:border-accent transition-all"
                >
                  <div className="w-12 h-12 bg-accent flex items-center justify-center text-black">
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-mono font-bold tracking-widest">Connect Clarion Hub</p>
                    <p className="font-mono text-sm text-accent font-bold tracking-tighter italic">MSG ".start" TO ACTIVATE</p>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Feature Modules (Small Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-800 border border-zinc-800 shadow-2xl shadow-accent/5">
              {[
                { icon: <ShieldCheck size={20} />, title: "SECURE", val: "AES-256" },
                { icon: <Zap size={20} />, title: "SPEED", val: "250ms" },
                { icon: <BarChart3 size={20} />, title: "YIELD", val: "50/50" },
                { icon: <Terminal size={20} />, title: "ENV", val: "NODE.JS" }
              ].map((f, i) => (
                <div key={i} className="bg-[#09090B] p-6 group hover:bg-zinc-900 transition-colors">
                  <div className="text-accent mb-4 group-hover:scale-110 transition-transform">{f.icon}</div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase mb-1 tracking-widest font-bold">{f.title}</div>
                  <div className="text-lg font-display font-bold uppercase tracking-tight">{f.val}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Terminal Footer */}
      <footer className="bg-zinc-900 px-8 py-4 flex flex-col md:flex-row items-center justify-between text-[10px] font-mono text-zinc-500 gap-4 border-t border-zinc-800">
        <div className="flex flex-wrap justify-center gap-8 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-2"><span className="w-1 h-1 bg-accent rounded-full"></span> NODE: prod-ams-01</span>
          <span className="flex items-center gap-2"><span className="w-1 h-1 bg-accent rounded-full"></span> SESSION: baileys_v5</span>
          <span className="flex items-center gap-2"><span className="w-1 h-1 bg-accent rounded-full"></span> STORAGE: firestore_cloud</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-accent animate-pulse font-bold tracking-widest">// SYSTEM_SECURE_READY //</span>
          <div className="flex items-center gap-2 font-bold uppercase tracking-widest">
            <Users size={12} />
            <span>15K+ ENTERPRISES</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
