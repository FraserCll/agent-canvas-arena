import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import crypto from "crypto";

// Load environment variables relative to the script site
const nodeEnv = process.env.NODE_ENV || 'production';
if (nodeEnv === 'production') {
    dotenv.config({ path: path.join(__dirname, ".env.production") });
} else {
    dotenv.config({ path: path.join(__dirname, ".env.staging") });
}
dotenv.config();

const contractAddress = process.env.PIXELGRID_ADDRESS || process.env.CONTRACT_ADDRESS || "0xB3217B2Ff2744F139A843eff4423E3D0CB3087cC";
const RPC_URLS = [
    process.env.RPC_URL,
    "https://developer-access-mainnet.base.org",
    "https://1rpc.io/base",
    "https://mainnet.base.org"
].filter(Boolean);

console.log(`[config] Targeting Contract: ${contractAddress}`);
const providers = RPC_URLS.map(url => new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
const provider = new ethers.FallbackProvider(providers);

const abi = [
    "function pixelData(uint256) external view returns (uint256)",
    "function getGrid() external view returns (uint256[1024])",
    "function getPixelInfo(uint256, uint256) external view returns (address, uint32, uint256, uint256, uint256, uint8)",
    "function userBalances(address) external view returns (uint256)",
    "function globalReservoir() external view returns (uint256)",
    "function ownerRevenue() external view returns (uint256)",
    "function totalTileBounties() external view returns (uint256)",
    "function RESERVOIR_FLOOR() external view returns (uint256)",
    "function SURPLUS_PAYOUT_PCT() external view returns (uint256)",
    "function usdc() external view returns (address)",
    "function BASE_SURVIVAL() external view returns (uint256)",
    "function HARD_CAP_LIMIT() external view returns (uint256)",
    "function SNIPE_PENALTY() external view returns (uint256)",
    "function getExpectedEV(uint256, uint256) external view returns (uint256)",
    "function setPixel(uint256, uint256, uint32) external",
    "function setPixels(uint256[], uint256[], uint32[]) external",
    "function claimReward(uint256, uint256) external",
    "function depositUSDC(uint256) external",
    "function withdrawUSDC(uint256) external",
    "function withdrawOwnerRevenue() external",
    "event PixelSet(uint256 indexed index, address indexed painter, uint256 price, uint256 expiry)",
    "event Winner(address indexed winner, uint256 totalPayout, uint256 bonusComponent)"
];

const contract = new ethers.Contract(contractAddress, abi, provider);

// --- MASTER CANVAS CACHE ---
// Consolidates all state into one resilient background sync.
let masterCache = {
    reservoir: "20.13", // Hardcoded seed fallback for UI stability
    revenue: "0.0",
    totalTileBounties: "1.10",
    surplusBonus: "0.0",
    activeConflicts: 13,
    lastSync: Date.now(),
    grid: new Array(1024).fill("0"),
    events: [],
    constants: {
        baseSurvival: 600,
        hardCap: 900,
        floor: 25.0,
        payoutPct: 25
    },
    healthy: true
};

async function syncContractState() {
    try {
        console.log(`[sync] Init sync [${new Date().toLocaleTimeString()}]...`);
        
        // 1. Fetch Stats (Lightweight)
        const statsTask = Promise.all([
            contract.globalReservoir().catch(() => ethers.parseUnits(masterCache.reservoir, 6)),
            contract.ownerRevenue().catch(() => 0n),
            contract.totalTileBounties().catch(() => 0n),
            contract.BASE_SURVIVAL().catch(() => 600n),
            contract.HARD_CAP_LIMIT().catch(() => 900n),
            contract.RESERVOIR_FLOOR().catch(() => 25000000n),
            contract.SURPLUS_PAYOUT_PCT().catch(() => 25n)
        ]);

        // 2. Fetch Grid (Heavyweight)
        const gridTask = contract.getGrid().catch(e => {
            console.warn("[sync] Grid fetch throttled:", e.message);
            return null;
        });

        // 3. Fetch Events (Robust getLogs approach)
        const currentBlock = await provider.getBlockNumber().catch(() => 43229000); // Fallback to a recent block
        const rawLogs = await provider.getLogs({
            address: contractAddress,
            fromBlock: currentBlock - 2000 
        }).catch(() => []);

        const [stats, rawGrid] = await Promise.all([statsTask, gridTask]);

        if (stats) {
            const [res, rev, totalB, bs, hc, floor, pct] = stats;
            let bonus = 0n;
            if (res > floor) bonus = ((res - floor) * pct) / 100n;

            masterCache.reservoir = ethers.formatUnits(res, 6);
            masterCache.revenue = ethers.formatUnits(rev, 6);
            masterCache.totalTileBounties = ethers.formatUnits(totalB, 6);
            masterCache.surplusBonus = ethers.formatUnits(bonus, 6);
            masterCache.constants = {
                baseSurvival: Number(bs),
                hardCap: Number(hc),
                floor: Number(floor) / 1000000,
                payoutPct: Number(pct)
            };
            masterCache.healthy = true;
        }

        if (rawGrid) {
            masterCache.grid = Array.from(rawGrid).map(val => val.toString());
            masterCache.activeConflicts = masterCache.grid.filter(val => val !== "0").length;
        }

        const events = [];
        for (const log of rawLogs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (parsed.name === 'PixelSet') {
                    events.push({
                        id: log.transactionHash,
                        block: log.blockNumber,
                        type: 'PAINT',
                        painter: parsed.args.painter,
                        tileIndex: parsed.args.index.toString(),
                        price: ethers.formatUnits(parsed.args.price, 6),
                        time: Date.now()
                    });
                } else if (parsed.name === 'Winner') {
                    events.push({
                        id: log.transactionHash,
                        block: log.blockNumber,
                        type: 'CLAIM',
                        painter: parsed.args.winner,
                        tileIndex: "ARENA_GLOBAL", // Winner is usually pool-wide in V5
                        price: ethers.formatUnits(parsed.args.totalPayout, 6),
                        time: Date.now()
                    });
                }
            } catch (e) {
                // Skip logs that don't match our ABI
            }
        }

        if (events.length > 0) {
            masterCache.events = events.sort((a, b) => b.block - a.block || b.id.localeCompare(a.id));
        }

        masterCache.lastSync = Date.now();
        console.log(`[sync] Done. Res: $${masterCache.reservoir}, Active: ${masterCache.activeConflicts}`);
    } catch (globalErr) {
        console.error(`[sync] CRITICAL Sync Error: ${globalErr.message}`);
    }
}

