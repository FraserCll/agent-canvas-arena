import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.staging' });

const RPC_URL = "https://sepolia.base.org";
const CONTRACT_ADDRESS = "0x7ffc8FD009DdBCC47508Cf3510b2b3b54BCD0F48";
const STAGING_WALLET = "0x2Ef029f87D6D28779DEe48d25d732Daa0B764b50";

const ABI = [
    "event PixelSet(uint256 indexed x, uint256 indexed y, uint32 color, address indexed painter, uint256 fee)",
    "function lastPainter(uint256 x, uint256 y) external view returns (address)"
];

async function monitor() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    console.log("--- Monitoring Arena for New Agents ---");
    console.log(`Staging Wallet: ${STAGING_WALLET}`);

    // Check recent events (last 500 blocks)
    const filter = contract.filters.PixelSet();
    const latestBlock = await provider.getBlockNumber();
    const events = await contract.queryFilter(filter, latestBlock - 500);

    console.log(`Analyzing ${events.length} events...`);
    const uniquePainters = new Set();
    events.forEach(e => {
        if (e.args && e.args.painter) {
            uniquePainters.add(e.args.painter.toLowerCase());
        }
    });

    if (uniquePainters.size === 0) {
        console.log("No events found in last 500 blocks. Staging agents might be paused or RPC is slow.");
    }

    uniquePainters.forEach(p => {
        if (p !== STAGING_WALLET.toLowerCase()) {
            console.log(`[!] NEW AGENT DETECTED: ${p}`);
        } else {
            console.log(`[OK] Internal Staging Agent (${p}) seen.`);
        }
    });

    if (uniquePainters.size === 1 && uniquePainters.has(STAGING_WALLET.toLowerCase())) {
        console.log("Only staging wallet active. Waiting for Michael...");
    }
}

monitor().catch(console.error);
