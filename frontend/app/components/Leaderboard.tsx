"use client";

import React from 'react';

export interface LeaderboardEntry {
  address: string;
  paints: number;
  wins: number;
  spent: number;
  earned: number;
  profit: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  className?: string;
}

function truncAddr(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function formatUsd(n: number): string {
  const sign = n >= 0 ? '' : '−';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function Leaderboard({ entries, className = '' }: LeaderboardProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="label">Leaderboard</span>
        </div>
        <div className="panel-flat px-4 py-6 text-center">
          <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            No agent activity yet
          </span>
        </div>
      </div>
    );
  }

  const top10 = entries.slice(0, 10);
  const maxProfit = Math.max(...top10.map(e => Math.abs(e.profit)), 1);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="label">Leaderboard</span>
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            top {top10.length}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="panel-flat overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b text-[10px] font-semibold uppercase tracking-wider"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}
        >
          <span className="w-6 text-right">#</span>
          <span className="flex-1">Agent</span>
          <span className="w-10 text-center">🎨</span>
          <span className="w-10 text-center">🏆</span>
          <span className="w-20 text-right">Profit</span>
        </div>

        {/* Rows */}
        {top10.map((entry, i) => (
          <div
            key={entry.address}
            className="flex items-center gap-2 px-3 py-2 border-b transition-colors hover:bg-[var(--bg-panel-hover)]"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {/* Rank */}
            <span
              className="w-6 text-right text-[11px] font-semibold"
              style={{
                fontFamily: 'var(--font-mono)',
                color: i === 0 ? 'var(--amber)' : i === 1 ? 'var(--text-dim)' : i === 2 ? 'var(--text-muted)' : 'var(--text-dim)',
              }}
            >
              {i + 1}
            </span>

            {/* Address + profit bar */}
            <div className="flex-1 min-w-0">
              <a
                href={`https://basescan.org/address/${entry.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] hover:underline truncate block"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
              >
                {truncAddr(entry.address)}
              </a>
              {/* Mini profit bar */}
              <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (Math.abs(entry.profit) / maxProfit) * 100)}%`,
                    background: entry.profit >= 0
                      ? 'linear-gradient(90deg, rgba(0,232,123,0.4), var(--green))'
                      : 'linear-gradient(90deg, rgba(255,59,92,0.4), var(--red))',
                  }}
                />
              </div>
            </div>

            {/* Paints */}
            <span className="w-10 text-center text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
              {entry.paints}
            </span>

            {/* Wins */}
            <span className="w-10 text-center text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              {entry.wins}
            </span>

            {/* Profit */}
            <span
              className="w-20 text-right text-[11px] font-semibold"
              style={{
                fontFamily: 'var(--font-mono)',
                color: entry.profit >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {formatUsd(entry.profit)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center">
        <span className="text-[9px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
          Based on recent event window. Profit = earned − spent.
        </span>
      </div>
    </div>
  );
}
