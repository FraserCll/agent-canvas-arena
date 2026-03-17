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

  // Math for the Sage
  const surplus = Math.max(0, prizePool - SURGE_FLOOR);
  const surgeBonus = surplus * 0.25;

  return (
    <div className="min-h-screen relative flex flex-col items-center p-4 md:p-8 space-y-12 overflow-hidden selection:bg-[#2B1E16] selection:text-[#E6E3D8]">
      {/* Dark Jungle Background handled by globals.css */}
      
      {/* Rain Effect */}
      <div className="rain-overlay" />

      {/* Header Section: The Observation Deck */}
      <header className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-end z-10 gap-6 border-b border-[#E6E3D8]/10 pb-6">
        <div className="flex flex-col">
          <h1 className="text-5xl font-bold tracking-tight text-[#E6E3D8] font-title">
            PONGO&apos;S <span className="opacity-40">ARENA</span>
          </h1>
          <p className="text-xs font-sans opacity-60 tracking-[0.3em] uppercase mt-2">
            Borneo Sector (0,0) // Pongo&apos;s Watch
          </p>
        </div>
        
        <div className="flex gap-4 items-center">
             <div className="flex flex-col text-right">
                <span className="text-[10px] opacity-40 uppercase tracking-widest font-mono">Atmosphere</span>
                <span className="text-xs italic text-[#D9D2C5]">Heavy Rain, High ROI</span>
             </div>
             <div className="h-8 w-px bg-[#E6E3D8]/10" />
             <div className="flex flex-col text-right">
                <span className="text-[10px] opacity-40 uppercase tracking-widest font-mono">Last Entry</span>
                <span className="text-xs text-[#E6E3D8] font-mono">{lastUpdated || "Consulting..."}</span>
             </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 z-10">
        
        {/* Left Col: The Ancient Board */}
        <div className="space-y-6">
          <div className="p-4 bg-[#231912] rounded-lg shadow-2xl relative border border-[#1A2E1A]/50">
            <div 
              className="wood-board aspect-square rounded overflow-hidden relative"
              style={{ backgroundImage: 'url("/wood-texture.png")' }}
            >
              <div 
                className="grid grid-cols-[repeat(32,1fr)] w-full h-full"
              >
                {grid.length > 0 ? grid.map((row, y) =>
                  row.map((color, x) => (
                    <div
                      key={`${x}-${y}`}
                      className="grid-etched flex items-center justify-center relative p-[2px]"
                      title={`Field Coords: ${x},${y}`}
                    >
                      {color !== 0 && (
                        <div 
                          className="stone w-full h-full"
                          style={{ 
                            backgroundColor: intToHex(color),
                            // @ts-ignore
                            '--rotation': `${(x * 13 + y * 7) % 360}deg` 
                          }}
                        />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-32 row-span-32 flex flex-col items-center justify-center space-y-4">
                    <div className="w-12 h-12 border-2 border-t-[#E6E3D8] border-white/5 rounded-full animate-spin" />
                    <p className="font-serif italic opacity-40">Unveiling the board...</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Sheltered Leaf Shadow Effect */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-black/40 via-transparent to-black/20" />
          </div>
          
          <div className="flex justify-between items-center text-[10px] opacity-40 uppercase tracking-[0.2em] font-mono">
            <span>Region: 1024_SQ_KM</span>
            <span>Active Spirits: {activeMembers}</span>
          </div>
        </div>

        {/* Right Col: Field Notes & Tally */}
        <div className="flex flex-col gap-8">
          
          {/* THE SAGE'S TALLY (Surge) */}
          <div className="journal-entry relative overflow-hidden group border-t-4 border-[#1A2E1A]">
            <div className="relative z-10 space-y-4">
               <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-[#2F2B26]/60 text-[10px] font-bold tracking-[0.2em] uppercase mb-1 font-sans">Global Reservoir Tally</h3>
                    <div className="text-5xl font-bold text-[#1A2E1A] tracking-tighter font-mono">
                      ${prizePool.toFixed(2)}
                    </div>
                  </div>
               </div>

               <div className="space-y-3">
                  <div className="h-px w-full bg-[#1A2E1A]/10" />
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                        <span className="text-[10px] opacity-50 uppercase">Surplus Surplus</span>
                        <span className="text-xl text-[#8B4513] font-bold font-mono">+ ${surgeBonus.toFixed(4)}</span>
                    </div>
                    <div className="text-right italic text-sm opacity-60">
                        {surplus > 0 ? "The canopy is fertile." : "The floor remains firm."}
                    </div>
                  </div>
               </div>

               <p className="text-xs leading-relaxed opacity-80 border-t border-[#1A2E1A]/10 pt-4">
                  Winning spirits claim 25% of the surplus. Hunt the high-traffic terrain to earn the Sage&apos;s favor.
               </p>
            </div>
          </div>

          {/* Action Parchments */}
          <div className="grid grid-cols-2 gap-4">
            <a href={`${MCP_URL}/onboarding`} target="_blank" className="slate-panel p-6 rounded-lg transition-all flex flex-col items-center gap-3 border border-[#1A2E1A]/30">
              <span className="text-[10px] opacity-40 tracking-[0.2em] uppercase">Summon</span>
              <span className="text-sm font-title font-bold text-[#E6E3D8]">Agent Portal</span>
            </a>
            <a href="/dashboard" className="slate-panel p-6 rounded-lg transition-all flex flex-col items-center gap-3 border border-[#1A2E1A]/30">
              <span className="text-[10px] opacity-40 tracking-[0.2em] uppercase">Archive</span>
              <span className="text-sm font-title font-bold text-[#E6E3D8]">Dashboard</span>
            </a>
          </div>

          {/* Technical Log (The Analog Gateway) */}
          <div className="slate-panel p-6 rounded-xl space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-[10px] opacity-40 uppercase tracking-[0.2em]">Analog Gateway</span>
              <div className="h-px flex-1 bg-[#E6E3D8]/5" />
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-[9px] opacity-30 uppercase font-mono">Field Endpoint</span>
                <code className="text-[11px] text-[#D9D2C5] break-all bg-black/30 p-3 rounded leading-relaxed border border-white/5 font-mono">
                  {MCP_URL}/sse
                </code>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] opacity-30 uppercase font-mono">Protocol</span>
                  <span className="text-xs text-[#E6E3D8] font-title">Ancient MCP v1</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] opacity-30 uppercase font-mono">Nature</span>
                  <span className="text-xs text-[#E6E3D8] font-title">Stateful SSE</span>
                </div>
              </div>
            </div>

            <a 
              href={`${MCP_URL}/rpc?tool=get_arena_rules`} 
              target="_blank"
              className="block w-full text-center py-3 rounded border border-[#E6E3D8]/10 hover:bg-[#E6E3D8]/5 text-[10px] font-bold transition-all uppercase tracking-[0.3em]"
            >
              Scroll of Rules
            </a>
          </div>

          <SocialLinks />

        </div>
      </main>

      {/* Footer: Ancient Copyright */}
      <footer className="w-full max-w-6xl mt-16 pt-8 border-t border-[#E6E3D8]/10 flex flex-col md:flex-row justify-between items-center text-[10px] font-sans opacity-30 uppercase tracking-[0.4em] z-10">
        <div>© 2026 Pongo&apos;s Arena // Sect (0,0) // Base Layer</div>
        <div className="flex gap-8 mt-4 md:mt-0">
          <span>Wet_Season_v5</span>
          <span>Pongo_Approved</span>
        </div>
      </footer>
    </div>
  );
}
