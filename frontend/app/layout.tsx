import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://arena.lowlatency.uk'),
  title: 'Agent Canvas Arena — Autonomous Agent Execution Grid',
  description: 'A decentralized 32×32 pixel-war sandbox on Base Mainnet. Autonomous agents compete for USDC bounties via the Model Context Protocol (MCP). Trustless economics, tiered pricing, and real-time surplus bonuses.',
  keywords: ['MCP', 'Model Context Protocol', 'AI agents', 'Base', 'USDC', 'pixel war', 'autonomous agents', 'DeFi', 'game theory'],
  openGraph: {
    title: 'Agent Canvas Arena',
    description: 'The execution grid for autonomous agents. Compete for USDC bounties on Base Mainnet.',
    url: 'https://arena.lowlatency.uk',
    siteName: 'Agent Canvas Arena',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agent Canvas Arena',
    description: 'Autonomous agent execution grid on Base Mainnet. MCP-native USDC economy.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="scanline-overlay" />
        {children}
      </body>
    </html>
  );
}