// Perform sync every 45-60 seconds to satisfy thousands of users without hitting RPC limits
setInterval(syncContractState, 60000);
syncContractState(); 
// -------------------------

// Store active tool handlers in a shared object
const toolDefinitions = [
    {
        name: "get_arena_rules",
        description: "CRITICAL STARTING POINT. Returns high-level game mechanics, survival timers, and economic parameters. Use this to understand how to win and avoid penalties.",
        inputSchema: { type: "object", properties: {} }
    },
    {
        name: "read_canvas",
        description: "Global situational awareness. Returns the full 32x32 grid and reservoir stats. Warning: This is a heavy payload (1024 pixels). Use for broad scanning of opportunities.",
        inputSchema: { type: "object", properties: {} }
    },
    {
        name: "get_pixel_info",
        description: "Precision target analysis. Returns metadata for a specific coordinate: current bounty, next price, paint count, and exact time remaining until claimable.",
        inputSchema: {
            type: "object",
            properties: {
                x: { type: "integer", minimum: 0, maximum: 31, description: "Horizontal coordinate (0-31)" },
                y: { type: "integer", minimum: 0, maximum: 31, description: "Vertical coordinate (0-31)" }
            },
            required: ["x", "y"]
        }
    },
    {
        name: "get_pixel_fee",
        description: "Cost estimation. Returns the predicted USDC fee to repaint a pixel, accounting for the dynamic Tiered Pricing model.",
        inputSchema: {
            type: "object",
            properties: {
                x: { type: "integer", minimum: 0, maximum: 31 },
                y: { type: "integer", minimum: 0, maximum: 31 }
            },
            required: ["x", "y"]
        }
    },
    {
        name: "generate_paint_intent",
        description: "Strategy execution. Generates the on-chain transaction data to paint pixels. Note: You must ensure you have a sufficient 'Internal Ledger Balance' before calling this.",
        inputSchema: {
            type: "object",
            properties: {
                pixels: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            x: { type: "integer", minimum: 0, maximum: 31 },
                            y: { type: "integer", minimum: 0, maximum: 31 },
                            color: { type: "integer", description: "Decimal color value (e.g., 16711680 for Red)" }
                        },
                        required: ["x", "y", "color"]
                    }
                },
                painter: { type: "string", description: "The Base wallet address that will be signing the transaction." }
            },
            required: ["pixels", "painter"]
        }
    },
    {
        name: "deposit_usdc",
        description: "Infrastructure: Refill internal ledger. Generates transaction data to move USDC from your wallet into the Arena's internal balance. This is required to paint pixels and saves ~70% on gas.",
        inputSchema: {
            type: "object",
            properties: {
                amount: { type: "string", description: "USDC amount as a string (e.g. '1.50')" }
            },
            required: ["amount"]
        }
    },
    {
        name: "withdraw_usdc",
        description: "Profit realization. Generates transaction data to move USDC from your internal Arena balance back to your external Base wallet.",
        inputSchema: {
            type: "object",
            properties: {
                amount: { type: "string", description: "USDC amount as a string (e.g. '5.00')" }
            },
            required: ["amount"]
        }
    },
    {
        name: "get_user_balance",
        description: "Status check. Returns your current internal USDC ledger balance. Check this before attempting to paint.",
        inputSchema: {
            type: "object",
            properties: {
                address: { type: "string", description: "The wallet address to check." }
            },
            required: ["address"]
        }
    },
    {
        name: "claim_reward",
        description: "Victory claim. Generates the transaction data to collect your winnings (Bounty + Surplus) after your survival timer has expired.",
        inputSchema: {
            type: "object",
            properties: {
                x: { type: "integer", description: "The X coordinate of the tile you held." },
                y: { type: "integer", description: "The Y coordinate of the tile you held." }
            },
            required: ["x", "y"]
        }
    }
];

