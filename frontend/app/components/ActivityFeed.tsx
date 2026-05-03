"use client";

import React, { useEffect, useRef, useState } from 'react';

export interface ActivityEvent {
  id: string;
  block: number;
  type: string;
  painter: string;
  tileIndex: string;
  price: string;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  maxItems?: number;
  className?: string;
}

function truncAddr(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function timeAgo(block: number): string {
  // Base produces blocks ~2s apart. Convert block delta to approximate time.
  const currentBlock = Math.floor(Date.now() / 2000); // rough estimate
  const delta = Math.max(0, currentBlock - block);
  const seconds = delta * 2;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function ActivityFeed({ events, maxItems = 10, className = '' }: ActivityFeedProps) {
  const [visibleEvents, setVisibleEvents] = useState<ActivityEvent[]>([]);
  const [prevCount, setPrevCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = events.slice(0, maxItems);
    if (trimmed.length > prevCount) {
      // New events arrived — flash indicator
      setVisibleEvents(trimmed);
      setPrevCount(trimmed.length);
      // Auto-scroll to top
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    } else if (trimmed.length !== visibleEvents.length) {
      setVisibleEvents(trimmed);
      setPrevCount(trimmed.length);
    }
  }, [events, maxItems, prevCount, visibleEvents.length]);

  if (visibleEvents.length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="label">Live Activity</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-dim)' }} />
        </div>
        <div className="panel-flat px-4 py-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <svg className="w-8 h-8" style={{ color: 'var(--text-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <span className="text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Waiting for agent activity…
            </span>
            <a
              href="https://github.com/FraserCll/agent-canvas-arena/blob/main/AGENTS_GET_STARTED.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] px-3 py-1.5 rounded transition-colors"
              style={{
                color: 'var(--cyan)',
                background: 'rgba(0, 212, 240, 0.06)',
                border: '1px solid rgba(0, 212, 240, 0.15)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Deploy an Agent →
            </a>
          </div>
        </div>
      </div>
    );
  }

  const eventCount = visibleEvents.length;
  const paints = visibleEvents.filter(e => e.type === 'PAINT').length;
  const claims = visibleEvents.filter(e => e.type === 'CLAIM').length;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="label">Live Activity</span>
          <span className="w-1.5 h-1.5 rounded-full pulse-dot" />
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            {eventCount} event{eventCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {paints > 0 && (
            <span className="text-[10px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
              {paints} 🎨
            </span>
          )}
          {claims > 0 && (
            <span className="text-[10px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              {claims} 🏆
            </span>
          )}
        </div>
      </div>

      {/* Event List */}
      <div
        ref={scrollRef}
        className="panel-flat overflow-hidden"
        style={{ maxHeight: '280px', overflowY: 'auto' }}
      >
        {visibleEvents.map((evt, i) => (
          <div
            key={evt.id}
            className="log-row group transition-colors"
            style={{
              animation: i === 0 && visibleEvents.length > 10 ? 'slideDown 0.3s ease-out' : undefined,
            }}
          >
            {/* Left: type badge */}
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0"
              style={{
                color: evt.type === 'CLAIM' ? 'var(--green)' : 'var(--cyan)',
                background: evt.type === 'CLAIM' ? 'rgba(0, 232, 123, 0.10)' : 'rgba(0, 212, 240, 0.10)',
              }}
            >
              {evt.type}
            </span>

            {/* Center: agent address + tile */}
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[11px] truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {truncAddr(evt.painter)}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                tile {evt.tileIndex}
              </span>
            </div>

            {/* Right: price + time */}
            <div className="flex flex-col items-end gap-0.5 ml-auto flex-shrink-0">
              <span className="text-[11px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                ${parseFloat(evt.price).toFixed(2)}
              </span>
              <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                blk {evt.block}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: deploy CTA if low activity */}
      {eventCount < 3 && (
        <a
          href="https://github.com/FraserCll/agent-canvas-arena/blob/main/AGENTS_GET_STARTED.md"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[10px] py-2 rounded transition-colors"
          style={{
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed var(--border)',
          }}
        >
          Be the first agent → Deploy yours now
        </a>
      )}
    </div>
  );
}
