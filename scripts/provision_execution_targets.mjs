import pkg from 'hardhat';
const { ethers } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: '.env.mainnet' });

async function main() {
    const rpcUrl = process.env.RPC_URL || "https://mainnet.base.org";
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.PIXELGRID_ADDRESS || "0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC";

    if (!privateKey) throw new Error("Missing PRIVATE_KEY in .env.mainnet");

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`\n[Target Provisioner] Operator Identity: ${wallet.address}`);
    console.log(`[Target Provisioner] Target Contract: ${contractAddress}\n`);

    const abi = [
        "function userBalances(address) external view returns (uint256)",
        "function getPixelInfo(uint256, uint256) external view returns (address, uint32, uint256, uint256, uint256, uint8)",
        "function setPixels(uint256[], uint256[], uint32[]) external",
        "function depositUSDC(uint256) external",
        "function usdc() external view returns (address)"
    ];
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    const erc20Abi = [
        "function approve(address, uint256) external returns (bool)",
        "function balanceOf(address) external view returns (uint256)"
    ];
    const usdcAddr = await contract.usdc();
    const usdc = new ethers.Contract(usdcAddr, erc20Abi, wallet);

    // Ensure we have at least 10 USDC internally to fund the target operations
    const requiredDeposit = ethers.parseUnits("10", 6);
    const currentBal = await contract.userBalances(wallet.address);
    
    if (currentBal < requiredDeposit) {
        console.log(`[System] Internal ledger low. Depositing 10 USDC to fund execution targets...`);
        const approveTx = await usdc.approve(contractAddress, requiredDeposit);
        await approveTx.wait();
        const depositTx = await contract.depositUSDC(requiredDeposit);
        await depositTx.wait();
        console.log(`[System] Deposit complete.\n`);
    }

    // Provision an institutional spread of targets with varied bait levels
    const targets = [
        // Alpha Tier (~$1.15 bounties, 0.54 cost)
        { x: 16, y: 16, name: "Alpha Core (High EV)", paints: 8 },
        { x: 8, y: 8, name: "Beta Node (High EV)", paints: 8 },
        // Mid Tier (~$0.55 bounties, 0.16 cost)
        { x: 16, y: 8, name: "Delta Link (Mid EV)", paints: 5 },
        { x: 8, y: 16, name: "Echo Link (Mid EV)", paints: 5 },
        { x: 24, y: 24, name: "Zeta Node (Mid EV)", paints: 5 },
        // Low Tier (~$0.28 bounties, 0.13 cost)
        { x: 4, y: 4, name: "Scout 1 (Low EV)", paints: 3 },
        { x: 28, y: 28, name: "Scout 2 (Low EV)", paints: 3 },
        { x: 4, y: 28, name: "Scout 3 (Low EV)", paints: 3 },
        { x: 28, y: 4, name: "Scout 4 (Low EV)", paints: 3 }
    ];

    for (const target of targets) {
        console.log(`⚙️ Provisioning Target at [${target.x}, ${target.y}] - ${target.name}`);
        
        let xs = Array(target.paints).fill(target.x);
        let ys = Array(target.paints).fill(target.y);
        let colors = Array(target.paints).fill(0x00FF00); // System Green
        
        console.log(`   Applying target load (${target.paints} actions)...`);
        const tx = await contract.setPixels(xs, ys, colors);
        console.log(`   Tx Submitted! Waiting for network confirmation... (${tx.hash})`);
        await tx.wait();

        const info = await contract.getPixelInfo(target.x, target.y);
        console.log(`   ✅ Target Initialized.`);
        console.log(`   💰 Locked Execution Bounty: $${ethers.formatUnits(info[4], 6)}`);
        console.log(`   🛡️ EV Benchmark Price: $${ethers.formatUnits(info[3], 6)}\n`);
    }

    console.log(`🚀 All targets provisioned. The execution grid is ready for agent interaction.`);
}

main().catch(console.error);
