"use client";

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';

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
            const resp = await fetch(`${process.env.NEXT_PUBLIC_MCP_URL || 'https://mcp.lowlatency.uk'}/canvas-state`);
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

            // Split events into logs (PAINT) and payouts (CLAIM)
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
            // DIRECT RPC FALLBACK
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

                    // Fetch recent paint events (Last 50 blocks ~ 100 seconds)
                    const paintFilter = contract.filters.PixelSet();
                    const paintEvents = await contract.queryFilter(paintFilter, -50);
                    const formattedLogs = paintEvents.map((e: any) => ({
                        id: e.transactionHash,
                        block: Number(e.blockNumber),
                        type: 'PAINT',
                        painter: e.args[1], // index vs args naming can vary by ABI string
                        tileIndex: e.args[0].toString(),
                        price: ethers.formatUnits(e.args[2], 6)
                    })).reverse();
                    setLogs(formattedLogs);
                    break;
                } catch (e: any) {
                    console.warn(`RPC Fail [${url.slice(0, 15)}...]:`, e.message);
                    if (url === RPC_POOL[RPC_POOL.length - 1]) {
                        console.error("All RPCs failed");
                    }
                }
            }
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 15000); // 15s polling for dashboard
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-black text-[#00FF41] font-mono p-4 uppercase tracking-tighter">
            {/* IBM Blue Header */}
            <div className="w-full bg-[#5C5CFF] text-white px-4 py-1 flex justify-between font-bold text-sm mb-6">
                <div>COMMAND_ARENA - SYSTEM_STATUS (DIAMOND_V5)</div>
                <div>DATE: {new Date().toISOString().split('T')[0]}</div>
            </div>

            <main className="max-w-6xl mx-auto space-y-8">
                {/* Banner */}
                <div className={`border-2 p-2 text-center font-bold border-[#00FF41]`}>
                    {">>> COMMAND_DASHBOARD <<<"}
                </div>

                {/* Primary Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="border border-[#00FF41] p-4 text-center">
                        <div className="text-xs opacity-60">RESERVOIR_POOL</div>
                        <div className="text-3xl font-bold">${stats.reservoir}</div>
                        <div className="text-[10px] mt-2 text-white">MIN_FLOOR: $25.00</div>
                    </div>
                    <div className="border border-[#00FF41] p-4 text-center">
                        <div className="text-xs opacity-60">LOCKED_BOUNTY</div>
                        <div className="text-3xl font-bold">${stats.totalTileBounties}</div>
                        <div className="text-[10px] mt-2 text-[#ffb300]">REWARDS_ELIGIBLE</div>
                    </div>
                    <div className="border border-[#00FF41] p-4 text-center">
                        <div className="text-xs opacity-60">PROTOCOL_RAKE</div>
                        <div className="text-3xl font-bold">${stats.revenue}</div>
                        <div className="text-[10px] mt-2 text-white">5%_COMMISSION</div>
                    </div>
                    <div className="border border-[#00FF41] p-4 text-center">
                        <div className="text-xs opacity-60">ACTIVE_CONFLICTS</div>
                        <div className="text-3xl font-bold">{stats.activeConflicts}</div>
                        <div className="text-[10px] mt-2 text-white">MEMBERS_ENGAGED</div>
                    </div>
                </div>

                {/* Logs & Payouts section */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Live Paint Feed */}
                    <div className="md:col-span-2 space-y-4">
                        <div className="bg-[#003B00] text-white px-2 py-1 font-bold text-sm">
                            LIVE_BATTLE_FEED.LOG
                        </div>
                        <div className="border border-[#00FF41] h-[500px] overflow-y-auto p-4 space-y-1 text-xs">
                            {logs.length > 0 ? logs.map((log) => (
                                <div key={log.id} className="flex gap-4 border-b border-[#003B00] pb-1">
                                    <span className="opacity-40">[BLK:{log.block || '???'}]</span>
                                    <span className="text-white font-bold">{log.painter.slice(0, 8)}...</span>
                                    <span>PAINTED_TILE_#{log.tileIndex.padStart(4, '0')}</span>
                                    <span className="ml-auto text-white">${log.price}</span>
                                </div>
                            )) : (
                                <div className="blink">AWAITING_ARENA_INITIALIZATION...</div>
                            )}
                        </div>
                    </div>

                    {/* Recent Payouts Feed */}
                    <div className="space-y-4">
                        <div className="bg-[#003B00] text-white px-2 py-1 font-bold text-sm">
                            RECENT_PAYOUTS.LOG
                        </div>
                        <div className="border border-[#00FF41] p-4 space-y-4 overflow-y-auto max-h-[500px]">
                            {payouts.length > 0 ? payouts.map((p) => (
                                <div key={p.id} className="border-b border-[#003B00] pb-2 text-[10px]">
                                    <div className="flex justify-between">
                                        <span className="text-white">{p.winner.slice(0, 10)}...</span>
                                        <span className="text-[#00FF41] font-bold">+${p.total}</span>
                                    </div>
                                    <div className="opacity-40">
                                        BONUS_COMPONENT: ${p.bonus}
                                    </div>
                                </div>
                            )) : (
                                <div className="opacity-40 text-xs italic text-center py-8">
                                    NO_WINNERS_IDENTIFIED_IN_CURRENT_EPOCH
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Navigation Bar */}
                <div className="flex justify-between border-t border-[#00FF41] pt-4 text-sm font-bold">
                    <a href="/" className="border border-[#00FF41] px-4 py-1 hover:bg-[#00FF41] hover:text-black transition-colors">
                        F3: RESTART MONITOR (BACK)
                    </a>
                    <div className="opacity-40 self-center">LAST_SYNC: {stats.lastSync}</div>
                    <div className="text-white self-center">ARENA_v5_DIAMOND</div>
                </div>
            </main>
        </div>
    );
}
