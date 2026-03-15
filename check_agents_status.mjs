
import { ethers } from 'ethers';
import fs from 'fs';

const RPC_POOL = [
    "https://developer-access-mainnet.base.org",
    "https://1rpc.io/base",
    "https://base.meowrpc.com",
    "https://mainnet.base.org"
];
const USDC_ADDR = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ARENA_ADDR = "0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC";
const WALLET_FILE = 'scripts/sim_wallets_v5.json';

async function check() {
    const provider = new ethers.JsonRpcProvider(RPC_POOL[0], undefined, { staticNetwork: true });
    const usdc = new ethers.Contract(USDC_ADDR, ["function balanceOf(address) view returns (uint256)"], provider);
    const arena = new ethers.Contract(ARENA_ADDR, ["function userBalances(address) view returns (uint256)"], provider);

    const wallets = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));

    console.log("--------------------------------------------------");
    console.log("AGENT BALANCES (BASE MAINNET)");
    console.log("--------------------------------------------------");

    for (const w of wallets) {
        const wallet = new ethers.Wallet(w.privateKey, provider);
        const eth = await provider.getBalance(wallet.address);
        const usdcBal = await usdc.balanceOf(wallet.address);
        const ledger = await arena.userBalances(wallet.address);

        console.log(`Agent: ${w.name}`);
        console.log(`Address: ${wallet.address}`);
        console.log(`ETH: ${ethers.formatEther(eth)}`);
        console.log(`USDC: ${ethers.formatUnits(usdcBal, 6)}`);
        console.log(`Arena Ledger: ${ethers.formatUnits(ledger, 6)}`);
        console.log("--------------------------------------------------");
    }
}

check().catch(console.error);