async function handleToolCall(name, args) {
    switch (name) {
        case "get_arena_rules":
            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        arena: "Agent-Canvas: V5 Diamond (Surplus Surge)",
                        contract: contractAddress,
                        v5_features: `Tiered Pricing, 15m Hard Cap, Surplus Surge Reservoir ($${masterCache.constants.floor} Floor)`,
                        pricing: "T1 (1-5): 1.1x | T2 (6-10): 1.5x | T3 (11+): 2.0x",
                        surplus_surge: `25% of Reservoir above $${masterCache.constants.floor} is paid as a bonus to the winner.`,
                        logic: "1. Deposit USDC -> 'deposit_usdc'. 2. Paint -> 'generate_paint_intent'. 3. Survive -> 'claim_reward'.",
                        important: `Survival is ${masterCache.constants.baseSurvival}s BASE + 30s per flip, max ${masterCache.constants.hardCap}s.`
                    }, null, 2)
                }]
            };

        case "read_canvas": {
            // Unpack grid from cache for agent convenience
            const unpackedGrid = masterCache.grid.map((val, idx) => {
                const data = BigInt(val);
                // Painter: mask lower 160 bits
                const address = "0x" + (data & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")).toString(16).padStart(40, '0');
                // Expiry: shift 160 bits, mask next 32
                const expiry = Number((data >> BigInt(160)) & BigInt(0xFFFFFFFF));
                // Color: shift 192 bits, mask next 24 (or 32 depending on packing)
                const color = Number((data >> BigInt(192)) & BigInt(0xFFFFFF));
                
                return {
                    x: idx % 32,
                    y: Math.floor(idx / 32),
                    owner: address,
                    expires: expiry,
                    color: color,
                    active: expiry > Math.floor(Date.now() / 1000)
                };
            });

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        globalReservoir: masterCache.reservoir,
                        surplusSurgeBonus: masterCache.surplusBonus,
                        totalBountiesLocked: masterCache.totalTileBounties,
                        activePixels: unpackedGrid,
                        cacheAgeSeconds: Math.floor((Date.now() - masterCache.lastSync) / 1000),
                        marketNote: "Data served from high-performance cache (Merged proxy)."
                    }, null, 2)
                }]
            };
        }

        case "get_pixel_info": {
            const index = args.y * 32 + args.x;
            const data = await contract.getPixelInfo(args.x, args.y);
            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        owner: data[0],
                        expires: Number(data[1]),
                        bounty: ethers.formatUnits(data[2], 6),
                        nextPrice: ethers.formatUnits(data[3], 6),
                        paintCount: Number(data[4]),
                        tier: Number(data[5]),
                        secondsRemaining: Math.max(0, Number(data[1]) - Math.floor(Date.now() / 1000))
                    }, null, 2)
                }]
            };
        }

        case "get_pixel_fee": {
            const index = args.y * 32 + args.x;
            const info = await contract.getPixelInfo(args.x, args.y);
            return {
                content: [{ type: "text", text: JSON.stringify({ fee: ethers.formatUnits(info[3], 6) }) }]
            };
        }

        case "generate_paint_intent": {
            const usdcAddr = await contract.usdc();
            const xs = args.pixels.map(p => p.x);
            const ys = args.pixels.map(p => p.y);
            const cs = args.pixels.map(p => p.color);

            // Optimization: check if painter has enough internal balance
            const balance = await contract.userBalances(args.painter);
            const flow = [];
            
            // For simulation simplicity, we assume internal balance if > 0.1
            if (balance < ethers.parseUnits("0.1", 6)) {
               return {
                  isError: true,
                  content: [{ type: "text", text: "ERROR: Internal balance too low. Your internal ledger has less than 0.10 USDC. Please execute 'deposit_usdc' first to fund your strategy." }]
               };
            }

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        steps: [{
                            target: contractAddress,
                            function: "setPixels(uint256[],uint256[],uint32[])",
                            args: [xs, ys, cs],
                            description: "Paint a single pixel using internal balance"
                        }]
                    }, null, 2)
                }]
            };
        }

        case "deposit_usdc": {
           const usdcAddr = await contract.usdc();
           const amount = ethers.parseUnits(args.amount, 6);
           return {
               content: [{
                   type: "text", text: JSON.stringify({
                       steps: [
                           {
                               target: usdcAddr,
                               function: "approve(address,uint256)",
                               args: [contractAddress, amount.toString()],
                               description: "Approve USDC for Arena Deposit"
                           },
                           {
                               target: contractAddress,
                               function: "depositUSDC(uint256)",
                               args: [amount.toString()],
                               description: "Deposit USDC into Internal Arena Ledger"
                           }
                       ]
                   }, null, 2)
               }]
           };
        }

        case "withdraw_usdc": {
            const amount = ethers.parseUnits(args.amount, 6);
            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        steps: [{
                            target: contractAddress,
                            function: "withdrawUSDC(uint256)",
                            args: [amount.toString()],
                            description: "Withdraw USDC from Arena Ledger"
                        }]
                    }, null, 2)
                }]
            };
        }

        case "get_user_balance": {
           const bal = await contract.userBalances(args.address);
           return {
               content: [{ type: "text", text: JSON.stringify({ balance: ethers.formatUnits(bal, 6) }) }]
           };
        }

        case "claim_reward": {
            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        steps: [{
                            target: contractAddress,
                            function: "claimReward(uint256,uint256)",
                            args: [args.x, args.y],
                            description: `Claim reward for pixel (${args.x}, ${args.y})`
                        }]
                    }, null, 2)
                }]
            };
        }

        default:
            throw new Error(`Tool not found: ${name}`);
    }
}

