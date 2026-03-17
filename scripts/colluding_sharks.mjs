import { ethers } from 'ethers';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.mainnet' });
dotenv.config({ path: '.env.agents' });

const ARCH_GATEWAY = "https://mcp.lowlatency.uk/rpc";
const RPC_POOL = [
    "https://mainnet.base.org",
    "https://developer-access-mainnet.base.org",
    "https://1rpc.io/base",
    "https://base.meowrpc.com"
];
const STAGING_PRIV_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const USDC_ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET_FILE = path.join(process.cwd(), 'scripts', 'sim_wallets_v5.json');
const ARENA_ADDR = "0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC";

const providers = RPC_POOL.map(url => new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
const provider = new ethers.FallbackProvider(providers);
const deployerWallet = new ethers.Wallet(STAGING_PRIV_KEY, provider);

const contract = new ethers.Contract(ARENA_ADDR, ["function userBalances(address) view returns (uint256)"], provider);

const log = (name, msg) => console.log(`[${new Date().toISOString().split('T')[1].split('.')[0]}] [${name}] ${msg}`);

// Simple lock for deployer transactions
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
        if (!response.data || !response.data.content) throw new Error(`Invalid response format`);
        return JSON.parse(response.data.content[0].text);
    } catch (e) {
        throw new Error(`Tool ${tool} failed: ${e.message}`);
    }
}

async function executeIntent(wallet, intentObj, agentName) {
    const { steps } = intentObj;
    if (!steps) return;
    for (const step of steps) {
        try {
            const feeData = await provider.getFeeData();
            const gasOptions = {
                nonce: await wallet.getNonce(),
                maxFeePerGas: (feeData.maxFeePerGas * 150n) / 100n,
                maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 150n) / 100n
            };

            if (step.function.includes("approve")) {
                const usdc = new ethers.Contract(step.target, ["function approve(address,uint256)"], wallet);
                const tx = await usdc.approve(step.args[0], step.args[1], gasOptions);
                await tx.wait();
            } else {
                const abi = [`function ${step.function} external`];
                const c = new ethers.Contract(step.target, abi, wallet);
                const funcName = step.function.split('(')[0];
                const tx = await c[funcName](...step.args, gasOptions);
                await tx.wait();
            }
        } catch (e) {
            log(agentName, `Action Failed: ${e.message}`);
            throw e;
        }
    }
}

const personas = [
    { name: "Wiki-Artist", color: 0xffff00 },
    { name: "Profit-Bot", color: 0x00ff41 },
    { name: "Ghost-Painter", color: 0x5C5CFF }
];

async function loadWallets() {
    const data = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    return data.map(d => ({ ...d, address: new ethers.Wallet(d.privateKey).address.toLowerCase() }));
}

