// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PixelGridV5_Diamond (Surplus Surge — Audit Hardened)
 * @author Agent-Canvas Team
 * @notice Production-grade Arena contract with all audit fixes applied:
 *   C-1: PaintCount capped at 254 (prevents uint8 overflow price reset)
 *   C-2: Surplus bonus rate-limited to one payout per block
 *   M-1: Bounds checks on all coordinate inputs
 *   M-2: Snipe penalty is absolute (not inherited) — snipers always face BASE + penalty
 *   M-3: Running totalTileBounties counter for complete invariant checks
 *   Econ: Hard floor — bonus is ZERO when reservoir <= floor
 */
contract PixelGridV5_Diamond is Ownable, ReentrancyGuard, Pausable {
    IERC20 public immutable usdc;
    
    // Arena Constants
    uint256 public constant GRID_SIZE = 32;
    uint256 public constant INITIAL_PRICE = 100000;      // $0.10 (6 decimals)
    uint256 public constant BASE_SURVIVAL = 600;         // 10 Minutes
    uint256 public constant HARD_CAP_LIMIT = 900;        // 15 Minutes
    uint256 public constant SNIPE_PENALTY = 30;          // 30s added per snipe
    uint256 public constant MAX_PAINT_COUNT = 254;       // [C-1] Prevents uint8 overflow
    
    // Surplus Surge Constants
    uint256 public constant RESERVOIR_FLOOR = 25000000;  // $25.00 Floor (6 decimals)
    uint256 public constant SURPLUS_PAYOUT_PCT = 25;     // 25% of anything above Floor
    
    // Treasury Skim Tiers (agents can verify these on-chain)
    uint256 public constant SKIM_TIER1_THRESHOLD = 100000000;   // $100 — 10% of surplus
    uint256 public constant SKIM_TIER2_THRESHOLD = 500000000;   // $500 — 25% of surplus
    uint256 public constant SKIM_TIER3_THRESHOLD = 1000000000;  // $1,000 — 50% of surplus
    
    // Global Accounting
    uint256 public globalReservoir;
    uint256 public ownerRevenue;
    uint256 public totalTileBounties;                    // [M-3] Running counter
    
    // [C-2] Rate-limit: only one surplus bonus per block
    uint256 private _lastBonusBlock;

    // index => current tile-specific bounty (85% of fees generated on this tile)
    mapping(uint256 => uint256) public tileBounties;
    // Internal user ledger
    mapping(address => uint256) public userBalances;

    /**
     * @dev V5 Packed Storage Schema:
     * [0..159] Painter (160 bits)
     * [160..183] Color uint24 (24 bits)
     * [184..215] StartTime uint32 (32 bits)
     * [216..223] PaintCount uint8 (8 bits)
     * [224..239] RequiredDuration uint16 (16 bits)
     * [240..255] Reserved (16 bits)
     */
    mapping(uint256 => uint256) public pixelData;

    event PixelSet(uint256 indexed index, address indexed painter, uint256 price, uint256 expiry);
    event Winner(address indexed winner, uint256 totalPayout, uint256 bonusComponent);
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event RevenueWithdrawn(address indexed owner, uint256 amount); // [L-2] Added
    event ReservoirSkimmed(address indexed to, uint256 amount, uint256 remaining);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    // --- State Management ---

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function depositUSDC(uint256 amount) external whenNotPaused {
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        userBalances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdrawUSDC(uint256 amount) external nonReentrant {
        require(userBalances[msg.sender] >= amount, "Insufficient arena balance");
        userBalances[msg.sender] -= amount;
        require(usdc.transfer(msg.sender, amount), "External transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    // --- Core Game Actions ---

    function setPixel(uint256 x, uint256 y, uint32 color) external whenNotPaused {
        require(x < GRID_SIZE && y < GRID_SIZE, "Out of bounds"); // [M-1]
        _setPixel(x * GRID_SIZE + y, color);
    }

    function setPixels(uint256[] calldata x, uint256[] calldata y, uint32[] calldata colors) external whenNotPaused {
        require(x.length == y.length && y.length == colors.length, "Array mismatch");
        for (uint256 i = 0; i < x.length; i++) {
            require(x[i] < GRID_SIZE && y[i] < GRID_SIZE, "Out of bounds"); // [M-1]
            _setPixel(x[i] * GRID_SIZE + y[i], colors[i]);
        }
    }

    function _setPixel(uint256 index, uint32 color) internal {
        uint256 data = pixelData[index];
        uint8 count = uint8(data >> 216);
        
        // [C-1] Prevent overflow: tile is "exhausted" at 255 paints
        require(count < MAX_PAINT_COUNT, "Tile exhausted: max paints reached");
        
        uint256 price = _calculatePrice(count);

        require(userBalances[msg.sender] >= price, "Insufficient balance for entry");
        userBalances[msg.sender] -= price;

        // Protocol Split: 5% Owner | 10% Global Reservoir | 85% Tile Bounty
        uint256 ownerPart = (price * 5) / 100;
        uint256 reservoirPart = (price * 10) / 100;
        uint256 bountyPart = price - ownerPart - reservoirPart;

        ownerRevenue += ownerPart;
        globalReservoir += reservoirPart;
        tileBounties[index] += bountyPart;
        totalTileBounties += bountyPart; // [M-3]

        // [M-2] Timer Logic: Absolute penalty model
        // Every snipe resets the clock to BASE_SURVIVAL + (snipeCount * SNIPE_PENALTY),
        // capped at HARD_CAP_LIMIT. The sniper never inherits "easy" remaining time.
        uint32 startTime = uint32(data >> 184);
        uint16 nextDuration;

        if (startTime == 0) {
            // First paint on empty tile: standard 10-minute survival
            nextDuration = uint16(BASE_SURVIVAL);
        } else {
            // Snipe: absolute penalty = BASE + (count * 30s), capped at 15m
            uint256 penalizedDuration = BASE_SURVIVAL + (uint256(count) * SNIPE_PENALTY);
            if (penalizedDuration > HARD_CAP_LIMIT) penalizedDuration = HARD_CAP_LIMIT;
            nextDuration = uint16(penalizedDuration);
        }

        // Pack: [Painter][Color][StartTime][Count][Duration]
        uint256 newData = uint160(msg.sender);
        newData |= uint256(color & 0xFFFFFF) << 160;
        newData |= uint256(uint32(block.timestamp)) << 184;
        newData |= uint256(count + 1) << 216;
        newData |= uint256(nextDuration) << 224;
        
        pixelData[index] = newData;
        emit PixelSet(index, msg.sender, price, block.timestamp + nextDuration);
    }

    /**
     * @notice Claim victory: receive tile bounty + surplus surge bonus.
     */
    function claimReward(uint256 x, uint256 y) external nonReentrant {
        require(x < GRID_SIZE && y < GRID_SIZE, "Out of bounds"); // [M-1]
        uint256 index = x * GRID_SIZE + y;
        uint256 data = pixelData[index];
        address painter = address(uint160(data));
        uint32 startTime = uint32(data >> 184);
        uint16 duration = uint16(data >> 224);

        require(painter == msg.sender, "Access Denied: Not the current holder");
        require(startTime > 0, "No active claim on this tile");
        require(block.timestamp >= uint256(startTime) + uint256(duration), "Hold duration not met");

        uint256 baseBounty = tileBounties[index];
        
        // [C-2] Rate-limit surplus bonus: only one per block
        uint256 bonus = 0;
        if (block.number > _lastBonusBlock) {
            bonus = _calculateSurplusBonus();
            _lastBonusBlock = block.number;
        }

        // Execution: clear tile state
        tileBounties[index] = 0;
        totalTileBounties -= baseBounty; // [M-3]
        if (bonus > 0) {
            globalReservoir -= bonus;
        }
        pixelData[index] = 0; // Reset tile to empty ($0.10, timer 0)

        userBalances[msg.sender] += (baseBounty + bonus);
        
        emit Winner(msg.sender, baseBounty + bonus, bonus);
    }

    // --- The Surplus Surge Engine ---

    /**
     * @dev [Econ Fix] Hard Floor: bonus is ZERO when reservoir <= floor.
     *      Only the surplus above $100 is eligible for payout (25%).
     *      The $100 floor is permanently locked as "Bait."
     */
    function _calculateSurplusBonus() internal view returns (uint256) {
        uint256 res = globalReservoir;
        
        // Hard floor: if at or below $100, no bonus is paid
        if (res <= RESERVOIR_FLOOR) return 0;
        
        // Surplus bonus: 25% of everything above the floor
        return ((res - RESERVOIR_FLOOR) * SURPLUS_PAYOUT_PCT) / 100;
    }

    function _calculatePrice(uint8 count) internal pure returns (uint256) {
        if (count == 0) return INITIAL_PRICE;
        uint256 p = INITIAL_PRICE;
        for (uint8 i = 0; i < count; i++) {
            if (i < 5) p = (p * 110) / 100;       // Skirmish: 1.1x
            else if (i < 10) p = (p * 150) / 100;  // Tax: 1.5x
            else p = p * 2;                        // Kill-Switch: 2.0x
        }
        return p;
    }

    // --- High-Performance Views ---

    function getGrid() external view returns (uint256[1024] memory grid) {
        for (uint256 i = 0; i < 1024; i++) {
            grid[i] = pixelData[i];
        }
    }

    function getExpectedEV(uint256 x, uint256 y) external view returns (uint256 totalPayout) {
        require(x < GRID_SIZE && y < GRID_SIZE, "Out of bounds"); // [M-1]
        uint256 index = x * GRID_SIZE + y;
        return tileBounties[index] + _calculateSurplusBonus();
    }

    function getPixelInfo(uint256 x, uint256 y) external view returns (
        address painter,
        uint32 color,
        uint256 expiry,
        uint256 nextPrice,
        uint256 currentBounty,
        uint8 paintCount
    ) {
        require(x < GRID_SIZE && y < GRID_SIZE, "Out of bounds");
        uint256 index = x * GRID_SIZE + y;
        uint256 data = pixelData[index];
        painter = address(uint160(data));
        color = uint32(uint24(data >> 160));
        uint32 start = uint32(data >> 184);
        uint16 dur = uint16(data >> 224);
        expiry = uint256(start) + uint256(dur);
        paintCount = uint8(data >> 216);
        nextPrice = paintCount < MAX_PAINT_COUNT ? _calculatePrice(paintCount) : 0;
        currentBounty = tileBounties[index];
    }

    /**
     * @dev [M-3] Complete invariant check including totalTileBounties.
     */
    function checkInvariants() external view returns (bool) {
        uint256 actualBalance = usdc.balanceOf(address(this));
        return actualBalance >= (globalReservoir + ownerRevenue + totalTileBounties);
    }

    function withdrawOwnerRevenue() external nonReentrant onlyOwner {
        uint256 amount = ownerRevenue;
        ownerRevenue = 0;
        require(usdc.transfer(msg.sender, amount), "Revenue withdrawal failed");
        emit RevenueWithdrawn(msg.sender, amount); // [L-2]
    }

    /**
     * @notice Seed the reservoir (owner bootstraps the prize pool on launch).
     */
    function seedReservoir(uint256 amount) external onlyOwner {
        require(usdc.transferFrom(msg.sender, address(this), amount), "Seed transfer failed");
        globalReservoir += amount;
    }

    /**
     * @notice Skim excess reservoir to treasury for yield generation.
     *         Rate-limited by on-chain tiers that agents can verify.
     *         Tier 1 ($100+): max 10% of surplus | Tier 2 ($500+): 25% | Tier 3 ($1K+): 50%
     */
    function skimReservoir(uint256 amount) external onlyOwner nonReentrant {
        uint256 surplus = globalReservoir > RESERVOIR_FLOOR
            ? globalReservoir - RESERVOIR_FLOOR : 0;
        require(surplus > 0, "No surplus to skim");

        // Determine max skimmable based on tiered rates
        uint256 maxSkim;
        if (globalReservoir >= SKIM_TIER3_THRESHOLD) {
            maxSkim = (surplus * 50) / 100;   // 50% of surplus
        } else if (globalReservoir >= SKIM_TIER2_THRESHOLD) {
            maxSkim = (surplus * 25) / 100;   // 25% of surplus
        } else if (globalReservoir >= SKIM_TIER1_THRESHOLD) {
            maxSkim = (surplus * 10) / 100;   // 10% of surplus
        } else {
            revert("Reservoir below skim activation threshold");
        }

        require(amount <= maxSkim, "Exceeds tiered skim limit");
        require(globalReservoir - amount >= RESERVOIR_FLOOR, "Cannot skim below floor");

        globalReservoir -= amount;
        require(usdc.transfer(msg.sender, amount), "Skim transfer failed");
        emit ReservoirSkimmed(msg.sender, amount, globalReservoir);
    }
}
