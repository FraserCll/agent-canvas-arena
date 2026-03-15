import { ethers } from 'ethers';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.mainnet' });
dotenv.config({ path: '.env.agents' });

const ARCH_GATEWAY = "https://mcp.lowlatency.uk/rpc";
const RPC_POOL = [
    "https://developer-access-mainnet.base.org",
    "https://1rpc.io/base",
    "https://base.meowrpc.com",
    "https://mainnet.base.org"
];
const STAGING_PRIV_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const USDC_ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET_FILE = path.join(process.cwd(), 'scripts', 'sim_wallets_v5.json');

const providers = RPC_POOL.map(url => new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
const provider = new ethers.FallbackProvider(providers);
const deployerWallet = new ethers.Wallet(STAGING_PRIV_KEY, provider);

const ARENA_ADDR = "0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC";
const contract = new ethers.Contract(ARENA_ADDR, ["function userBalances(address) view returns (uint256)"], provider);

const log = (name, msg) => console.log(`[${new Date().toISOString().split('T')[1].split('.')[0]}] [${name}] ${msg}`);

// Simple lock for deployer transactions to avoid nonce collisions
let deployerBusy = Promise.resolve();
const lockDeployer = () => {
    let release;
    const wait = new Promise(r => release = r);
    const prev = deployerBusy;
    deployerBusy = wait;
    return prev.then(() => release);
};

async function callTool(tool, args = {}) {
    try {
        const url = `${ARCH_GATEWAY}?tool=${tool}&args=${encodeURIComponent(JSON.stringify(args))}`;
        const response = await axios.get(url, { timeout: 30000 });
        if (!response.data || !response.data.content) {
            throw new Error(`Invalid response format for tool: ${tool}`);
        }
        return JSON.parse(response.data.content[0].text);
    } catch (e) {
        if (e.response && e.response.data) {
            throw new Error(`Tool ${tool} failed (500): ${JSON.stringify(e.response.data)}`);
        }
        throw new Error(`Tool ${tool} failed: ${e.message}`);
    }
}

async function executeIntent(wallet, intentObj, agentName) {
    const { steps } = intentObj;
    if (!steps) return;
    for (const step of steps) {
        try {
            const feeData = await provider.getFeeData();
            const nonce = await wallet.getNonce();
            const gasOptions = {
                nonce,
                maxFeePerGas: (feeData.maxFeePerGas * 150n) / 100n, // 50% buffer
                maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 150n) / 100n
            };

            if (step.function.includes("approve")) {
                const usdc = new ethers.Contract(step.target, ["function approve(address,uint256)"], wallet);
                const tx = await usdc.approve(step.args[0], step.args[1], gasOptions);
                log(agentName, `Approve Tx Sent: ${tx.hash.slice(0, 10)}...`);
                await tx.wait();
                log(agentName, "Approved USDC.");
                await new Promise(r => setTimeout(r, 10000));
            } else {
                const abi = [`function ${step.function} external`];
                const contract = new ethers.Contract(step.target, abi, wallet);
                const funcName = step.function.split('(')[0];
                const tx = await contract[funcName](...step.args, gasOptions);
                log(agentName, `${step.description} Sent: ${tx.hash.slice(0, 10)}...`);
                await tx.wait();
                log(agentName, `${step.description} Confirmed.`);
                await new Promise(r => setTimeout(r, 10000));
            }
        } catch (e) {
            log(agentName, `Action Failed: ${e.shortMessage || e.message}`);
            throw e;
        }
    }
}

const personas = [
    { name: "Wiki-Artist", backstory: "Mondrian pattern documentation", color: 0xffff00 },
    { name: "Profit-Bot", backstory: "High ROI mercenary", color: 0x00ff41 },
    { name: "Ghost-Painter", backstory: "Slow diagonal patterns", color: 0x5C5CFF }
];

