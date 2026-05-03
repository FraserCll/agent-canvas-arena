#!/usr/bin/env node

/**
 * Demo Agent for Agent Canvas Arena.
 * Uses the thin SDK to paint a random tile every hour.
 *
 * Environment variables:
 * - DEMO_PRIVATE_KEY (optional): If set, the agent will sign and broadcast transactions.
 * - DEMO_GATEWAY (optional): MCP gateway URL (default: https://mcp.lowlatency.uk/rpc)
 *
 * If no private key is provided, the agent will only log the transaction steps.
 */

import { AgentCanvasSDK } from 'agent-canvas-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const GATEWAY = process.env.DEMO_GATEWAY || 'https://mcp.lowlatency.uk/rpc';
const PRIVATE_KEY = process.env.DEMO_PRIVATE_KEY;
const RPC_URL = process.env.DEMO_RPC_URL || 'https://mainnet.base.org';

// Colors for demo (bright, distinct)
const COLORS = [
  0xFF0000, // red
  0x00FF00, // green
  0x0000FF, // blue
  0xFFFF00, // yellow
  0xFF00FF, // magenta
  0x00FFFF, // cyan
];

const sdk = new AgentCanvasSDK({ gateway: GATEWAY });
let wallet = null;
let provider = null;

if (PRIVATE_KEY) {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`🔐 Demo agent running with wallet ${wallet.address}`);
} else {
  console.log(`👁️ Demo agent running in dry‑run mode (no private key).`);
}

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] ${msg}`);
}

async function getRandomPixel() {
  const x = Math.floor(Math.random() * 32);
  const y = Math.floor(Math.random() * 32);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { x, y, color };
}

async function checkBalance(address) {
  if (!address) return null;
  try {
    const { balance } = await sdk.getUserBalance(address);
    return parseFloat(balance);
  } catch (err) {
    log(`⚠️ Could not fetch balance: ${err.message}`);
    return null;
  }
}

async function paintPixel(pixel, painter) {
  const { x, y, color } = pixel;
  log(`🎨 Generating paint intent for (${x}, ${y}) with color #${color.toString(16).padStart(6, '0')}`);
  try {
    const intent = await sdk.generatePaintIntent([{ x, y, color }], painter);
    log(`📦 Intent generated: ${intent.steps.length} step(s)`);
    return intent;
  } catch (err) {
    log(`❌ Failed to generate paint intent: ${err.message}`);
    throw err;
  }
}

async function executeSteps(steps) {
  if (!wallet) {
    log(`📄 Dry‑run: would execute ${steps.length} step(s):`);
    steps.forEach((step, i) => {
      log(`   ${i + 1}. ${step.description} → ${step.target}.${step.function}`);
    });
    return;
  }

  for (const step of steps) {
    try {
      const feeData = await provider.getFeeData();
      const nonce = await wallet.getNonce();
      const gasOptions = {
        nonce,
        maxFeePerGas: (feeData.maxFeePerGas * 150n) / 100n,
        maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 150n) / 100n,
      };

      if (step.function.includes('approve')) {
        const usdc = new ethers.Contract(step.target, ['function approve(address,uint256)'], wallet);
        const tx = await usdc.approve(step.args[0], step.args[1], gasOptions);
        log(`✅ Approve sent: ${tx.hash}`);
        await tx.wait();
        log(`✅ Approved USDC`);
      } else {
        const abi = [`function ${step.function} external`];
        const contract = new ethers.Contract(step.target, abi, wallet);
        const funcName = step.function.split('(')[0];
        const tx = await contract[funcName](...step.args, gasOptions);
        log(`✅ ${step.description} sent: ${tx.hash}`);
        await tx.wait();
        log(`✅ ${step.description} confirmed`);
      }
      // Small delay between steps
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      log(`❌ Step execution failed: ${err.shortMessage || err.message}`);
      throw err;
    }
  }
}

async function runCycle() {
  log(`--- Starting demo agent cycle ---`);
  try {
    // 1. Get arena rules (optional)
    const rules = await sdk.getArenaRules();
    log(`🏟️ Arena: ${rules.arena}`);

    // 2. Pick a random pixel
    const pixel = await getRandomPixel();
    const painter = wallet ? wallet.address : '0x0000000000000000000000000000000000000000';

    // 3. Check fee
    const feeInfo = await sdk.getPixelFee(pixel.x, pixel.y);
    log(`💰 Fee to paint (${pixel.x}, ${pixel.y}): $${feeInfo.fee} USDC`);

    // 4. If we have a wallet, check internal balance
    if (wallet) {
      const bal = await checkBalance(wallet.address);
      if (bal !== null) {
        log(`💳 Internal balance: $${bal.toFixed(2)} USDC`);
        if (bal < parseFloat(feeInfo.fee)) {
          log(`⚠️ Insufficient internal balance. Skipping paint.`);
          return;
        }
      }
    }

    // 5. Generate and execute paint intent
    const intent = await paintPixel(pixel, painter);
    await executeSteps(intent.steps);

    log(`✅ Cycle completed successfully.`);
  } catch (err) {
    log(`💥 Cycle failed: ${err.message}`);
  }
  log(`--- Waiting for next cycle (1 hour) ---\n`);
}

// Main
(async () => {
  log(`🚀 Agent Canvas Arena Demo Agent started.`);
  log(`Gateway: ${GATEWAY}`);
  if (wallet) {
    log(`Wallet: ${wallet.address}`);
    const bal = await checkBalance(wallet.address);
    if (bal !== null) log(`Initial internal balance: $${bal.toFixed(2)} USDC`);
  }

  // Run immediately, then every hour
  await runCycle();
  setInterval(runCycle, 60 * 60 * 1000);
})();