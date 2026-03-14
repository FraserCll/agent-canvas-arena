import pkg from 'hardhat';
const { ethers } = pkg;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const PAYOUT_ADDRESS = "0x6AbdF71C92259BB6669E81Cc5a9255471246079C";
    const INITIAL_PRICE = 10000; // 0.01 USDC
    const FEE_INCREMENT = 10; // 10%

    const PixelGrid = await ethers.getContractFactory("PixelGrid");
    const pixelGrid = await PixelGrid.deploy(
        USDC_ADDRESS,
        PAYOUT_ADDRESS,
        INITIAL_PRICE,
        FEE_INCREMENT
    );

    await pixelGrid.waitForDeployment();

    console.log("PixelGrid deployed to:", await pixelGrid.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
