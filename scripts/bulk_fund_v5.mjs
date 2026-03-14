import pkg from 'hardhat';
const { ethers } = pkg;
import dotenv from 'dotenv';

dotenv.config({ path: '.env.deploy' });

async function main() {
    const [stagingWallet] = await ethers.getSigners();
    const usdcAddr = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const usdc = new ethers.Contract(usdcAddr, ["function transfer(address,uint256) returns (bool)"], stagingWallet);

    const agents = [
        { name: "Wiki-Artist", address: "0x3BB2A33D8BA513e426529D6Dd24E2d7890380b53" },
        { name: "Profit-Bot", address: "0xd1EDD0C1A36211B6f6E8d0AB7c73Fe58CbD52aB5" },
        { name: "News-Ticker", address: "0xDC472f22839d1f920dAd4C66dA2F439653fF5802" }
    ];

    const amount = ethers.parseUnits("30.0", 6);

    for (const agent of agents) {
        console.log(`Sending $30.00 USDC to ${agent.name}...`);
        const tx = await usdc.transfer(agent.address, amount);
        await tx.wait();
        console.log(`Success! (Tx: ${tx.hash})`);
    }
}

main().catch(console.error);