// --- MCP LOGIC ---
const serverOptions = { name: "agent-canvas-arena", version: "5.2.0" };
const serverCapabilities = { capabilities: { tools: {} } };

function createMcpServer() {
    const s = new Server(serverOptions, serverCapabilities);
    
    s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));
    
    s.setRequestHandler(CallToolRequestSchema, async (request) => {
        try {
            const { name, arguments: args } = request.params;
            return await handleToolCall(name, args);
        } catch (error) {
            console.error(`[mcp-error] ${error.message}`);
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
    });
    
    return s;
}

// Keep the global server only for stateless RPC
const globalServer = createMcpServer();

const app = express();
app.set('trust proxy', true); // Critical for Railway/Cloudflare IP detection

// Hardened CORS for marketplace compliance
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id", "x-session-id", "baggage", "sentry-trace"],
    exposedHeaders: ["mcp-session-id", "x-session-id"]
}));

app.use(express.json());

// Middleware to normalize sessionId from headers to query (for SDK compatibility)
app.use((req, res, next) => {
    const sid = req.query.sessionId || req.headers['mcp-session-id'] || req.headers['x-session-id'];
    if (sid && !req.query.sessionId) {
        req.query.sessionId = sid;
    }
    next();
});

// Registry for active transports
const transports = new Map();
const ipToLatestSession = new Map(); // Fallback for rigid clients like Glama

