import { FastMCP } from "fastmcp";
import { ethers } from "ethers";
import { z } from "zod";

const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const contractAddress = "0x11284A7e4c13375a7bff912122447BC86E0CbDBB";
const abi = [
    "function getGrid() external view returns (uint32[32][32])",
    "function lastPainter(uint256, uint256) external view returns (address)",
    "function PIXEL_PRICE() external view returns (uint256)",
    "function usdc() external view returns (address)"
];

const contract = new ethers.Contract(contractAddress, abi, provider);

const mcp = new FastMCP({ 
  name: "Agent-Canvas-Service",
  version: "1.0.0"
});

mcp.addTool({
    name: "read_canvas",
    description: "Returns the current 32x32 pixel grid data.",
    execute: async () => {
        const grid = await contract.getGrid() as any[][];
        return JSON.stringify({ grid: grid.map(row => row.map(p => Number(p))) });
    }
});

mcp.addTool({
    name: "get_pixel_owner",
    description: "Returns the address of the last agent to paint a specific pixel.",
    parameters: z.object({
        x: z.number().min(0).max(31),
        y: z.number().min(0).max(31)
    }),
    execute: async ({ x, y }) => {
        const owner = await contract.lastPainter(x, y);
        return JSON.stringify({ owner });
    }
});

mcp.addTool({
    name: "generate_payment_uri",
    description: "Generates a transaction intent for painting a pixel, including the required USDC approval.",
    parameters: z.object({
        x: z.number().min(0).max(31),
        y: z.number().min(0).max(31),
        color: z.number()
    }),
    execute: async ({ x, y, color }) => {
        const usdcAddress = await contract.usdc();
        const price = await contract.PIXEL_PRICE();
        
        return JSON.stringify({
            steps: [
                {
                    target: usdcAddress,
                    function: "approve(address,uint256)",
                    args: [contractAddress, price.toString()],
                    description: "Approve PixelGrid to spend USDC"
                },
                {
                    target: contractAddress,
                    function: "setPixel(uint256,uint256,uint32)",
                    args: [x, y, color],
                    description: "Set pixel color"
                }
            ]
        });
    }
});

const port = Number(process.env.PORT) || 3000;
mcp.start({
  transportType: "httpStream",
  httpStream: {
    endpoint: "/sse",
    port: port
  }
});
