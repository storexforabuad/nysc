import React, { useState } from 'react';
import { ShieldCheck, Terminal, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!passcode.trim()) {
            setError('AUTH_REQUIRED: Passcode cannot be empty.');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passcode: passcode.trim() }),
            });

            const data = await res.json();

            if (res.ok && data.token) {
                localStorage.setItem('clarion_admin_token', data.token);
                navigate('/admin/dashboard');
            } else {
                setError(data.error || 'AUTH_REJECTED: Invalid MotherBot clearance.');
            }
        } catch (err) {
            setError('SYS_ERR: Unable to connect to authentication server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#09090B] text-zinc-100 font-display flex flex-col items-center justify-center p-4 selection:bg-accent selection:text-black scanline">

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 p-8 shadow-2xl"
            >
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-accent flex items-center justify-center font-bold text-black text-2xl mb-4">
                        <ShieldCheck size={32} />
                    </div>
                    <h2 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase font-bold text-center">Protected Sector</h2>
                    <h1 className="text-2xl font-display font-bold uppercase tracking-tight text-center">Clarion Admin</h1>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                            <Terminal size={12} />
                            MotherBot Passcode
                        </label>
                        <input
                            type="text"
                            value={passcode}
                            onChange={(e) => setPasscode(e.target.value)}
                            className="w-full bg-[#09090B] border border-zinc-800 p-4 font-mono text-sm text-accent focus:outline-none focus:border-accent transition-colors"
                            placeholder="Enter phone number..."
                            autoComplete="off"
                        />
                    </div>

                    {error && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-3"
                        >
                            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-mono text-red-400 leading-tight uppercase font-bold">{error}</p>
                        </motion.div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-4 border border-zinc-700 font-mono text-xs uppercase font-bold tracking-widest transition-all ${loading ? 'opacity-50 cursor-wait' : 'hover:bg-white hover:text-black hover:border-white'
                            }`}
                    >
                        {loading ? 'AUTHENTICATING...' : 'INIT_SESSION'}
                    </button>
                </form>
            </motion.div>

            <div className="mt-8 text-center flex flex-col items-center gap-2">
                <span className="flex items-center gap-2 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                    Restricted Access
                </span>
            </div>
        </div>
    );
}
