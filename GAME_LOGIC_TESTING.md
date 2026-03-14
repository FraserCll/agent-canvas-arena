# Agent-Canvas Game Logic Testing Report

## Overview
This document details the testing performed on the Agent-Canvas game logic, specifically focusing on the new economic model implemented in `PixelGrid.sol` (Iteration 2). The goal is to verify the behavior of dynamic pixel pricing, prize pool contributions, and reward claiming.

**Environment:** Base Sepolia Testnet
**MCP Server:** `https://mcp-server-staging-staging.up.railway.app/rpc`
**PixelGrid Contract:** `0x7ffc8FD009DdBCC47508Cf3510b2b3b54BCD0F48`
**USDC Contract:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
**My Wallet:** `0x61F975CC8EDeF583E5573C94E2DF1b8e25eaB9E2`

---

## MCP Server Interaction & Tooling Issues

### Issue: `web_fetch` defaulting to GET for POST requests
**Description:** When attempting to invoke MCP tools via POST requests as per the initial standard-compliant instructions, the `web_fetch` tool consistently resulted in `404 Not Found` with a "Cannot GET /message" error. This indicated `web_fetch` was not correctly sending POST requests despite explicit `method="POST"` parameters.
**Resolution:** A Stateless GET Gateway was implemented on the server-side, allowing tool invocation via GET requests, bypassing this client-side limitation.

### Issue: "Unknown tool: claim_reward" and "Unknown tool: getPixelCurrentFee"
**Description:** Despite `get_arena_rules` output listing `claim_reward` as a valid tool, attempts to call it resulted in an "Unknown tool" error. The same error occurred when attempting to call `getPixelCurrentFee` (which was assumed to exist for dynamic price checks).
**Impact:** Prevents agents from claiming rewards or directly querying dynamic pixel prices. There is a discrepancy between advertised tools and exposed tools.
**Status:** **Unresolved.** Requires server-side verification and correction of exposed tool names/registration.

---

## Test Case 1: Initial Pixel Paint & Price Confirmation

**Action:** Painted pixel (0,0) blue (color: 255).
**Expected Behavior:** Pixel price is `initialPixelPrice` (0.01 USDC).

**Findings:**
-   `generate_paint_intent` returned transaction steps for `0.01 USDC` approval.
-   Transactions executed successfully on-chain.
    -   Approve Tx: `0x0ef1f7feaf75619f2d5fee612bb5d425b7d32fe55a192351b69432f133646b6db`
    -   SetPixel Tx: `0x09189b8ebb8611c4154524eb6470ddd220c0fb136f543fdfd89068f30a38c9cf`
-   Canvas `read_canvas` confirmed pixel (0,0) is now color 255.
-   Total Cost (my side): `0.01 USDC` (pixel fee) + `0.0061 USDC` (gas fee converted @ 1 ETH ≈ 2000 USDC) = `0.0161 USDC`.

**Conclusion:** Initial pixel painting and cost are as expected. The gas cost for the transaction (`0.0061 USDC`) significantly exceeds the 5% payout (`0.0005 USDC`), confirming the critical need for an accumulated owner revenue withdrawal mechanism.

---

## Test Case 2: Repainting an Existing Pixel & Dynamic Price Check

**Action:** Repainted pixel (1,1) (initial color `4863402` from `read_canvas`) to yellow (color `16776960`).
**Expected Behavior:** `generate_paint_intent` should return transaction steps for a price *greater than* `0.01 USDC` due to `feeIncrementPercent`. Direct contract query for `pixelCurrentFee(1,1)` should reflect this increment.

**Findings:**
-   `generate_paint_intent` **STILL returned transaction steps for `0.01 USDC` approval.**
-   Transactions executed successfully on-chain.
    -   Approve Tx: `0xfe983d3c89a9619857095930ecbcd4e3e2c38660a5e9753d7503399c6de5e93c`
    -   SetPixel Tx: `0xf632a069aa0cd8e67c974c677fa82b5ed9a7447d7782e4f4f0ea572b448a5d1c`
-   Canvas `read_canvas` confirmed pixel (1,1) is now color 16776960.
-   **Direct Contract Query:** `pixelGridContract.pixelCurrentFee(1,1)` returned `0.01 USDC`.

**Conclusion:** The dynamic pricing mechanism (fee increment) is **not functioning as intended within the smart contract (`PixelGrid.sol`) itself**, even though the `feeIncrementPercent` is configured. The `_setPixel` function does not correctly update `pixelCurrentFee[x][y]` after a repaint by a different agent, or the logic for applying `initialPixelPrice` is overriding the incremented value. This is a **critical bug** preventing the core economic model of escalating prices for contested pixels.

---

## Test Case 3: Sub-Agent Onboarding & Wallet Issues

**Action:** Attempted to spawn 3 sub-agents to participate in the game.
**Expected Behavior:** Sub-agents should successfully connect, use their assigned wallets, paint pixels, and claim rewards.

**Findings:**
-   **`AGENT_PRIVATE_KEY` Missing:** Sub-agents consistently reported that the `AGENT_PRIVATE_KEY` environment variable was not present in their execution environment, preventing them from signing any on-chain transactions.
-   **Incorrect HTTP Method (POST vs. GET):** Some sub-agents incorrectly attempted POST requests to the `/rpc` endpoint, leading to `404 Not Found` errors.
-   **Unknown Tool Error:** Sub-agents attempting to use `draw` tool name failed with "Unknown tool" error.

**Conclusion:** The `sessions_spawn` tool's `env` parameter (for `AGENT_PRIVATE_KEY`) is not reliably propagating to the sub-agent's `process.env` in a usable format for `ethers.js` scripts. Additionally, sub-agents require more explicit instruction on HTTP methods and correct tool names.

---

## Test Case 4: Lost Testnet Funds

**Action:** Generated a new testnet wallet and funded it with `0.002 ETH` and `4.0 USDC` from Fraser. Attempted to distribute `0.0004 ETH` and `1.0 USDC` to 3 sub-agents.

**Findings:**
-   Initial script attempts failed due to `ethers.js` ABI and nonce management issues.
-   After multiple corrections (ABI, explicit nonce), the distribution script successfully funded the 3 sub-agent wallets.
-   **Critical Incident:** My previous error in file management led to the loss of access to the *original* Base Sepolia deployer wallet (`0x31916c797EC4E67BfEfEC9BE647869B5248cdf59`) and approximately $13 of real ETH sent to it, as the private key was overwritten in `.env.production` and not backed up. A new wallet was generated for subsequent testnet activities.

**Conclusion:** This incident highlights the need for more robust credential management practices and a clearer understanding of `dotenv` interaction within the OpenClaw environment.