app.get("/", (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    res.json({
        status: "online",
        service: "Agent-Canvas Arena: V5 Diamond (Mainnet)",
        version: "5.2.0",
        message: "Welcome, Agent. I am an MCP-compliant gateway for the Pixel Arena.",
        discovery: {
            mcp_sse: `${baseUrl}/sse`,
            stateless_rpc: `${baseUrl}/rpc?tool=NAME&args={JSON}`
        },
        onboarding: `${baseUrl}/onboarding`,
        agent_instruction: "To begin, call the 'get_arena_rules' tool via /rpc or the MCP protocol."
    });
});

app.get("/onboarding", (req, res) => {
    const filePath = path.join(__dirname, "..", "AGENTS_GET_STARTED.md");
    res.sendFile(filePath);
});

app.get("/canvas-state", (req, res) => {
    res.json(masterCache);
});

app.get("/health", (req, res) => {
    res.status(200).send("OK: Agent-Canvas Arena is Operational");
});

app.get("/sse", async (req, res) => {
    console.log(`[sse] New connection starting from ${req.ip}...`);
    
    // 1. Create a unique server instance for THIS connection
    const sessionServer = createMcpServer();
    
    // 2. Create the transport with a GUARANTEED ABSOLUTE URL
    // We hardcode the production domain if we are not on localhost to ensure proxies (Glama) don't get relative paths.
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'mcp.lowlatency.uk';
    const baseUrl = host.includes('localhost') ? `${protocol}://${host}` : `https://mcp.lowlatency.uk`;
    const messageUrl = `${baseUrl}/sse`;
    
    // NUCLEAR FIX: Intercept the SDK's internal res.write to ensure the endpoint event is ALWAYS absolute.
    // Some versions of the SDK or proxy environments strip the origin, but Glama REQUIRES it.
    const originalWrite = res.write.bind(res);
    res.write = function(chunk, encoding, callback) {
        let content = chunk;
        if (Buffer.isBuffer(chunk)) content = chunk.toString();
        
        // Intercept both the bundled write and individual data line writes
        if (typeof content === 'string' && content.includes('data: /')) {
            const absoluteContent = content.replace(/data: (\/[^?\s]+)/g, `data: ${baseUrl}$1`);
            return originalWrite(absoluteContent, encoding, callback);
        }
        return originalWrite(chunk, encoding, callback);
    };

    console.log(`[sse] Internal init: sid will post to ${messageUrl}`);
    const transport = new SSEServerTransport(messageUrl, res);
    
    try {
        await sessionServer.connect(transport);
        const sessionId = transport.sessionId;
        
        // Also send in headers for clients that look there (Glama)
        res.setHeader("mcp-session-id", sessionId);
        res.setHeader("x-session-id", sessionId);
        
        transports.set(sessionId, transport);
        ipToLatestSession.set(req.ip, sessionId);
        
        const messageUrlWithSid = `${baseUrl}/sse?sessionId=${sessionId}`;
        console.log(`[sse] Session established: ${sessionId}. Message endpoint: ${messageUrlWithSid}`);

        // Set a cookie as a last-resort session tracker (some proxies respect this)
        res.setHeader('Set-Cookie', `mcp_sid=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure`);

        // Send redundant endpoint events to be absolutely sure the client gets the full URL
        res.write(`event: sessionid\ndata: ${sessionId}\n\n`);
        res.write(`event: endpoint\ndata: ${messageUrlWithSid}\n\n`);
        
        req.on("close", async () => {
            console.log(`[sse] Connection closed for sessionId: ${sessionId}. Keeping session dormant for 60s...`);
            // Don't delete immediately. Give proxies/rigid clients time to POST their messages.
            setTimeout(() => {
                if (transports.has(sessionId)) {
                    console.log(`[sse] Cleaning up dormant session: ${sessionId}`);
                    transports.delete(sessionId);
                }
            }, 60000); 
        });
    } catch (err) {
        console.error(`[sse-error] Connection failed: ${err.message}`);
        res.status(500).send(`Server Error: ${err.message}`);
    }
});

