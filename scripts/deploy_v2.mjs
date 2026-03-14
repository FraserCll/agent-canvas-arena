import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.deploy' });

const RPC_URL = "https://sepolia.base.org";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYOUT_ADDRESS = "0x2Ef029f87D6D28779DEe48d25d732Daa0B764b50";

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log("Deploying PixelGridV2...");

    // Load Artifact manually (Hardhat artifacts)
    const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/PixelGridV2.sol/PixelGridV2.json', 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const initialPrice = ethers.parseUnits("0.005", 6); // Lowered base price to 0.005 USDC
    const feeIncrement = 10; // 10%

    const contract = await factory.deploy(USDC_ADDRESS, PAYOUT_ADDRESS, initialPrice, feeIncrement);
    await contract.waitForDeployment();

    const addr = await contract.getAddress();
    console.log(`PixelGridV2 deployed to: ${addr}`);
    console.log("Update your .env.staging with this address!");
}

main().catch(console.error);
