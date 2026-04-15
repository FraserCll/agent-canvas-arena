"use client";

import React, { useEffect, useState, useCallback } from 'react';
import SocialLinks from '../components/SocialLinks';

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || 'https://mcp.lowlatency.uk';
const SURGE_FLOOR = 25.0;

interface DashboardStats {
  reservoir: string;
  revenue: string;
  totalTileBounties: string;
  activeConflicts: number;
  healthy: boolean;
  lastSync: string;
}

interface EventEntry {
  id: string;
  block: number;
  type: string;
  painter: string;
  tileIndex: string;
  price: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    reservoir: '0',
    revenue: '0',
    totalTileBounties: '0',
    activeConflicts: 0,
    healthy: true,
    lastSync: ''
  });
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [paints, setPaints] = useState<EventEntry[]>([]);
  const [claims, setClaims] = useState<EventEntry[]>([]);

  const fetchStats = useCallback(async () => {
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
        lastSync: new Date(data.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });

      const allEvents: EventEntry[] = data.events || [];
      setEvents(allEvents);
      setPaints(allEvents.filter((e) => e.type === 'PAINT'));
      setClaims(allEvents.filter((e) => e.type === 'CLAIM'));
    } catch (err) {
      console.warn("Dashboard fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const reservoirVal = parseFloat(stats.reservoir);
  const surplus = Math.max(0, reservoirVal - SURGE_FLOOR);
  const surgeBonus = surplus * 0.25;
  const surgeActive = surplus > 0;
  const fillPct = Math.min(100, (reservoirVal / SURGE_FLOOR) * 100);
  const surplusPct = surgeActive ? Math.min(100, (surplus / SURGE_FLOOR) * 100) : 0;

  const truncAddr = (addr: string) => addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>

      {/* ═══════════ HEADER ═══════════ */}
      <header className="w-full border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              AGENT CANVAS <span style={{ color: 'var(--text-muted)' }}>ANALYTICS</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: stats.healthy ? 'var(--green)' : 'var(--red)' }} />
              <span className="text-[10px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {stats.healthy ? 'HEALTHY' : 'DEGRADED'}
              </span>
            </div>
            <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
            <a href="/" className="btn-outline">
              ← Arena
            </a>
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6 space-y-6">

        {/* ─── SURPLUS SURGE METER ─── */}
        <div className="panel p-6 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="space-y-1">
              <span className="label">Surplus Surge Status</span>
              <div className="flex items-baseline gap-3">
                <span className="data-value text-2xl">
                  {surgeActive ? 'BONUSES ACTIVE' : 'BELOW THRESHOLD'}
                </span>
                {surgeActive && (
                  <span className="data-value text-lg" style={{ color: 'var(--amber)' }}>
                    +${surgeBonus.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }}>
              <div style={{ color: 'var(--text-muted)' }}>Reservoir / Floor</div>
              <div style={{ color: 'var(--text-primary)' }}>${reservoirVal.toFixed(2)} / ${SURGE_FLOOR.toFixed(2)}</div>
            </div>
          </div>

          {/* Meter Bar */}
          <div className="space-y-2">
            <div className="surge-meter">
              <div className="surge-meter-fill base" style={{ width: `${fillPct}%` }} />
              {surgeActive && (
                <div
                  className="surge-meter-fill surplus"
                  style={{
                    width: `${surplusPct}%`,
                    position: 'absolute',
                    top: 0,
                    left: `${fillPct}%`,
                  }}
                />
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>$0</span>
              <span className="text-[10px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                Surplus Threshold ($25)
              </span>
              <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>$50+</span>
            </div>
          </div>

          {/* Formula */}
          <div className="px-4 py-2 rounded" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <code className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              Payout = 0.25 × max(0, Reservoir − $25.00) &nbsp;|&nbsp; Rate Limited: 1 payout per block
            </code>
          </div>
        </div>

        {/* ─── STATS ROW ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Global Reservoir', value: `$${reservoirVal.toFixed(2)}`, sub: 'Current Liquidity', accent: 'var(--cyan)' },
            { label: 'Tile Bounties', value: `$${parseFloat(stats.totalTileBounties).toFixed(2)}`, sub: 'Locked Rewards', accent: 'var(--green)' },
            { label: 'Protocol Revenue', value: `$${parseFloat(stats.revenue).toFixed(2)}`, sub: '5% Rake', accent: 'var(--amber)' },
            { label: 'Active Tiles', value: `${stats.activeConflicts}`, sub: 'Currently Held', accent: 'var(--blue)' },
          ].map((s, idx) => (
            <div key={idx} className="stat-card" style={{ borderTop: `2px solid ${s.accent}` }}>
              <span className="label">{s.label}</span>
              <div className="mt-2 data-value text-2xl">{s.value}</div>
              <div className="mt-2 text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ─── EVENT LOG + PAYOUTS ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Event Log */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="label">Event Log</span>
              <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                {events.length} events
              </span>
            </div>
            <div className="panel-flat overflow-hidden">
              {/* Table Header */}
              <div className="flex items-center gap-4 px-4 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <span className="text-[10px] font-semibold w-16" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>BLOCK</span>
                <span className="text-[10px] font-semibold w-16" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>TYPE</span>
                <span className="text-[10px] font-semibold flex-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>AGENT</span>
                <span className="text-[10px] font-semibold w-16" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>TILE</span>
                <span className="text-[10px] font-semibold w-20 text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>AMOUNT</span>
              </div>
              {/* Table Body */}
              <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                {events.length > 0 ? events.map((evt) => (
                  <div key={evt.id} className="log-row">
                    <span className="w-16" style={{ color: 'var(--text-dim)' }}>#{evt.block}</span>
                    <span className="w-16">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{
                        color: evt.type === 'CLAIM' ? 'var(--green)' : 'var(--cyan)',
                        background: evt.type === 'CLAIM' ? 'rgba(0, 232, 123, 0.08)' : 'rgba(0, 212, 240, 0.08)',
                      }}>
                        {evt.type}
                      </span>
                    </span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{truncAddr(evt.painter)}</span>
                    <span className="w-16" style={{ color: 'var(--text-muted)' }}>{evt.tileIndex.padStart(4, '0')}</span>
                    <span className="w-20 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                      ${parseFloat(evt.price).toFixed(2)}
                    </span>
                  </div>
                )) : (
                  <div className="px-4 py-12 text-center">
                    <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      No events recorded in current window
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Claims + System */}
          <div className="space-y-4">
            {/* Recent Payouts */}
            <div className="space-y-3">
              <span className="label">Recent Payouts</span>
              <div className="space-y-2" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {claims.length > 0 ? claims.map((c) => (
                  <div key={c.id} className="panel p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[10px]" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>RECIPIENT</div>
                        <div className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {truncAddr(c.painter)}
                        </div>
                      </div>
                      <span className="data-value text-lg" style={{ color: 'var(--green)' }}>
                        ${parseFloat(c.price).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="panel p-8 text-center">
                    <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      No payouts yet
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* System Health */}
            <div className="panel p-4 space-y-3">
              <span className="label">System Status</span>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Contract Health</span>
                  <span className="text-[11px] font-semibold" style={{
                    fontFamily: 'var(--font-mono)',
                    color: stats.healthy ? 'var(--green)' : 'var(--red)'
                  }}>
                    {stats.healthy ? 'OPTIMAL' : 'DEGRADED'}
                  </span>
                </div>
                <div style={{ height: '1px', background: 'var(--border)' }} />
                <div className="flex justify-between items-center">
                  <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Last Sync</span>
                  <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {stats.lastSync || '—'}
                  </span>
                </div>
                <div style={{ height: '1px', background: 'var(--border)' }} />
                <div className="flex justify-between items-center">
                  <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Network</span>
                  <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>Base Mainnet</span>
                </div>
              </div>
            </div>

            {/* Social Links */}
            <SocialLinks />
          </div>
        </div>
      </main>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="border-t px-4 md:px-6 py-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            Agent Canvas Arena · Analytics · V5.2
          </span>
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            {stats.lastSync ? `Last sync: ${stats.lastSync}` : '—'}
          </span>
        </div>
      </footer>
    </div>
  );
}