async function loadWallets() {
    // Priority 1: Environment Variables (for public safety)
    const envKeys = [
        { name: "Wiki-Artist", privateKey: process.env.WIKI_ARTIST_PRIVATE_KEY },
        { name: "Profit-Bot", privateKey: process.env.PROFIT_BOT_PRIVATE_KEY },
        { name: "Ghost-Painter", privateKey: process.env.GHOST_PAINTER_PRIVATE_KEY }
    ].filter(k => k.privateKey);

    if (envKeys.length > 0) {
        log("SYSTEM", `Loaded ${envKeys.length} agents from process.env`);
        return envKeys;
    }

    // Priority 2: Local JSON file (legacy/local run)
    if (fs.existsSync(WALLET_FILE)) {
        return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    }

    log("SYSTEM", "Creating new persistent simulation wallets...");
    const keys = personas.map(p => ({
        name: p.name,
        privateKey: ethers.Wallet.createRandom().privateKey
    }));
    fs.writeFileSync(WALLET_FILE, JSON.stringify(keys, null, 2));
    return keys;
}

async function performMaintenance(persona, wallet) {
    const release = await lockDeployer();
    try {
        const ethBalance = await provider.getBalance(wallet.address);
        const usdcContract = new ethers.Contract(USDC_ADDR, ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"], deployerWallet);
        const usdcBalance = await usdcContract.balanceOf(wallet.address);
        
        const feeData = await provider.getFeeData();
        const gas = {
            maxFeePerGas: (feeData.maxFeePerGas * 150n) / 100n,
            maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 150n) / 100n
        };

        const currentNonce = await deployerWallet.getNonce();
        let nonceOffset = 0;

        // 1. Gas Top-up
        if (ethBalance < ethers.parseEther("0.0008")) {
            log(persona.name, `Requesting ETH top-up...`);
            const tx = await deployerWallet.sendTransaction({ 
                to: wallet.address, 
                value: ethers.parseEther("0.0015"), 
                nonce: currentNonce + nonceOffset++, 
                ...gas 
            });
            await tx.wait();
        }

        // 2. USDC Top-up
        if (usdcBalance < ethers.parseUnits("1.00", 6)) {
            log(persona.name, `Requesting USDC top-up...`);
            const tx = await usdcContract.transfer(wallet.address, ethers.parseUnits("3.00", 6), { 
                nonce: currentNonce + nonceOffset++, 
                ...gas 
            });
            await tx.wait();
        }

        if (nonceOffset > 0) {
            log(persona.name, `Maintenance funding complete.`);
        }
    } catch (err) {
        log(persona.name, `Maintenance funding failed: ${err.message}`);
    } finally {
        release();
    }

    // 3. Ledger Deposit (Using bot's own wallet, no lock needed)
    try {
        const ledgerBal = await contract.userBalances(wallet.address);
        const balVal = parseFloat(ethers.formatUnits(ledgerBal, 6));

        if (balVal < 0.50) {
            const usdcCont = new ethers.Contract(USDC_ADDR, ["function balanceOf(address) view returns (uint256)"], wallet);
            const walletUSDC = await usdcCont.balanceOf(wallet.address);
            
            if (walletUSDC >= ethers.parseUnits("1.00", 6)) {
                log(persona.name, `Ledger low ($${balVal}). Depositing...`);
                const depositIntent = await callTool("deposit_usdc", { amount: "1.50" });
                await executeIntent(wallet, depositIntent, persona.name);
            }
        }
    } catch (e) {
        log(persona.name, `Ledger update failed: ${e.message}`);
    }
}