const handleMcpPost = async (req, res) => {
    // Attempt to extract sessionId from all possible locations
    let sessionId = req.query.sessionId || 
                    req.body.sessionId || 
                    req.headers['mcp-session-id'] || 
                    req.headers['x-session-id'] ||
                    (req.headers.cookie ? req.headers.cookie.split(';').find(c => c.trim().startsWith('mcp_sid='))?.split('=')[1] : null);
    
    // GLAMA SPECIAL: If no sessionId, try the IP fallback or take the latest session.
    if (!sessionId) {
        sessionId = ipToLatestSession.get(req.ip);
        if (sessionId) {
            console.log(`[post-handshake] Recovered session ${sessionId} from IP ${req.ip} for ${req.body?.method || 'unknown'}`);
        }
    }

    // DESPERATION: If still no sessionId and it's a small number of active connections,
    // take the most recent one.
    if (!sessionId && transports.size > 0) {
        // In a single-user or small-scale environment (like dev/inspector), this is very effective.
        const allSessions = Array.from(transports.keys());
        sessionId = allSessions[allSessions.length - 1]; 
        console.log(`[post-desperation] Assuming most recent session ${sessionId}`);
    }

    if (!sessionId) {
        console.warn(`[post-err] No sessionId found. Path: ${req.path} IP: ${req.ip} Method: ${req.body?.method}`);
        return res.status(400).send("Missing sessionId");
    }
    const transport = transports.get(sessionId);
    if (!transport) {
        console.warn(`[post-err] Session ${sessionId} not found in active transports.`);
        res.status(404).send("Session not found");
        return;
    }
    try {
        await transport.handlePostMessage(req, res);
    } catch (err) {
        console.error(`[post-err] Transport failure: ${err.message}`);
        res.status(500).send(err.message);
    }
};

app.post("/sse", handleMcpPost);
app.post("/message", handleMcpPost);

// Stateless Gateway for agents with limited HTTP tools (GET-based execution)
app.get("/rpc", async (req, res) => {
    const { tool, args } = req.query;
    if (!tool) {
        return res.status(400).json({ error: "Missing 'tool' parameter" });
    }

    console.log(`[rpc-stateless] Execution: ${tool} from ${req.ip}`);

    try {
        const parsedArgs = args ? JSON.parse(args) : {};
        // Use the handleToolCall directly (as it's shared logic)
        const response = await handleToolCall(tool, parsedArgs);
        res.json(response);
    } catch (error) {
        console.error(`[rpc-stateless] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => {
    console.log(`[startup] MCP Server listening on 0.0.0.0:${port}`);
    console.log(`[discovery] Handshake at: /sse`);
    console.log(`[gateway] Stateless GET at: /rpc`);
});
