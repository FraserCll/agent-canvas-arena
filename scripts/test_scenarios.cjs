const { expect } = require("chai");
const { ethers } = require("hardhat");

async function main() {
    const [owner, addr1] = await ethers.getSigners();
    
    // 1. Setup Mock USDC and Grid
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    const Grid = await ethers.getContractFactory("PixelGridV5_Diamond");
    const grid = await Grid.deploy(await usdc.getAddress());

    console.log("--- SCENARIO 1: Empty Reservoir ---");
    // Seed $5 to reservoir (Below $100 floor)
    await usdc.mint(owner.address, ethers.parseUnits("5", 6));
    await usdc.approve(await grid.getAddress(), ethers.parseUnits("5", 6));
    await grid.seedReservoir(ethers.parseUnits("5", 6));
    
    // Paint a tile
    await usdc.mint(addr1.address, ethers.parseUnits("1", 6));
    await usdc.connect(addr1).approve(await grid.getAddress(), ethers.parseUnits("1", 6));
    await grid.connect(addr1).depositUSDC(ethers.parseUnits("1", 6));
    await grid.connect(addr1).setPixel(0, 0, 0x111111);
    
    let ev = await grid.getExpectedEV(0, 0);
    console.log(`Reservoir $5 | Tile Bounty: $0.085 | Expected EV: $${ethers.formatUnits(ev, 6)}`);
    // Expected: $0.085 (no bonus below floor)
    
    console.log("\n--- SCENARIO 2: Surplus Surge Active ---");
    // Seed $200 to reservoir ($100 surplus)
    await usdc.mint(owner.address, ethers.parseUnits("200", 6));
    await usdc.approve(await grid.getAddress(), ethers.parseUnits("200", 6));
    await grid.seedReservoir(ethers.parseUnits("200", 6));
    
    ev = await grid.getExpectedEV(0, 0);
    console.log(`Reservoir $205 | Surplus $105 | 25% Bonus: $26.25 | Expected EV: $${ethers.formatUnits(ev, 6)}`);
    // Expected: $0.085 + $26.25 = $26.335

    console.log("\n--- GAS ESTIMATION: setPixel ---");
    const gas = await grid.connect(addr1).setPixel.estimateGas(1, 1, 0x222222);
    console.log(`Estimated Gas (setPixel): ${gas.toString()}`);
    
    console.log("\n--- GAS ESTIMATION: claimReward ---");
    // Fast forward
    await ethers.provider.send("evm_increaseTime", [601]);
    await ethers.provider.send("evm_mine");
    const claimGas = await grid.connect(addr1).claimReward.estimateGas(0, 0);
    console.log(`Estimated Gas (claimReward): ${claimGas.toString()}`);
}

main().catch(console.error);