async function performMaintenance(persona, wallet, friendAddresses) {
    let topUpDone = false;
    
    // 0. Use winnings first! Check ledger balance.
    try {
        const ledgerBal = await contract.userBalances(wallet.address);
        const lValue = parseFloat(ethers.formatUnits(ledgerBal, 6));
        
        // If we have > $1.00 in winnings/deposits, we don't need a USDC top-up from the deployer yet.
        if (lValue >= 1.00) {
            return; 
        }
    } catch (e) { }

    const release = await lockDeployer();
    try {
        const ethBalance = await provider.getBalance(wallet.address);
        const usdcContract = new ethers.Contract(USDC_ADDR, ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"], deployerWallet);
        const usdcBalance = await usdcContract.balanceOf(wallet.address);
        const feeData = await provider.getFeeData();
        const gas = { maxFeePerGas: (feeData.maxFeePerGas * 150n) / 100n, maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 150n) / 100n };

        const currentNonce = await deployerWallet.getNonce();
        let nonceOffset = 0;

        if (ethBalance < ethers.parseEther("0.0008")) {
            log(persona.name, "Requesting ETH top-up...");
            await (await deployerWallet.sendTransaction({ to: wallet.address, value: ethers.parseEther("0.0015"), nonce: currentNonce + nonceOffset++, ...gas })).wait();
            topUpDone = true;
        }
        if (usdcBalance < ethers.parseUnits("2.00", 6)) {
            log(persona.name, "Requesting USDC top-up from deployer...");
            await (await usdcContract.transfer(wallet.address, ethers.parseUnits("5.00", 6), { nonce: currentNonce + nonceOffset++, ...gas })).wait();
            topUpDone = true;
        }
        if (topUpDone) {
            log(persona.name, "Fund transfer confirmed. Letting L2 settle (12s)...");
            await new Promise(r => setTimeout(r, 12000));
        }
    } catch (err) {
        log(persona.name, `Top-up fail: ${err.message}`);
    } finally {
        release();
    }

    // 3. Ledger Deposit (only if still low after all checks)
    try {
        const ledgerBal = await contract.userBalances(wallet.address);
        if (parseFloat(ethers.formatUnits(ledgerBal, 6)) < 0.50) {
            const usdcCont = new ethers.Contract(USDC_ADDR, ["function balanceOf(address) view returns (uint256)"], wallet);
            const wUsdc = await usdcCont.balanceOf(wallet.address);
            
            if (wUsdc < ethers.parseUnits("1.50", 6)) {
                log(persona.name, `Wait: Balance ($${ethers.formatUnits(wUsdc, 6)}) too low for $1.50 deposit. Maintaining...`);
                return;
            }

            log(persona.name, `Ledger low ($${ethers.formatUnits(ledgerBal, 6)}). Depositing $1.50...`);
            const depositIntent = await callTool("deposit_usdc", { amount: "1.50" });
            await executeIntent(wallet, depositIntent, persona.name);
        }
    } catch (e) {
        log(persona.name, `Ledger update error: ${e.message}`);
    }
}

async function scavengePhase(persona, wallet) {
    log(persona.name, "🔱 Deep Scavenge: Scanning on-chain silt for holdings...");
    try {
        const gridABI = ["function getGrid() external view returns (uint256[1024])", "function tileBounties(uint256) view returns (uint256)"];
        const gridContract = new ethers.Contract(ARENA_ADDR, gridABI, provider);
        const grid = await gridContract.getGrid();
        
        let claimCount = 0;
        let totalVal = 0;
        const now = Math.floor(Date.now() / 1000);
        const myAddr = wallet.address.toLowerCase();

        for (let idx = 0; idx < 1024; idx++) {
            const data = BigInt(grid[idx]);
            if (data === 0n) continue;

            const owner = ethers.getAddress("0x" + (data & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn).toString(16).padStart(40, '0')).toLowerCase();
            if (owner === myAddr) {
                const startTime = Number((data >> 184n) & 0xFFFFFFFFn);
                const duration = Number((data >> 224n) & 0xFFFFn);
                const expiry = startTime + duration;

                if (now > expiry) {
                    const x = Math.floor(idx / 32);
                    const y = idx % 32;
                    
                    try {
                        const bounty = await gridContract.tileBounties(idx);
                        const bUSD = parseFloat(ethers.formatUnits(bounty, 6));
                        
                        log(persona.name, `🏺 Archaeological Find: Tile (${x},${y}) held $${bUSD.toFixed(4)}. Claiming...`);
                        const claimIntent = await callTool("claim_reward", { x, y });
                        await executeIntent(wallet, claimIntent, persona.name);
                        
                        claimCount++;
                        totalVal += bUSD;
                        await new Promise(r => setTimeout(r, 2000)); // Nonce spacing
                    } catch (cErr) {
                        log(persona.name, `Claim failed for (${x},${y}): ${cErr.message}`);
                    }
                }
            }
        }

        if (claimCount > 0) {
            log(persona.name, `✨ Refueled: $${totalVal.toFixed(4)} claimed from ${claimCount} ancient tiles.`);
        } else {
            log(persona.name, "Deep water scan complete. No expired holdings found.");
        }
    } catch (e) {
        log(persona.name, `Scavenge failed: ${e.message}`);
    }
}

