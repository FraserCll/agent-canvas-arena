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

    // Ensure we have at least 5 USDC internally to fund the target operations
    const requiredDeposit = ethers.parseUnits("5", 6);
    const currentBal = await contract.userBalances(wallet.address);
    
    if (currentBal < requiredDeposit) {
        console.log(`[System] Internal ledger low. Depositing 5 USDC to fund execution targets...`);
        const approveTx = await usdc.approve(contractAddress, requiredDeposit);
        await approveTx.wait();
        const depositTx = await contract.depositUSDC(requiredDeposit);
        await depositTx.wait();
        console.log(`[System] Deposit complete.\n`);
    }

    // TARGETS
    // Provision specific nodes for agent testing protocols
    const targets = [
        { x: 16, y: 16, name: "Alpha Node" },
        { x: 8, y: 8, name: "Beta Node" }
    ];

    const TARGET_PAINTS = 8; // 8 sequential paints securely halts below Tier 3 thresholds

    for (const target of targets) {
        console.log(`⚙️ Provisioning Target at [${target.x}, ${target.y}] - ${target.name}`);
        
        let xs = Array(TARGET_PAINTS).fill(target.x);
        let ys = Array(TARGET_PAINTS).fill(target.y);
        let colors = Array(TARGET_PAINTS).fill(0x00FF00); // System Green
        
        console.log(`   Applying target load...`);
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
