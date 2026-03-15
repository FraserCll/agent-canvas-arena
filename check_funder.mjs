
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.mainnet' });

const RPC = "https://developer-access-mainnet.base.org";
const USDC_ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function check() {
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
    const eth = await provider.getBalance(wallet.address);
    const usdc = new ethers.Contract(USDC_ADDR, ["function balanceOf(address) view returns (uint256)"], provider);
    const usdcBal = await usdc.balanceOf(wallet.address);

    console.log(`Funding Source: ${wallet.address}`);
    console.log(`ETH: ${ethers.formatEther(eth)}`);
    console.log(`USDC: ${ethers.formatUnits(usdcBal, 6)}`);
}

check().catch(console.error);
