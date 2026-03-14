import pkg from 'hardhat';
const { ethers } = pkg;
import dotenv from 'dotenv';
import fs from 'fs';

// Look for .env.mainnet for credentials
dotenv.config({ path: '.env.mainnet' });

const OWNER_ADDRESS = process.env.OWNER_ADDRESS;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("==========================================");
    console.log("PRODUCTION DEPLOYMENT: PixelGridV5_Diamond");
    console.log("==========================================");
    console.log("Deployer:", deployer.address);
    console.log("Ownership Target:", OWNER_ADDRESS);
    
    if (!OWNER_ADDRESS) {
        throw new Error("OWNER_ADDRESS not set in .env.mainnet — cannot deploy without a transfer target.");
    }

    // Official Base Mainnet USDC Address
    const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    
    // Safety Check: Verify balance for gas
    const ethBal = await ethers.provider.getBalance(deployer.address);
    console.log("ETH Balance:", ethers.formatEther(ethBal));
    
    if (ethBal < ethers.parseEther("0.0005")) {
        console.error("⛔ ABORT: Low ETH balance. Need at least 0.0005 ETH for Base L2 deployment gas.");
        process.exit(1);
    }

    // --- Phase A: Deploy ---
    const Grid = await ethers.getContractFactory("PixelGridV5_Diamond");
    
    console.log("\n📡 Deploying contract...");
    const grid = await Grid.deploy(usdcAddress);
    
    console.log("⏳ Waiting for block confirmations...");
    await grid.waitForDeployment();

    const addr = await grid.getAddress();
    console.log("✅ PixelGridV5_Diamond deployed to:", addr);
    console.log("   Network: Base Mainnet");
    console.log("   USDC Token:", usdcAddress);
    
    // Verify Initial State
    const ownerOnChain = await grid.owner();
    console.log("   Owner (deployer):", ownerOnChain);

    // --- Phase B: Transfer Ownership ---
    console.log("\n🔑 Transferring ownership to:", OWNER_ADDRESS);
    const tx = await grid.transferOwnership(OWNER_ADDRESS);
    await tx.wait();
    
    const newOwner = await grid.owner();
    console.log("✅ Ownership transferred! New owner:", newOwner);
    
    if (newOwner.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) {
        console.error("⛔ CRITICAL: Ownership transfer mismatch!");
        process.exit(1);
    }

    // --- Summary ---
    console.log("\n==========================================");
    console.log("🚀 DEPLOYMENT COMPLETE");
    console.log("==========================================");
    console.log("Contract:", addr);
    console.log("Owner:", newOwner);
    console.log("USDC:", usdcAddress);
    console.log("\nNEXT STEPS:");
    console.log("1. Verify on BaseScan:");
    console.log(`   npx hardhat verify --network base-mainnet ${addr} "${usdcAddress}"`);
    console.log("2. Seed the reservoir (from the OWNER wallet):");
    console.log(`   Approve + call seedReservoir($20 USDC) on ${addr}`);
    console.log("3. Update Railway CONTRACT_ADDRESS to:", addr);
    console.log("4. Update Vercel frontend env to:", addr);
}

main().catch((error) => {
    console.error("DEPLOYMENT FAILED:", error);
    process.exitCode = 1;
});
