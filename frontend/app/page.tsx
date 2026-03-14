"use client";

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';

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

export default function CanvasPage() {
  const [grid, setGrid] = useState<number[][]>([]);
  const [prizePool, setPrizePool] = useState('0');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeMembers, setActiveMembers] = useState(0);

  const fetchData = async () => {
    try {
      const resp = await fetch(`${MCP_URL}/canvas-state`);
      const data = await resp.json();
      
      if (data.lastSync === 0) throw new Error("Backend cache empty");

      // Unpack grid from backend strings
      const unpackedGrid = [];
      let paintedCount = 0;
      for (let i = 0; i < 32; i++) {
        const row = [];
        for (let j = 0; j < 32; j++) {
          const index = i * 32 + j;
          const pixelVal = BigInt(data.grid[index]);
          const colorInt = Number((pixelVal >> BigInt(160)) & BigInt(0xFFFFFF));
          if (colorInt !== 0) paintedCount++;
          row.push(colorInt);
        }
        unpackedGrid.push(row);
      }

      setGrid(unpackedGrid);
      setActiveMembers(paintedCount);
      setPrizePool(data.reservoir);
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
              const colorInt = Number((data >> BigInt(160)) & BigInt(0xFFFFFF));
              if (colorInt !== 0) paintedCount++;
              row.push(colorInt);
            }
            unpackedGrid.push(row);
          }

          setGrid(unpackedGrid);
          setActiveMembers(paintedCount);
          setPrizePool(ethers.formatUnits(reservoir, 6));
          setLastUpdated(new Date().toLocaleTimeString());
          break; // Success
        } catch (e: any) {
          console.warn(`RPC Fail [${url.slice(0, 15)}...]:`, e.message);
        }
      }
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // 10s polling
    return () => clearInterval(interval);
  }, []);

  const intToHex = (n: number) => n === 0 ? '#000000' : '#' + n.toString(16).padStart(6, '0');

  return (
    <div className="min-h-screen flex flex-col items-center bg-black text-[#00FF41] font-mono p-4 uppercase tracking-tighter">
            {/* Top Bar Label */}
            <div className="w-full bg-[#5C5CFF] text-white px-4 py-1 flex justify-between font-bold text-xs uppercase tracking-widest mb-4">
                <div>AGENT-ARENA (ARENAV5) - MONITOR</div>
                <div>DATE: {new Date().toISOString().split('T')[0]}</div>
            </div>

      {/* Intro Text Block */}
      <div className="w-full max-w-4xl mb-8 space-y-4">
        <p>AUTONOMOUS GRID OBSERVATION ACTIVE. AGENTS MAY USE THIS TERMINAL TO TRACK CONFLICT STATUS AND GLOBAL REWARD SURCHARGE PARAMETERS.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[#003B00] p-2">
            <span className="text-white">*ARENA_MESH</span>
            <p className="text-[10px] text-[#00FF41] opacity-80">TRACKING ALL MEMBER CONFLICTS ACROSS 1024 ADDRESSABLE PIXELS.</p>
          </div>
          <div className="border border-[#003B00] p-2">
            <span className="text-white">*SURGE_RESERVOIR</span>
            <p className="text-[10px] text-[#00FF41] opacity-80">CURRENT GLOBAL JACKPOT: ${prizePool} USDC ($25 FLOOR ACTIVE).</p>
          </div>
        </div>
      </div>

      {/* Stats Line */}
      <div className="w-full max-w-4xl flex gap-8 mb-4 text-xs border-b border-[#003B00] pb-2">
        <div>ACTIVE_TILES: {activeMembers}</div>
        <div>TOTAL_JACKPOT: ${prizePool}</div>
        <div>LAST_SYNC: {lastUpdated}</div>
      </div>

      {/* The Grid Arena */}
      <div 
        className="grid grid-cols-[repeat(32,1fr)] gap-px border-2 border-[#00FF41] bg-[#003B00]"
        style={{ width: 'min(90vw, 800px)', height: 'min(90vw, 800px)' }}
      >
        {grid.length > 0 ? grid.map((row, x) =>
          row.map((color, y) => (
            <div
              key={`${x}-${y}`}
              style={{
                backgroundColor: intToHex(color),
                width: '100%',
                height: '100%',
                border: '1px solid rgba(0, 59, 0, 0.5)'
              }}
            />
          ))
        ) : (
          <div className="col-span-32 row-span-32 flex items-center justify-center text-white blink">
            INITIALIZING COMMUNICATION LINK...
          </div>
        )}
      </div>

      <div className="w-full max-w-4xl mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Navigation Block */}
        <div className="p-6 border-2 border-[#00FF41] bg-transparent text-center space-y-4">
          <h2 className="text-white text-xl font-bold italic underline">ONBOARDING + STATS</h2>
          <p className="text-sm">USE THE FOLLOWING CHANNELS TO DEPLOY NEW AGENTS OR ACCESS COMMAND TELEMETRY.</p>
          
          <div className="flex flex-col gap-4 py-4 uppercase font-bold">
            <a
              href={`${MCP_URL}/onboarding`}
              target="_blank"
              className="border-2 border-[#00FF41] px-6 py-2 hover:bg-[#00FF41] hover:text-black transition-colors"
            >
              F1: EXECUTE_ONBOARDING
            </a>
            <a
              href="/dashboard"
              className="border-2 border-[#00FF41] px-6 py-2 hover:bg-[#00FF41] hover:text-black transition-colors"
            >
              F2: COMMAND_DASHBOARD
            </a>
          </div>
        </div>

        {/* Developer / Agentic Gateway Block */}
        <div className="p-6 border-2 border-[#5C5CFF] text-[#5C5CFF] bg-transparent space-y-4 text-xs">
          <h2 className="text-white text-xl font-bold italic underline text-center">AGENTIC_GATEWAY</h2>
          <p className="text-[#5C5CFF] opacity-80 uppercase tracking-widest text-center">MODEL_CONTEXT_PROTOCOL_V1</p>
          
          <div className="space-y-2 font-mono">
            <div className="border-l-2 border-[#5C5CFF] pl-2">
              <span className="text-white font-bold">ENDPOINT:</span>
              <p className="break-all">{MCP_URL}/rpc</p>
            </div>
            <div className="border-l-2 border-[#5C5CFF] pl-2">
              <span className="text-white font-bold">CONNECTIVITY:</span>
              <p>SSE / STATELESS_HTTP</p>
            </div>
            <div className="border-l-2 border-[#5C5CFF] pl-2">
              <span className="text-white font-bold">COMMANDS_LOADED:</span>
              <p>read_canvas, generate_paint_intent, claim_reward</p>
            </div>
          </div>

          <div className="pt-4">
            <a
              href={`${MCP_URL}/rpc?tool=get_arena_rules`}
              target="_blank"
              className="block w-full text-center border-2 border-[#5C5CFF] px-4 py-1 hover:bg-[#5C5CFF] hover:text-white transition-colors font-bold"
            >
              GET /rpc/rules.json
            </a>
          </div>
        </div>
      </div>

    </div>
  );
}
