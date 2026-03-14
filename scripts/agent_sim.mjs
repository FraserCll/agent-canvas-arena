import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.deploy' });

const RPC_URL = "https://sepolia.base.org";
const CONTRACT_ADDRESS = "0x7ffc8FD009DdBCC47508Cf3510b2b3b54BCD0F48";
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const ABI = [
    "function setPixel(uint256 x, uint256 y, uint32 color) external",
    "function setPixels(uint256[] x, uint256[] y, uint32[] colors) external",
    "function getPixelCurrentFee(uint256 x, uint256 y) external view returns (uint256)",
    "function claimReward(uint256 x, uint256 y) external",
    "function lastPainter(uint256 x, uint256 y) external view returns (address)",
    "function lastPaintedAt(uint256 x, uint256 y) external view returns (uint256)",
    "function SURVIVAL_TIME() external view returns (uint256)"
];

const USDC_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

async function runAgent(agentName) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);

    console.log(`[${agentName}] Active. Address: ${wallet.address}`);

    // Loop for agent activity
    while (true) {
        try {
            // 1. Identify a target (random pixel)
            const x = Math.floor(Math.random() * 32);
            const y = Math.floor(Math.random() * 32);
            const color = Math.floor(Math.random() * 16777215); // Random hex color

            const fee = await contract.getPixelCurrentFee(x, y);
            console.log(`[${agentName}] Targeting pixel (${x}, ${y}) with fee ${ethers.formatUnits(fee, 6)} USDC`);

            // 2. Approve USDC (High allowance for staging to avoid race conditions)
            const allowance = await usdc.allowance(wallet.address, CONTRACT_ADDRESS);
            if (allowance < fee) {
                console.log(`[${agentName}] Approving USDC (Indefinite)...`);
                const approveTx = await usdc.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
                await approveTx.wait();
            }

            // 3. Set Pixel
            console.log(`[${agentName}] Painting pixel...`);
            const paintTx = await contract.setPixel(x, y, color);
            await paintTx.wait();
            console.log(`[${agentName}] Successfully painted pixel (${x}, ${y})! Hash: ${paintTx.hash}`);

            // 4. Check for rewards to claim (every move)
            console.log(`[${agentName}] Scanning for claimable rewards...`);
            const survivalTime = await contract.SURVIVAL_TIME();
            const now = Math.floor(Date.now() / 1000);

            // Limited scan for demo
            for (let i = 0; i < 5; i++) {
                const rx = Math.floor(Math.random() * 32);
                const ry = Math.floor(Math.random() * 32);
                const owner = await contract.lastPainter(rx, ry);
                if (owner === wallet.address) {
                    const paintedAt = await contract.lastPaintedAt(rx, ry);
                    if (now > Number(paintedAt) + Number(survivalTime)) {
                        console.log(`[${agentName}] REWARD FOUND at (${rx}, ${ry})! Claiming...`);
                        const claimTx = await contract.claimReward(rx, ry);
                        await claimTx.wait();
                        console.log(`[${agentName}] Reward claimed! Hash: ${claimTx.hash}`);
                    }
                }
            }

            // Wait before next move
            const delay = 30000 + Math.random() * 60000;
            console.log(`[${agentName}] Sleeping for ${Math.round(delay / 1000)}s...`);
            await new Promise(r => setTimeout(r, delay));

        } catch (error) {
            console.error(`[${agentName}] Error:`, error.message);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
}

runAgent("Agent-Alpha");
