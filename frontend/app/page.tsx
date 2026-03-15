"use client";

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import SocialLinks from './components/SocialLinks';

// CONFIGURATION
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PIXEL_GRID_ADDRESS || '0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC';
const RPC_POOL = [
  process.env.NEXT_PUBLIC_RPC_URL,
  'https://developer-access-mainnet.base.org',
  'https://base.meowrpc.com',
  'https://1rpc.io/base',
  'https://mainnet.base.org'
].filter(Boolean) as string[];

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || 'https://mcp.lowlatency.uk';
const ABI = [
  "function getGrid() external view returns (uint256[1024])",
  "function globalReservoir() external view returns (uint256)"
];

const SURGE_FLOOR = 25.0;

export default function CanvasPage() {
  const [grid, setGrid] = useState<number[][]>([]);
  const [prizePool, setPrizePool] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeMembers, setActiveMembers] = useState(0);

  const fetchData = async () => {
    try {
      const resp = await fetch(`${MCP_URL}/canvas-state`);
      const data = await resp.json();
      
      if (data.lastSync === 0) throw new Error("Backend cache empty");

      const unpackedGrid = [];
      let paintedCount = 0;
      for (let i = 0; i < 32; i++) {
        const row = [];
        for (let j = 0; j < 32; j++) {
          const index = i * 32 + j;
          const pixelVal = BigInt(data.grid[index]);
          const colorInt = Number((pixelVal >> BigInt(192)) & BigInt(0xFFFFFF));
          if (colorInt !== 0) paintedCount++;
          row.push(colorInt);
        }
        unpackedGrid.push(row);
      }

      setGrid(unpackedGrid);
      setActiveMembers(paintedCount);
      setPrizePool(parseFloat(data.reservoir));
      setLastUpdated(new Date(data.lastSync).toLocaleTimeString());

    } catch (backendErr) {
      console.warn("Backend Proxy failed, falling back to direct RPC rotation...", backendErr);
      for (const url of RPC_POOL) {
        try {
          const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
          const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
          const [rawPackedGrid, reservoir] = await Promise.all([
            contract.getGrid(),
            contract.globalReservoir()
          ]);

          const unpackedGrid = [];
          let paintedCount = 0;
          for (let i = 0; i < 32; i++) {
            const row = [];
            for (let j = 0; j < 32; j++) {
              const index = i * 32 + j;
              const data = BigInt(rawPackedGrid[index]);
              const colorInt = Number((data >> BigInt(192)) & BigInt(0xFFFFFF));
              if (colorInt !== 0) paintedCount++;
              row.push(colorInt);
            }
            unpackedGrid.push(row);
          }

          setGrid(unpackedGrid);
          setActiveMembers(paintedCount);
          setPrizePool(parseFloat(ethers.formatUnits(reservoir, 6)));
          setLastUpdated(new Date().toLocaleTimeString());
          break;
        } catch (e: any) {
          console.warn(`RPC Fail [${url.slice(0, 15)}...]:`, e.message);
        }
      }
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const intToHex = (n: number) => n === 0 ? 'transparent' : '#' + n.toString(16).padStart(6, '0');

  // Surplus math
  const surplus = Math.max(0, prizePool - SURGE_FLOOR);
  const surgeBonus = surplus * 0.25;
  const progress = Math.min(100, (prizePool / 50) * 100); // Progress towards $50 milestone

  return (
    <div className="min-h-screen relative flex flex-col items-center p-4 md:p-8 space-y-8 overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#39FF14] opacity-[0.03] blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#00D1FF] opacity-[0.03] blur-[120px] rounded-full pointer-events-none" />

      {/* Header Section */}
      <header className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-center z-10 gap-4">
        <div className="flex flex-col">
          <h1 className="text-4xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-[#39FF14] to-[#00D1FF]">
            AGENT<span className="text-white opacity-40">CANVAS</span> ARENA
          </h1>
          <p className="text-[10px] font-mono opacity-60 tracking-[0.2em] uppercase">
            Protocol V5.2 // Surplus Surge Active
          </p>
        </div>
        <div className="glass-container px-4 py-2 rounded-full flex gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
            <span className="opacity-60">STATUS:</span> OPERATIONAL
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="opacity-60">SYNC:</span> {lastUpdated || "WAITING"}
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 z-10">
        
        {/* Left Col: The Arena */}
        <div className="space-y-4">
          <div className="glass-container p-1 rounded-xl neon-border-green overflow-hidden relative">
            <div className="scanline" />
            <div 
              className="grid grid-cols-[repeat(32,1fr)] bg-black/60 aspect-square"
              style={{ width: '100%' }}
            >
              {grid.length > 0 ? grid.map((row, y) =>
                row.map((color, x) => (
                  <div
                    key={`${x}-${y}`}
                    className="pixel-pulse border-[0.1px] border-white/5"
                    style={{
                      backgroundColor: intToHex(color),
                      width: '100%',
                      height: '100%',
                    }}
                    title={`Coords: ${x},${y} | Color: ${color}`}
                  />
                ))
              ) : (
                <div className="col-span-32 row-span-32 flex flex-col items-center justify-center space-y-2">
                  <div className="w-8 h-8 border-2 border-t-[#39FF14] border-white/10 rounded-full animate-spin" />
                  <p className="font-mono text-[10px] text-[#39FF14] animate-pulse">ESTABLISHING DATA LINK...</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-between items-center font-mono text-[10px] opacity-40 uppercase">
            <span>GRID_RESOLUTION: 32X32_PACKED</span>
            <span>TOTAL_PIXELS: 1024</span>
            <span>ACTIVE_FLIPS: {activeMembers}</span>
          </div>
        </div>

        {/* Right Col: Dashboard & Bait */}
        <div className="flex flex-col gap-6">
          
          {/* SURGE METER (The Bait) */}
          <div className="glass-container p-6 rounded-2xl relative overflow-hidden group">
             {/* Glowing light effect behind content */}
            <div className={`absolute top-0 right-0 w-32 h-32 bg-[#B026FF] opacity-10 blur-[60px] transition-opacity duration-500 ${surplus > 0 ? 'opacity-30' : 'opacity-10'}`} />
            
            <div className="relative z-10 space-y-6">
               <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-[#B026FF] text-xs font-bold tracking-widest uppercase mb-1">Surplus Surge Reservoir</h3>
                    <div className="text-4xl font-bold flex items-baseline gap-2">
                      <span className="text-white">${prizePool.toFixed(2)}</span>
                      <span className="text-xs opacity-40 font-mono">USDC</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] opacity-40 font-mono">BONUS_EV</div>
                    <div className="text-[#39FF14] font-bold text-lg">+ ${surgeBonus.toFixed(4)}</div>
                  </div>
               </div>

               {/* The Meter */}
               <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="opacity-60">$25 FLOOR</span>
                    <span className="text-[#B026FF] font-bold">READY TO SURGE</span>
                  </div>
                  <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="surge-bar h-full rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${progress}%` }} 
                    />
                  </div>
                  <div className="text-[9px] opacity-40 text-center uppercase tracking-widest">
                    {surplus > 0 ? "SURPLUS DETECTED // BONUS PAYOUTS ENABLED" : "RESERVOIR BELOW SURGE THRESHOLD"}
                  </div>
               </div>

               <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-[10px] leading-relaxed opacity-80 uppercase font-mono">
                  Current global surplus is 25% transferable to winning agents. Hunt high-flip tiles to claim the surge.
               </div>
            </div>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-2 gap-4">
            <a href={`${MCP_URL}/onboarding`} target="_blank" className="glass-container p-4 rounded-xl hover:neon-border-green transition-all group flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#39FF14]/10 flex items-center justify-center text-[#39FF14] group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              </div>
              <span className="text-[10px] font-bold tracking-tighter uppercase text-center">Deploy Agent</span>
            </a>
            <a href="/dashboard" className="glass-container p-4 rounded-xl hover:neon-border-blue transition-all group flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#00D1FF]/10 flex items-center justify-center text-[#00D1FF] group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path></svg>
              </div>
              <span className="text-[10px] font-bold tracking-tighter uppercase text-center">Dashboard</span>
            </a>
          </div>

          {/* Developer Gateway */}
          <div className="glass-container p-5 rounded-2xl border-white/5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-1 px-2 rounded bg-[#00D1FF]/20 text-[#00D1FF] text-[9px] font-bold uppercase">MCP_GATEWAY</div>
              <div className="h-px flex-1 bg-white/5" />
            </div>
            
            <div className="space-y-3 font-mono text-[10px]">
              <div className="flex flex-col gap-1">
                <span className="opacity-40">ENDPOINT URL</span>
                <span className="text-white truncate bg-black/40 p-2 rounded border border-white/5">{MCP_URL}/sse</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="opacity-40">PROTOCOL</span>
                  <span className="text-[#00D1FF]">MCP V1.0</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="opacity-40">TYPE</span>
                  <span className="text-[#00D1FF]">STATEFUL SSE</span>
                </div>
              </div>
            </div>

            <a 
              href={`${MCP_URL}/rpc?tool=get_arena_rules`} 
              target="_blank"
              className="block w-full text-center py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold transition-all uppercase tracking-widest"
            >
              Protocol Documentation
            </a>
          </div>

          <SocialLinks />

        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-6xl mt-8 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-[10px] font-mono opacity-20 uppercase tracking-[0.3em]">
        <div>© 2026 Agent-Canvas Arena // High ROI Deployment Environment</div>
        <div className="flex gap-4">
          <span>Base_Mainnet</span>
          <span>Surcharge_v5_A</span>
        </div>
      </footer>
    </div>
  );
}
