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

    console.log(`[${agentName}] Active. Batch-Strategy. Address: ${wallet.address}`);

    while (true) {
        try {
            // Batch strategy: Paint 3 pixels in one row
            const x_base = Math.floor(Math.random() * 32);
            const y_base = Math.floor(Math.random() * 29); // Prevent out of bounds for y+2
            const color = Math.floor(Math.random() * 16777215);

            const xs = [x_base, x_base, x_base];
            const ys = [y_base, y_base + 1, y_base + 2];
            const colors = [color, color, color];

            let totalFee = 0n;
            for (let i = 0; i < xs.length; i++) {
                totalFee += await contract.getPixelCurrentFee(xs[i], ys[i]);
            }

            console.log(`[${agentName}] Batch painting row starting at (${x_base}, ${y_base}) with fee ${ethers.formatUnits(totalFee, 6)} USDC`);

            // 2. Approve USDC (High allowance for staging)
            const allowance = await usdc.allowance(wallet.address, CONTRACT_ADDRESS);
            if (allowance < totalFee) {
                console.log(`[${agentName}] Approving USDC (Indefinite)...`);
                const approveTx = await usdc.approve(CONTRACT_ADDRESS, ethers.MaxUint256);
                await approveTx.wait();
            }

            // 3. Set Pixels (Batch)
            console.log(`[${agentName}] Painting pixels batch...`);
            const paintTx = await contract.setPixels(xs, ys, colors);
            await paintTx.wait();
            console.log(`[${agentName}] Successfully painted batch! Hash: ${paintTx.hash}`);

            // 4. Check for rewards to claim (every move)
            const survivalTime = await contract.SURVIVAL_TIME();
            const now = Math.floor(Date.now() / 1000);

            for (let rx = 0; rx < 32; rx++) {
                for (let ry = 0; ry < 32; ry++) {
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
            }

            // Wait before next move
            const delay = 60000 + Math.random() * 120000;
            console.log(`[${agentName}] Sleeping for ${Math.round(delay / 1000)}s...`);
            await new Promise(r => setTimeout(r, delay));

        } catch (error) {
            console.error(`[${agentName}] Error:`, error.message);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
}

runAgent("Agent-Beta");
