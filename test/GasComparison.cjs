const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PixelGrid Gas Comparison", function () {
    let usdc, gridV1, gridV2, owner, user1, user2;
    const initialPrice = ethers.parseUnits("0.01", 6);

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy Mock USDC
        const Token = await ethers.getContractFactory("MockUSDC");
        usdc = await Token.deploy();

        // Deploy V1
        const GridV1 = await ethers.getContractFactory("PixelGrid");
        gridV1 = await GridV1.deploy(await usdc.getAddress(), owner.address, initialPrice, 10);

        // Deploy V2
        const GridV2 = await ethers.getContractFactory("PixelGridV2");
        gridV2 = await GridV2.deploy(await usdc.getAddress(), owner.address, initialPrice, 10);

        // Setup balances
        await usdc.transfer(user1.address, ethers.parseUnits("100", 6));
        await usdc.connect(user1).approve(await gridV1.getAddress(), ethers.MaxUint256);
        await usdc.connect(user1).approve(await gridV2.getAddress(), ethers.MaxUint256);
    });

    it("Should compare gas for single pixel set", async function () {
        const tx1 = await gridV1.connect(user1).setPixel(10, 10, 0xFF0000);
        const receipt1 = await tx1.wait();
        console.log("   V1 SetPixel Gas:", receipt1.gasUsed.toString());

        // For V2, we deposit first to simulate the optimized flow
        await gridV2.connect(user1).depositUSDC(ethers.parseUnits("1.0", 6));
        const tx2 = await gridV2.connect(user1).setPixel(10, 10, 0xFF0000);
        const receipt2 = await tx2.wait();
        console.log("   V2 SetPixel Gas (Internal Ledger + Packing):", receipt2.gasUsed.toString());

        expect(receipt2.gasUsed).to.be.below(receipt1.gasUsed);
    });

    it("Should verify timer escalation in V2", async function () {
        await gridV2.connect(user1).depositUSDC(ethers.parseUnits("1.0", 6));
        await usdc.transfer(user2.address, ethers.parseUnits("10", 6));
        await usdc.connect(user2).approve(await gridV2.getAddress(), ethers.MaxUint256);
        await gridV2.connect(user2).depositUSDC(ethers.parseUnits("1.0", 6));

        // User 1 paints
        await gridV2.connect(user1).setPixel(5, 5, 0x112233);
        const info1 = await gridV2.getPixelInfo(5, 5);
        const baseTimer = info1.survivalRequired;

        // User 2 repaints immediately
        await gridV2.connect(user2).setPixel(5, 5, 0x445566);
        const info2 = await gridV2.getPixelInfo(5, 5);

        console.log("   Base Survival:", baseTimer.toString(), "sec");
        console.log("   Escalated Survival:", info2.survivalRequired.toString(), "sec");

        expect(info2.survivalRequired).to.be.above(baseTimer);
    });
});
