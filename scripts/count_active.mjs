import pkg from 'hardhat';
const { ethers } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '.env.deploy' });

async function main() {
    const contractAddress = "0x02d385Abdde9eD312Cc321d8D33906b5C226c643";
    const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

    const abi = [
        "function getGrid() external view returns (uint256[1024])",
    ];

    const contract = new ethers.Contract(contractAddress, abi, provider);
    const grid = await contract.getGrid();

    let activeCount = 0;

    for (let i = 0; i < grid.length; i++) {
        const data = grid[i];
        const painter = ethers.getAddress("0x" + (data & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")).toString(16).padStart(40, '0'));
        if (painter !== ethers.ZeroAddress) {
            const x = Math.floor(i / 32);
            const y = i % 32;
            const colorRaw = (data >> 160n) & BigInt("0xFFFFFF");
            activeCount++;
            console.log(`Index ${i}: (${x},${y}) | Color: 0x${colorRaw.toString(16).padStart(6, '0')} | Painter: ${painter}`);
        }
    }

    console.log(`---`);
    console.log(`Active Count On-Chain: ${activeCount}`);
}

main().catch(console.error);
