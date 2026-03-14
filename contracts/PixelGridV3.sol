// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PixelGridV3 (Mainnet Candidate)
 * @author Agent-Canvas Team
 * @notice Gas-optimized Arena with internal ledger and escalated survival timers.
 *         Entry Stake: 0.10 USDC
 */
contract PixelGridV3 is Ownable, ReentrancyGuard, Pausable {
    IERC20 public immutable usdc;
    
    uint256 public constant GRID_SIZE = 32;
    uint256 public constant INITIAL_PIXEL_PRICE = 100000; // 0.10 USDC (6 decimals)
    uint256 public constant BASE_SURVIVAL_TIME = 600;    // 10 Minutes
    uint256 public constant TIME_INCREMENT_PER_FLIP = 30; // +30s per contest
    
    // Total pooled rewards waiting for survival expiries
    uint256 public prizePool;
    // Accumulated 5% protocol fees
    uint256 public ownerRevenue;

    // Internal balances to minimize per-paint gas costs
    mapping(address => uint256) public userBalances;

    /**
     * @dev Compact storage to pack pixel metadata into one 256-bit slot.
     * [0..159] Address painter (160 bits)
     * [160..191] uint32 color (32 bits)
     * [192..223] uint32 lastPaintedAt (32 bits)
     * [224..231] uint8 extraTimeUnits (8 bits - each unit is 30s as defined by constant)
     * [232..255] uint24 pricePaid (24 bits - supports up to ~16 USDC in base units)
     */
    mapping(uint256 => uint256) public pixelData;

    event PixelSet(uint256 indexed index, uint32 color, address indexed painter, uint256 pricePaid, uint256 survivalRequired);
    event RewardClaimed(uint256 indexed index, address indexed winner, uint256 amount);
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function depositUSDC(uint256 amount) external whenNotPaused {
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        userBalances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdrawUSDC(uint256 amount) external nonReentrant {
        require(userBalances[msg.sender] >= amount, "Insufficient balance");
        userBalances[msg.sender] -= amount;
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    function setPixel(uint256 x, uint256 y, uint32 color) external whenNotPaused {
        _setPixel(x * GRID_SIZE + y, color);
    }

    function setPixels(uint256[] calldata x, uint256[] calldata y, uint32[] calldata colors) external whenNotPaused {
        require(x.length == y.length && y.length == colors.length, "Array mismatch");
        for (uint256 i = 0; i < x.length; i++) {
            _setPixel(x[i] * GRID_SIZE + y[i], colors[i]);
        }
    }

    function _setPixel(uint256 index, uint32 color) internal {
        uint256 data = pixelData[index];
        
        address lastPainter = address(uint160(data));
        uint256 currentPrice = (data >> 232);
        uint8 extraTimeUnits = uint8(data >> 224);

        if (currentPrice == 0) {
            currentPrice = INITIAL_PIXEL_PRICE;
        } else {
            // Price increases by 10% on every flip
            currentPrice = currentPrice + (currentPrice * 10) / 100;
        }

        require(userBalances[msg.sender] >= currentPrice, "Insufficient arena balance");
        userBalances[msg.sender] -= currentPrice;

        // Breakdown: 5% to us, 95% to the prize pool (and previous winner via pool)
        uint256 fee = (currentPrice * 5) / 100;
        ownerRevenue += fee;
        prizePool += (currentPrice - fee);

        // Escalation Logic: If repainted before survival, increase extraTimeUnits
        uint32 lastPaintedAt = uint32(data >> 192);
        uint256 survivalRequired = BASE_SURVIVAL_TIME + (uint256(extraTimeUnits) * TIME_INCREMENT_PER_FLIP);
        
        if (lastPainter != address(0) && block.timestamp < lastPaintedAt + survivalRequired) {
            if (extraTimeUnits < 255) extraTimeUnits++;
        }

        // Pack & Store
        uint256 newData = uint256(uint160(msg.sender));
        newData |= uint256(color) << 160;
        newData |= uint256(uint32(block.timestamp)) << 192;
        newData |= uint256(extraTimeUnits) << 224;
        newData |= uint256(currentPrice) << 232;
        
        pixelData[index] = newData;

        emit PixelSet(index, color, msg.sender, currentPrice, BASE_SURVIVAL_TIME + (uint256(extraTimeUnits) * TIME_INCREMENT_PER_FLIP));
    }

    function claimReward(uint256 x, uint256 y) external nonReentrant {
        uint256 index = x * GRID_SIZE + y;
        uint256 data = pixelData[index];
        address painter = address(uint160(data));
        uint32 lastPaintedAt = uint32(data >> 192);
        uint8 extraTimeUnits = uint8(data >> 224);
        uint256 pricePaid = (data >> 232);

        require(painter == msg.sender, "Not the painter");
        uint256 survivalRequired = BASE_SURVIVAL_TIME + (uint256(extraTimeUnits) * TIME_INCREMENT_PER_FLIP);
        require(block.timestamp >= lastPaintedAt + survivalRequired, "Survival period active");
        require(pricePaid > 0, "Already claimed");

        // Reward: Their initial stake + a portion of the global pool? 
        // For HFB: Winner takes their stake + 20% of the CURRENT global prize pool
        uint256 reward = (pricePaid * 95) / 100; 
        uint256 bonus = (prizePool * 20) / 100; // The "Jackpot" flash
        
        uint256 total = reward + bonus;
        if (total > prizePool) total = prizePool;
        
        prizePool -= total;
        userBalances[msg.sender] += total;

        // Reset pixel storage for next round (Price resets to initial)
        pixelData[index] = 0;

        emit RewardClaimed(index, msg.sender, total);
    }

    function getPixelInfo(uint256 x, uint256 y) external view returns (
        address painter,
        uint32 color,
        uint256 lastPaintedAt,
        uint256 currentFee,
        uint256 survivalRequired
    ) {
        uint256 data = pixelData[x * GRID_SIZE + y];
        painter = address(uint160(data));
        color = uint32(data >> 160);
        lastPaintedAt = uint256(uint32(data >> 192));
        uint8 extraUnits = uint8(data >> 224);
        currentFee = (data >> 232);
        if (currentFee == 0) currentFee = INITIAL_PIXEL_PRICE;
        survivalRequired = BASE_SURVIVAL_TIME + (uint256(extraUnits) * TIME_INCREMENT_PER_FLIP);
    }

    function withdrawOwnerRevenue() external onlyOwner {
        uint256 amount = ownerRevenue;
        ownerRevenue = 0;
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
    }
}
