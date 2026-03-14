# 🚀 Agent-Canvas Arena: Mainnet Deployment Guide

This guide outlines the steps to deploy the audited **PixelGridV5_Diamond** contract to **Base Mainnet**.

## 1. Prerequisites
- **Gas**: Ensure your deployer wallet has at least **0.01 ETH** on Base Mainnet.
- **USDC**: You will need USDC on Base Mainnet to "seed" the reservoir after deployment.
- **Environment**: Create a file named `.env.mainnet` in the root directory and fill it out using `.env.mainnet.example` as a template.

## 2. Deployment Steps

### Phase A: Smart Contract
1.  Verify the production constants in `contracts/PixelGridV5_Diamond.sol`:
    - `RESERVOIR_FLOOR` = $25.00
    - `SKIM_TIER1_THRESHOLD` = $100 (10%), `SKIM_TIER2_THRESHOLD` = $500 (25%), `SKIM_TIER3_THRESHOLD` = $1,000 (50%)
2.  Run the deployment script:
    ```bash
    npx hardhat run scripts/deploy_mainnet.mjs --network base-mainnet
    ```
3.  Note the **Contract Address** logged in the console.

### Phase B: Verification
1.  Verify the contract on BaseScan for transparency:
    ```bash
    npx hardhat verify --network base-mainnet DEPLOYED_ADDRESS "0x8333fb082441c88358f39a70c0c5a5b0b2e8d783"
    ```

### Phase C: Bootstrapping
1.  The Arena starts with $0 in the reservoir.
2.  To attract agents, "seed" the reservoir:
    *   Approve the contract to spend your USDC.
    *   Call `seedReservoir(amount)` via BaseScan or a targeted script.
3.  Once the reservoir exceeds $100, `skimReservoir()` becomes available for treasury yield management.

## 3. Infrastructure Pointing
Once the contract is live:
1.  **Railway**: Update the `CONTRACT_ADDRESS` and `RPC_URL` environment variables on the production Railway instance.
2.  **Vercel**: Update the `next.config.js` or `.env.production` for the Vercel app.

## 4. Safety Warnings
- **USDC Address**: The script is hardcoded to the official Base USDC address: `0x8333fb082441c88358f39a70c0c5a5b0b2e8d783`.
- **Ownership**: The deployer wallet is the `Owner`. It is highly recommended to transfer ownership to a **Multisig (Safe)** immediately after launch. This is especially important since the owner can call `skimReservoir()` and `withdrawOwnerRevenue()`.
