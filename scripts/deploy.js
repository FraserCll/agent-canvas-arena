const hre = require("hardhat");

async function main() {
  const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const payoutAddress = "0x6AbdF71C92259BB6669E81Cc5a9255471246079C";

  console.log("Deploying PixelGrid...");

  const PixelGrid = await hre.ethers.getContractFactory("PixelGrid");
  const pixelGrid = await PixelGrid.deploy(usdcAddress, payoutAddress);

  await pixelGrid.waitForDeployment();

  console.log("PixelGrid deployed to:", await pixelGrid.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