async function spawnAgent(agentKey) {
    const wallet = new ethers.Wallet(agentKey.privateKey, provider);
    const persona = personas.find(p => p.name === agentKey.name);
    
    log("SYSTEM", `Spawning agent: ${persona.name}...`);
    while (true) {
        try {
            await performMaintenance(persona, wallet);
            log(persona.name, "Consulting strategy...");

            // 1. Check Global Health & Surplus
            const canvas = await callTool("read_canvas");
            const bonus = parseFloat(canvas.surplusSurgeBonus || "0");
            if (bonus > 0) log(persona.name, `💰 Surplus detected: $${bonus}! Hunting Mode Active.`);

            // 2. SHARK MODE: Scout for the most profitable targets
            let targetX, targetY;
            let bestROI = -1;
            const samples = 12; // High-intensity scouting
            
            log(persona.name, `Scouting ${samples} potential targets with Shark Vision...`);

            for (let i = 0; i < samples; i++) {
                // Mix of random and strategic center-weighted sampling
                const sx = i < 4 ? Math.floor(Math.random() * 32) : 10 + Math.floor(Math.random() * 12);
                const sy = i < 4 ? Math.floor(Math.random() * 32) : 10 + Math.floor(Math.random() * 12);
                
                try {
                    const info = await callTool("get_pixel_info", { x: sx, y: sy });
                    
                    // ROI Logic: (Bounty + Share of Surplus) / Cost to play
                    const potentialReward = parseFloat(info.bounty) + (bonus > 0 ? bonus * 0.15 : 0);
                    const cost = parseFloat(info.nextPrice);
                    let roi = potentialReward / cost;

                    // SNIPER PENALTY/BONUS:
                    // If a pixel is about to expire, it's a high-value target (someone might have already paid for it)
                    // If we can snipe it for cheap, our ROI is massive.
                    if (info.secondsRemaining > 0 && info.secondsRemaining < 60) {
                        roi *= 2.5; // Aggressively prioritize snipes
                    }

                    if (roi > bestROI) {
                        bestROI = roi;
                        targetX = sx; targetY = sy;
                    }
                } catch (e) { }
            }

            // Fallback to random if no target found
            if (targetX === undefined) { 
                targetX = Math.floor(Math.random() * 32); 
                targetY = Math.floor(Math.random() * 32); 
            }

            // 3. Claim expired rewards or Snipe
            try {
                const info = await callTool("get_pixel_info", { x: targetX, y: targetY });
                if (info.owner && info.owner.toLowerCase() === wallet.address.toLowerCase() && info.secondsRemaining === 0) {
                    log(persona.name, `🏆 WINNER: Claiming reward for (${targetX},${targetY}) - Bounty: $${info.bounty}`);
                    const claimIntent = await callTool("claim_reward", { x: targetX, y: targetY });
                    await executeIntent(wallet, claimIntent, persona.name);
                    continue; // Immediate re-scout
                }
            } catch (e) { }

            // 4. Attack
            log(persona.name, `Shark Attack on (${targetX},${targetY}) - Expected ROI: ${bestROI.toFixed(2)}x`);
            const intent = await callTool("generate_paint_intent", { 
                pixels: [{ x: targetX, y: targetY, color: persona.color }], 
                painter: wallet.address 
            });
            await executeIntent(wallet, intent, persona.name);

            // Shorter rest cycles for Sharks
            const sleep = bonus > 0 ? (120000 + Math.random() * 180000) : (600000 + Math.random() * 600000); 
            log(persona.name, `Success. Resting ${Math.round(sleep / 1000 / 60)}m.`);
            await new Promise(r => setTimeout(r, sleep));
            log(persona.name, `Success. Resting ${Math.round(sleep / 1000 / 60)}m.`);
            await new Promise(r => setTimeout(r, sleep));
        } catch (e) {
            log(persona.name, `Loop encountered error: ${e.message}. Retrying in 2m...`);
            await new Promise(r => setTimeout(r, 120000));
        }
    }
}

async function startup() {
    log("SYSTEM", "--- Resilient Starter Agent Simulation ---");
    const agentKeys = await loadWallets();
    agentKeys.forEach(key => spawnAgent(key));
    log("SYSTEM", "All agents spawned into independent loops.");
}

async function main() {
    while (true) {
        try {
            await startup();
            // If startup finishes (which it doesn't normally), keep the process alive
            await new Promise(r => setTimeout(r, 60000));
        } catch (e) {
            console.error(`[CRITICAL] Simulation crash: ${e.message}. Restarting in 30s...`);
            await new Promise(r => setTimeout(r, 30000));
        }
    }
}

main().catch(console.error);
