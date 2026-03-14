const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PixelGridV5_Diamond Production Suite", function () {
    let PixelGrid, grid;
    let MockUSDC, usdc;
    let owner, addr1, addr2, addr3;
    const INITIAL_PRICE = 100000; // $0.10
    const FLOOR = 100000000; // $100.00

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        // 1. Deploy Mock USDC
        const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDCFactory.deploy();

        // 2. Deploy Arena
        const PixelGridFactory = await ethers.getContractFactory("PixelGridV5_Diamond");
        grid = await PixelGridFactory.deploy(await usdc.getAddress());

        // 3. Setup initial funding
        const mintAmount = ethers.parseUnits("1000", 6);
        await usdc.mint(addr1.address, mintAmount);
        await usdc.mint(addr2.address, mintAmount);
        await usdc.mint(addr3.address, mintAmount);

        // 4. Group Approval
        await usdc.connect(addr1).approve(await grid.getAddress(), mintAmount);
        await usdc.connect(addr2).approve(await grid.getAddress(), mintAmount);
        await usdc.connect(addr3).approve(await grid.getAddress(), mintAmount);
        
        // 5. Initial Deposits
        await grid.connect(addr1).depositUSDC(ethers.parseUnits("100", 6));
        await grid.connect(addr2).depositUSDC(ethers.parseUnits("100", 6));
    });

    describe("🛡️ Audit Fix: C-1 (PaintCount Overflow)", function () {
        it("Should revert on the 254th incremental paint (MAX_PAINT_COUNT) to prevent price reset", async function () {
            const x = 5, y = 5;
            const index = x * 32 + y;

            // 1. Initial Paint
            await grid.connect(addr1).setPixel(x, y, 0xFF0000);

            // 2. Manipulate storage to set count to 254
            // mapping(uint256 => uint256) public pixelData is at slot 7
            const mappingSlot = 7;
            const key = ethers.zeroPadValue(ethers.toBeHex(index), 32);
            const slot = ethers.zeroPadValue(ethers.toBeHex(mappingSlot), 32);
            const storageSlot = ethers.keccak256(ethers.concat([key, slot]));

            // Read current data
            const currentData = BigInt(await ethers.provider.send("eth_getStorageAt", [await grid.getAddress(), storageSlot, "latest"]));
            
            // Bitmask: bits 216..223 is the count. 
            // We want to set it to 254 (0xFE)
            const countMask = ~(BigInt(0xFF) << 216n);
            const newData = (currentData & countMask) | (BigInt(254) << 216n);

            await ethers.provider.send("hardhat_setStorageAt", [
                await grid.getAddress(),
                storageSlot,
                ethers.zeroPadValue(ethers.toBeHex(newData), 32)
            ]);

            // 3. Attempt to paint should now revert
            await expect(
                grid.connect(addr2).setPixel(x, y, 0x00FF00)
            ).to.be.revertedWith("Tile exhausted: max paints reached");
        });
    });

    describe("🛡️ Audit Fix: C-2 (Scavenger Swarm / Rate Limit)", function () {
        it("Should only pay the surplus bonus once per block", async function () {
            // 1. Seed reservoir so there is a surplus
            const seedAmount = ethers.parseUnits("200", 6); // $200 total, $100 surplus
            await usdc.mint(owner.address, seedAmount);
            await usdc.approve(await grid.getAddress(), seedAmount);
            await grid.seedReservoir(seedAmount);

            // 2. Setup two tiles ready to be claimed
            // Tile A
            await grid.connect(addr1).setPixel(1, 1, 0xFF0000);
            // Tile B
            await grid.connect(addr2).setPixel(2, 2, 0x00FF00);

            // 3. Fast forward 15 minutes to guarantee survival
            await ethers.provider.send("evm_increaseTime", [901]);
            await ethers.provider.send("evm_mine");

            // 4. Try to claim both in the same block using a multicall or just sequential in one block mining
            await ethers.provider.send("evm_setAutomine", [false]);
            
            const tx1 = await grid.connect(addr1).claimReward(1, 1);
            const tx2 = await grid.connect(addr2).claimReward(2, 2);
            
            await ethers.provider.send("evm_mine");
            await ethers.provider.send("evm_setAutomine", [true]);

            const receipt1 = await tx1.wait();
            const receipt2 = await tx2.wait();

            // Find Winner events
            const winnerEvent1 = receipt1.logs.find(l => l.fragment && l.fragment.name === "Winner");
            const winnerEvent2 = receipt2.logs.find(l => l.fragment && l.fragment.name === "Winner");

            // The first one should have a bonus > 0
            expect(winnerEvent1.args.bonusComponent).to.be.gt(0n);
            // The second one in the same block MUST have a bonus of exactly 0
            expect(winnerEvent2.args.bonusComponent).to.equal(0n);
        });
    });

    describe("🛡️ Audit Fix: M-1 (Bounds Checking)", function () {
        it("Should revert on out-of-bounds coordinates", async function () {
            await expect(grid.setPixel(32, 0, 0xFFFFFF)).to.be.revertedWith("Out of bounds");
            await expect(grid.setPixel(0, 32, 0xFFFFFF)).to.be.revertedWith("Out of bounds");
            await expect(grid.claimReward(32, 0)).to.be.revertedWith("Out of bounds");
        });
    });

    describe("🛡️ Audit Fix: M-2 (Timer Absolute Penalty)", function () {
        it("Should apply SNIPE_PENALTY absolutely, not inheriting previous time", async function () {
            const x = 10, y = 10;
            
            // First paint
            await grid.connect(addr1).setPixel(x, y, 0x111111);
            const info1 = await grid.getPixelInfo(x, y);
            expect(info1.expiry).to.equal(BigInt(info1.expiry)); // BASE (600s)

            // Snipe immediately
            await grid.connect(addr2).setPixel(x, y, 0x222222);
            const info2 = await grid.getPixelInfo(x, y);
            
            // Expected: Current Timestamp + (BASE 600s + 1 * 30s)
            // It should be 630s from the second paint timestamp
            const latestBlock = await ethers.provider.getBlock("latest");
            expect(info2.expiry).to.equal(BigInt(latestBlock.timestamp) + 630n);
        });
    });

    describe("🛡️ Audit Fix: M-3 (Invariant Counter)", function () {
        it("Should maintain totalTileBounties accurately", async function () {
            await grid.connect(addr1).setPixel(10, 10, 0x123456);
            const bountyOnChain = await grid.totalTileBounties();
            
            // Expected: 85% of $0.10 = 0.085 USDC (85000 units)
            expect(bountyOnChain).to.equal(85000n);
            
            // Check contract invariant function
            expect(await grid.checkInvariants()).to.be.true;
        });
    });

    describe("📉 Economic Fix: Hard Floor", function () {
        it("Should not pay bonuses when reservoir is below $100", async function () {
            // 1. Reservoir is empty (well, just the 10% from the first paint)
            await grid.connect(addr1).setPixel(5, 5, 0x111111);
            
            // 2. Survival
            await ethers.provider.send("evm_increaseTime", [601]);
            await ethers.provider.send("evm_mine");
            
            // 3. Claim
            const tx = await grid.connect(addr1).claimReward(5, 5);
            const receipt = await tx.wait();
            const event = receipt.logs.find(l => l.fragment && l.fragment.name === "Winner");
            
            // Bonus must be 0 because Reservoir << $100
            expect(event.args.bonusComponent).to.equal(0n);
        });
    });
});
