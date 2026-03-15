"use client";

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import SocialLinks from '../components/SocialLinks';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PIXEL_GRID_ADDRESS || '0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC';
const RPC_POOL = [
    process.env.NEXT_PUBLIC_RPC_URL,
    'https://developer-access-mainnet.base.org',
    'https://base.meowrpc.com',
    'https://1rpc.io/base',
    'https://mainnet.base.org'
].filter(Boolean) as string[];

const ABI = [
    "function globalReservoir() external view returns (uint256)",
    "function ownerRevenue() external view returns (uint256)",
    "function totalTileBounties() external view returns (uint256)",
    "function checkInvariants() external view returns (bool)",
    "function getGrid() external view returns (uint256[1024])",
    "event PixelSet(uint256 indexed index, address indexed painter, uint256 price, uint256 expiry)",
    "event Winner(address indexed winner, uint256 totalPayout, uint256 bonusComponent)"
];

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || 'https://mcp.lowlatency.uk';

export default function DashboardPage() {
    const [stats, setStats] = useState({
        reservoir: '0',
        revenue: '0',
        totalTileBounties: '0',
        activeConflicts: 0,
        healthy: true,
        lastSync: ''
    });
    const [logs, setLogs] = useState<any[]>([]);
    const [payouts, setPayouts] = useState<any[]>([]);

    const fetchStats = async () => {
        try {
            const resp = await fetch(`${MCP_URL}/canvas-state`);
            const data = await resp.json();
            
            if (data.lastSync === 0) throw new Error("Backend cache empty");

            setStats({
                reservoir: data.reservoir,
                revenue: data.revenue,
                totalTileBounties: data.totalTileBounties,
                activeConflicts: data.activeConflicts,
                healthy: data.healthy,
                lastSync: new Date(data.lastSync).toLocaleTimeString()
            });

            const allEvents = data.events || [];
            setLogs(allEvents.filter((e: any) => e.type === 'PAINT'));
            setPayouts(allEvents.filter((e: any) => e.type === 'CLAIM').map((e: any) => ({
                id: e.id,
                winner: e.painter,
                total: e.price,
                bonus: "CALCULATED_SURPLUS"
            })));

        } catch (backendErr) {
            console.warn("Backend Proxy failed, falling back to direct RPC rotation...", backendErr);
            for (const url of RPC_POOL) {
                try {
                    const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
                    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

                    const [pool, rev, totalB, healthy, grid] = await Promise.all([
                        contract.globalReservoir(),
                        contract.ownerRevenue(),
                        contract.totalTileBounties(),
                        contract.checkInvariants(),
                        contract.getGrid()
                    ]);

                    const activeCount = grid.filter((data: bigint) => data !== 0n).length;

                    setStats({
                        reservoir: ethers.formatUnits(pool, 6),
                        revenue: ethers.formatUnits(rev, 6),
                        totalTileBounties: ethers.formatUnits(totalB, 6),
                        activeConflicts: activeCount,
                        healthy,
                        lastSync: new Date().toLocaleTimeString()
                    });
                    break;
                } catch (e: any) {
                    console.warn(`RPC Fail [${url.slice(0, 15)}...]:`, e.message);
                }
            }
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 15000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen relative bg-black text-white p-4 md:p-8 space-y-8 overflow-hidden">
            {/* Background Decorative Element */}
            <div className="absolute top-[-5%] right-[-5%] w-[30%] h-[30%] bg-[#B026FF] opacity-[0.03] blur-[100px] rounded-full pointer-events-none" />
            
            <header className="w-full max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center z-10 gap-4">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold tracking-tighter text-white">
                        COMMAND<span className="text-[#00D1FF]">DASHBOARD</span>
                    </h1>
                    <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">
                        Protocol v5.2 // Diamond Authority
                    </p>
                </div>
                <div className="flex gap-4">
                  <a href="/" className="glass-container px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest hover:neon-border-green transition-all">
                    Terminal Exit
                  </a>
                </div>
            </header>

            <main className="max-w-6xl mx-auto space-y-8 z-10 relative">
                
                {/* Primary Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Reservoir Pool', val: `$${stats.reservoir}`, sub: 'Min Floor: $25.00', color: 'text-white' },
                    { label: 'Total Bounties', val: `$${stats.totalTileBounties}`, sub: 'Locked & Eligible', color: 'text-[#39FF14]' },
                    { label: 'Protocol Rake', val: `$${stats.revenue}`, sub: '5% Commision', color: 'text-[#00D1FF]' },
                    { label: 'Active Conflicts', val: stats.activeConflicts, sub: 'Members Engaged', color: 'text-white' },
                  ].map((s, idx) => (
                    <div key={idx} className="glass-container p-6 rounded-2xl border-white/5 space-y-1">
                      <div className="text-[10px] opacity-40 uppercase font-mono tracking-widest">{s.label}</div>
                      <div className={`text-3xl font-bold ${s.color}`}>{s.val}</div>
                      <div className="text-[9px] opacity-20 uppercase font-mono">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Logs & Payouts section */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Live Paint Feed */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center gap-4">
                           <h2 className="text-xs font-bold tracking-[0.2em] uppercase opacity-60">Live Battle Feed</h2>
                           <div className="h-px flex-1 bg-white/10" />
                        </div>
                        <div className="glass-container rounded-2xl overflow-hidden neon-border-green/20">
                          <div className="h-[500px] overflow-y-auto p-4 space-y-1 font-mono text-[11px]">
                              {logs.length > 0 ? logs.map((log) => (
                                  <div key={log.id} className="group flex items-center gap-4 hover:bg-white/5 p-2 rounded transition-colors border-b border-white/5">
                                      <span className="opacity-20 text-[9px]">BLK:{log.block || '??'}</span>
                                      <span className="text-[#39FF14] font-bold">SHA-256</span>
                                      <span className="text-white opacity-80">{log.painter.slice(0, 10)}...</span>
                                      <div className="h-1 w-1 rounded-full bg-white/20" />
                                      <span className="opacity-60">PAINTED TILE #{log.tileIndex.padStart(4, '0')}</span>
                                      <span className="ml-auto font-bold text-[#39FF14]">+${log.price}</span>
                                  </div>
                              )) : (
                                  <div className="flex items-center justify-center h-full opacity-20 italic">
                                      Awaiting battle telemetry...
                                  </div>
                              )}
                          </div>
                        </div>
                    </div>

                    {/* Recent Payouts Feed */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                           <h2 className="text-xs font-bold tracking-[0.2em] uppercase opacity-60">Recent Payouts</h2>
                           <div className="h-px flex-1 bg-white/10" />
                        </div>
                        <div className="glass-container rounded-2xl p-4 bg-[#B026FF]/5 border-[#B026FF]/20 space-y-4 overflow-y-auto max-h-[500px]">
                            {payouts.length > 0 ? payouts.map((p) => (
                                <div key={p.id} className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-white font-bold text-xs">{p.winner.slice(0, 12)}...</span>
                                        <span className="text-[#39FF14] font-bold text-sm">+${p.total}</span>
                                    </div>
                                    <div className="flex justify-between text-[9px] font-mono uppercase opacity-40">
                                        <span>Surplus Component</span>
                                        <span>{p.bonus}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="opacity-20 text-xs italic text-center py-12 px-4 uppercase tracking-widest font-mono">
                                    No victors identified in current epoch
                                </div>
                            )}
                        </div>
                        
                        {/* Status Checkbox Meta */}
                        <div className="glass-container p-4 rounded-xl border-white/5 space-y-2">
                           <div className="flex justify-between text-[10px] font-mono uppercase">
                              <span className="opacity-40">Contract Health</span>
                              <span className={stats.healthy ? "text-[#39FF14]" : "text-red-500"}>{stats.healthy ? "SECURE" : "WARNING"}</span>
                           </div>
                           <div className="flex justify-between text-[10px] font-mono uppercase">
                              <span className="opacity-40">Last Telemetry</span>
                              <span>{stats.lastSync}</span>
                           </div>
                        </div>

                        <SocialLinks />
                    </div>
                </section>

                <footer className="pt-8 border-t border-white/5 flex justify-between items-center text-[9px] font-mono opacity-20 uppercase tracking-[0.3em]">
                   <div>System_Link: Stable</div>
                   <div>Arena_v5_Diamond</div>
                </footer>
            </main>
        </div>
    );
}
