import pkg from 'hardhat';
const { ethers } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '.env.deploy' });

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying PixelGridV3 with account:", deployer.address);

    // Base Sepolia USDC address
    const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

    const Grid = await ethers.getContractFactory("PixelGridV3");
    const grid = await Grid.deploy(usdcAddress);
    await grid.waitForDeployment();

    const addr = await grid.getAddress();
    console.log("PixelGridV3 (10c High Stakes) deployed to:", addr);
    console.log("--- Update .env.staging with this address ---");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
