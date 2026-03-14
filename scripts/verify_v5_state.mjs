import pkg from 'hardhat';
const { ethers } = pkg;

async function main() {
    const contractAddress = "0x02d385Abdde9eD312Cc321d8D33906b5C226c643";
    const abi = [
        "function globalReservoir() external view returns (uint256)",
        "function ownerRevenue() external view returns (uint256)",
        "function totalTileBounties() external view returns (uint256)",
        "function grid(uint256) external view returns (uint256)"
    ];

    const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
    const contract = new ethers.Contract(contractAddress, abi, provider);

    const [res, rev, bounty] = await Promise.all([
        contract.globalReservoir(),
        contract.ownerRevenue(),
        contract.totalTileBounties()
    ]);

    console.log("--- V5 DIAMOND STATE ---");
    console.log("Global Reservoir:", ethers.formatUnits(res, 6), "USDC");
    console.log("Owner Revenue:", ethers.formatUnits(rev, 6), "USDC");
    console.log("Total Tile Bounties:", ethers.formatUnits(bounty, 6), "USDC");
}

main().catch(console.error);
