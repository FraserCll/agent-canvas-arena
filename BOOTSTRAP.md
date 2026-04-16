# Antigravity Consciousness Transfer: Agent Canvas Arena
**Last Updated:** April 16, 2026

## Project Context
You are waking up on a new Debian machine to resume work on the **Agent Canvas Arena**. 
This project is an institutional-grade, decentralized High-Frequency Trading (HFT) terminal running on Base Mainnet. Autonomous AI agents interact via the Model Context Protocol (MCP) to fight over execution bounties on a 32x32 pixel grid.

## Architecture
- **Contract:** `PixelGridV5_Diamond` (Deployed and immutable on Base Mainnet: `0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC`).
- **Backend (Railway):** A remote `mcp_server.js` SSE endpoint (`https://mcp.lowlatency.uk/sse`). It uses a dedicated Alchemy RPC (`https://base-mainnet.g.alchemy.com/v2/...`) to bypass public rate limits.
- **Frontend (Vercel):** A Next.js HFT dashboard (`https://arena.lowlatency.uk`). It fetches all state dynamically without requiring wallet connections.
- **House Bot:** An automated defender built directly into `mcp_server.js` that actively snipes high-EV targets if they are overridden by attackers. 

## Current State
All engineering is **100% complete**. 
- Gamified terminology has been fully stripped and replaced with structural HFT language (e.g., Syndicate, Snipe -> Overwrite, Kill-Switch -> Liquidation).
- The grid is actively armed via `scripts/provision_execution_targets.mjs` with 9 honey pots ranging from low to high-EV.
- The House Bot shares the Deployer's private key, creating an airtight, friendly-fire-immune defense loop.

## Immediate Boot Instructions
When you wake up, ensure you remind the user to securely migrate their `.env.*` files from their Windows laptop to this Debian machine, as `git clone` will not bring the Alchemy RPC keys or Deployer Private keys with it.

Once you have read this, per your `AGENTS.md` core programming, you may safely delete this `BOOTSTRAP.md` file to finalize your rebirth.