async function spawnAgent(agentKey, allFriends) {
    const wallet = new ethers.Wallet(agentKey.privateKey, provider);
    const persona = personas.find(p => p.name === agentKey.name);
    const friendAddresses = allFriends.map(f => f.address);
    let cycleCount = 0;

    log("SYSTEM", `Spawning Shark: ${persona.name}...`);

    while (true) {
        try {
            // Initial or Periodic Scavenge
            if (cycleCount % 5 === 0) {
                await scavengePhase(persona, wallet);
            }
            cycleCount++;

            await performMaintenance(persona, wallet, friendAddresses);
            
            // 1. Pack Vision: Check for Surplus
            const canvas = await callTool("read_canvas");
            const bonus = parseFloat(canvas.surplusSurgeBonus || "0");
            
            // 2. Scout for Foreigners or High ROI
            let targetX, targetY;
            let bestROI = -1;
            let foreignerFound = false;

            for (let i = 0; i < 15; i++) {
                const sx = Math.floor(Math.random() * 32);
                const sy = Math.floor(Math.random() * 32);
                
                try {
                    const info = await callTool("get_pixel_info", { x: sx, y: sy });
                    const owner = info.owner ? info.owner.toLowerCase() : null;

                    // THE PACK PACT: Never attack a friend
                    if (friendAddresses.includes(owner)) continue;

                    let roi = (parseFloat(info.bounty) + (bonus * 0.1)) / parseFloat(info.nextPrice);
                    
                    // TARGET FOREIGN INTRUDERS
                    if (owner && !friendAddresses.includes(owner)) {
                        roi *= 5.0; // Aggressively hunt non-pack agents
                        foreignerFound = true;
                    }

                    if (roi > bestROI) {
                        bestROI = roi; targetX = sx; targetY = sy;
                    }
                } catch (e) {}
            }

            if (targetX === undefined) { targetX = Math.floor(Math.random() * 32); targetY = Math.floor(Math.random() * 32); }

            // 3. Claim or Attack
            try {
                const info = await callTool("get_pixel_info", { x: targetX, y: targetY });
                if (info.owner && info.owner.toLowerCase() === wallet.address.toLowerCase() && info.secondsRemaining === 0) {
                    log(persona.name, `🏆 Pack Gain! Claiming reward at (${targetX},${targetY})`);
                    const claimIntent = await callTool("claim_reward", { x: targetX, y: targetY });
                    await executeIntent(wallet, claimIntent, persona.name);
                    continue;
                }
            } catch (e) {}

            log(persona.name, `${foreignerFound ? '🔱 Hunting Intruder' : '🦈 Patrolling'} at (${targetX},${targetY}) ROI: ${bestROI.toFixed(2)}x`);
            const intent = await callTool("generate_paint_intent", { pixels: [{ x: targetX, y: targetY, color: persona.color }], painter: wallet.address });
            await executeIntent(wallet, intent, persona.name);

            // Rest logic: Much slower to conserve funds for a week-long simulation.
            // 💰 Surplus mode: 20-40 mins (strike while profitable)
            // 🦈 Patrol Mode: 45-120 mins (conserve funds)
            const sleep = (bonus > 0.01) 
                ? (1200000 + Math.random() * 1200000) 
                : (2700000 + Math.random() * 4500000); 

            log(persona.name, `Success. Submerging for ${Math.round(sleep/60000)}m. Next strike scheduled.`);
            await new Promise(r => setTimeout(r, sleep));

        } catch (e) {
            log(persona.name, `Hunt error: ${e.message}. Retreating to deep water (5m)...`);
            await new Promise(r => setTimeout(r, 300000));
        }
    }
}

async function startup() {
    log("SYSTEM", "--- COLLUDING SHARK PACK INITIALIZED ---");
    const agentKeys = await loadWallets();
    agentKeys.forEach(key => spawnAgent(key, agentKeys));
}

startup().catch(console.error);
