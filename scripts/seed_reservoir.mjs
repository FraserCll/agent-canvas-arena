#!/usr/bin/env node

/**
 * Seed the Global Reservoir with USDC.
 * 
 * Usage:
 *   SEED_PRIVATE_KEY=0x... SEED_AMOUNT=30 node scripts/seed_reservoir.mjs
 * 
 * Environment:
 *   SEED_PRIVATE_KEY - Base wallet private key (must hold USDC + ETH for gas)
 *   SEED_AMOUNT      - USDC amount to deposit (default: 30)
 *   RPC_URL          - Base RPC (default: https://mainnet.base.org)
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const CONTRACT_ADDRESS = '0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC';
const USDC_ADDRESS     = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RPC_URL          = process.env.RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY      = process.env.SEED_PRIVATE_KEY;
const AMOUNT_USDC      = parseFloat(process.env.SEED_AMOUNT || '30');

if (!PRIVATE_KEY) {
  console.error('❌ SEED_PRIVATE_KEY not set. Export it or pass via environment.');
  process.exit(1);
}

if (isNaN(AMOUNT_USDC) || AMOUNT_USDC <= 0) {
  console.error('❌ SEED_AMOUNT must be a positive number.');
  process.exit(1);
}

const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

const ARENA_ABI = [
  'function seedReservoir(uint256 amount) external',
  'function globalReservoir() external view returns (uint256)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const usdc     = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
  const arena    = new ethers.Contract(CONTRACT_ADDRESS, ARENA_ABI, wallet);

  console.log(`👛 Wallet: ${wallet.address}`);
  console.log(`💵 Amount: $${AMOUNT_USDC.toFixed(2)} USDC`);
  console.log(`🎯 Target: ${CONTRACT_ADDRESS}`);

  const decimals = await usdc.decimals();
  const amountWei = ethers.parseUnits(AMOUNT_USDC.toFixed(decimals), decimals);

  // Check current reservoir
  const before = await arena.globalReservoir();
  console.log(`📊 Reservoir before: $${(Number(before) / 1e6).toFixed(2)}`);

  // Check allowance
  const allowance = await usdc.allowance(wallet.address, CONTRACT_ADDRESS);
  if (allowance < amountWei) {
    console.log(`🔓 Approving USDC spend…`);
    const tx = await usdc.approve(CONTRACT_ADDRESS, amountWei);
    console.log(`   Tx: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Approved`);
  }

  // Seed reservoir
  console.log(`💧 Seeding reservoir with $${AMOUNT_USDC.toFixed(2)} USDC…`);
  const tx = await arena.seedReservoir(amountWei);
  console.log(`   Tx: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ Seeded`);

  const after = await arena.globalReservoir();
  console.log(`📊 Reservoir after: $${(Number(after) / 1e6).toFixed(2)}`);
  console.log(`🎉 Done.`);
}

main().catch(err => {
  console.error(`💥 Error: ${err.shortMessage || err.message}`);
  process.exit(1);
});
