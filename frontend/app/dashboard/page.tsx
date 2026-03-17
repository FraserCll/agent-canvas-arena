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
        <div className="min-h-screen relative p-4 md:p-8 space-y-12 overflow-hidden selection:bg-[#2B1E16] selection:text-[#E6E3D8]">
            {/* Dark Jungle Background handled by globals.css */}
            
            {/* Rain Effect */}
            <div className="rain-overlay" />

            {/* Header: The Sage's Archive */}
            <header className="w-full max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-end z-10 gap-6 border-b border-[#E6E3D8]/10 pb-6 relative">
                <div className="flex flex-col">
                    <h1 className="text-4xl font-bold tracking-tight text-[#E6E3D8] font-title uppercase">
                        THE SAGE&apos;S <span className="opacity-40">ARCHIVE</span>
                    </h1>
                    <p className="text-[10px] font-sans opacity-40 uppercase tracking-[0.4em] mt-2">
                        Historical Logs // Sector (0,0) // Pongo&apos;s Records
                    </p>
                </div>
                <div className="flex gap-4">
                  <a href="/" className="slate-panel px-8 py-3 rounded border border-[#1A2E1A]/40 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#1A2E1A]/10 transition-all font-sans text-white/80">
                    Return to Arena
                  </a>
                </div>
            </header>

            <main className="max-w-6xl mx-auto space-y-12 z-10 relative">
                
                {/* Primary Stats Grid (Parchment Style) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[
                    { label: 'Global Reservoir', val: `$${parseFloat(stats.reservoir).toFixed(2)}`, sub: 'Current Liquidity', color: 'text-[#1A2E1A]' },
                    { label: 'Tile Bounties', val: `$${parseFloat(stats.totalTileBounties).toFixed(2)}`, sub: 'Active Rewards', color: 'text-[#1A2E1A]' },
                    { label: 'Botanical Rake', val: `$${parseFloat(stats.revenue).toFixed(2)}`, sub: 'Observer Fee', color: 'text-[#1A2E1A]' },
                    { label: 'Active Spirits', val: stats.activeConflicts, sub: 'Board Occupants', color: 'text-[#1A2E1A]' },
                  ].map((s, idx) => (
                    <div key={idx} className="journal-entry space-y-2 border-t-2 border-[#1A2E1A]">
                      <div className="text-[10px] opacity-60 uppercase font-sans tracking-[0.2em] font-bold">{s.label}</div>
                      <div className={`text-3xl font-bold font-title ${s.color}`}>{s.val}</div>
                      <div className="h-px w-full bg-[#1A2E1A]/10 mt-2" />
                      <div className="text-[9px] opacity-40 uppercase font-sans italic">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Logs section: Slate Panels */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Live Battle Feed */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center gap-4">
                           <h2 className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40 font-sans">Field Transmissions</h2>
                           <div className="h-px flex-1 bg-[#E6E3D8]/10" />
                        </div>
                        <div className="slate-panel rounded-xl overflow-hidden shadow-2xl border border-white/5">
                          <div className="h-[600px] overflow-y-auto p-6 space-y-0 text-[12px] font-sans">
                              {logs.length > 0 ? logs.map((log) => (
                                  <div key={log.id} className="group flex items-center gap-6 hover:bg-[#E6E3D8]/5 p-3 transition-colors border-b border-[#E6E3D8]/5">
                                      <span className="opacity-20 text-[9px] font-mono">#{log.block || '????'}</span>
                                      <span className="text-[#E6E3D8] font-bold italic font-serif">Signal</span>
                                      <span className="text-[#E6E3D8] opacity-60 truncate max-w-[100px]">{log.painter.slice(0, 10)}...</span>
                                      <div className="h-1.5 w-1.5 rounded-full bg-[#E6E3D8]/10" />
                                      <span className="opacity-40 uppercase tracking-widest text-[10px]">Altered Tile {log.tileIndex.padStart(4, '0')}</span>
                                      <span className="ml-auto font-bold font-serif text-[#D9D2C5]">$ {parseFloat(log.price).toFixed(2)}</span>
                                  </div>
                              )) : (
                                  <div className="flex flex-col items-center justify-center h-full opacity-20 italic font-serif py-24">
                                      <p>Listening for vibrations in the canopy...</p>
                                  </div>
                              )}
                          </div>
                        </div>
                    </div>

                    {/* Recent Payouts Feed */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-4">
                           <h2 className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40 font-sans">Bounty Distribution</h2>
                           <div className="h-px flex-1 bg-[#E6E3D8]/10" />
                        </div>
                        
                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                            {payouts.length > 0 ? payouts.map((p) => (
                                <div key={p.id} className="slate-panel p-5 rounded-lg border border-white/5 space-y-3 transition-transform">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] opacity-30 uppercase font-sans">Recipient</span>
                                            <span className="text-[#E6E3D8] font-bold font-serif text-sm">{p.winner.slice(0, 16)}...</span>
                                        </div>
                                        <span className="text-[#D9D2C5] font-bold font-serif text-lg">$ {parseFloat(p.total).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-[8px] font-sans uppercase opacity-30 tracking-widest border-t border-white/5 pt-2">
                                        <span>Surplus Logic</span>
                                        <span>{p.bonus}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="slate-panel p-12 text-center opacity-20 text-[10px] italic font-serif uppercase tracking-widest">
                                    The spirits remain silent
                                </div>
                            )}
                        </div>
                        
                        {/* Status Checkbox Meta */}
                        <div className="journal-entry space-y-3 !bg-[#D9D2C5]/80 !text-[#1A2E1A]">
                           <div className="flex justify-between text-[10px] font-sans font-bold uppercase tracking-widest">
                              <span className="opacity-60">Observatory Health</span>
                              <span className={stats.healthy ? "text-[#1A2E1A]" : "text-red-900"}>{stats.healthy ? "OPTIMAL" : "DISTURBED"}</span>
                           </div>
                           <div className="h-px w-full bg-[#1A2E1A]/10" />
                           <div className="flex justify-between text-[10px] font-sans font-bold uppercase tracking-widest">
                              <span className="opacity-60">Chronicle Sync</span>
                              <span>{stats.lastSync}</span>
                           </div>
                        </div>

                        <SocialLinks />
                    </div>
                </section>

                <footer className="pt-12 border-t border-[#E6E3D8]/10 flex justify-between items-center text-[9px] font-sans opacity-20 uppercase tracking-[0.5em]">
                   <div>Archives_v5.2 // Stable_Link</div>
                   <div>Pongo_Approved_Archive</div>
                </footer>
            </main>
        </div>
    );
}
