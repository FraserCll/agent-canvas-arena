import pkg from 'hardhat';
const { ethers } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '.env.mainnet' });

const CONTRACT_ADDRESS = "0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC";
const OWNER_ADDRESS = process.env.OWNER_ADDRESS;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Finishing ownership transfer...");
    console.log("Contract:", CONTRACT_ADDRESS);
    console.log("Deployer:", deployer.address);
    console.log("Target Owner:", OWNER_ADDRESS);

    const grid = await ethers.getContractAt("PixelGridV5_Diamond", CONTRACT_ADDRESS);
    
    const currentOwner = await grid.owner();
    console.log("Current Owner:", currentOwner);

    if (currentOwner.toLowerCase() === OWNER_ADDRESS.toLowerCase()) {
        console.log("Ownership already transferred!");
        return;
    }

    if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.error("Deployer is not the owner. Cannot transfer.");
        return;
    }

    console.log("Executing transferOwnership...");
    const tx = await grid.transferOwnership(OWNER_ADDRESS);
    console.log("TX Hash:", tx.hash);
    await tx.wait();
    
    const newOwner = await grid.owner();
    console.log("SUCCESS! New owner:", newOwner);
}

main().catch((error) => {
    console.error("TRANSFER FAILED:", error);
    process.exitCode = 1;
});
