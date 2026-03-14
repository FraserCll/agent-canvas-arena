import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const USDC_ADDRESS = process.env.USDC_ADDRESS;
    const PAYOUT_ADDRESS = process.env.PAYOUT_ADDRESS;

    if (!USDC_ADDRESS || !PAYOUT_ADDRESS) {
        throw new Error("Missing USDC_ADDRESS or PAYOUT_ADDRESS in .env");
    }

    console.log("Deploying PixelGrid to Base Mainnet...");
    const PixelGrid = await ethers.getContractFactory("PixelGrid");
    const pixelGrid = await PixelGrid.deploy(USDC_ADDRESS, PAYOUT_ADDRESS);

    await pixelGrid.deployed();

    console.log("PixelGrid deployed to:", pixelGrid.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
