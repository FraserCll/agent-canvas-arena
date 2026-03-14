// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PixelGrid is Ownable {
    IERC20 public immutable usdc;
    address public immutable payoutAddress;
    
    // Configurable parameters
    uint256 public initialPixelPrice; // e.g., 0.01 * 10**6 USDC
    uint256 public feeIncrementPercent; // e.g., 10 for 10% price increase on repaint
    uint256 public constant REVENUE_PERCENT = 5; // 5% for project owner
    uint256 public constant PRIZE_POOL_PERCENT = 95; // 95% goes to various prize pools

    uint256 public constant SURVIVAL_TIME = 15 minutes; 
    uint256 public constant PIXEL_CLAIM_POOL_CONTRIBUTION_PERCENT = 20; 
    uint256 public constant GLOBAL_PRIZE_POOL_CONTRIBUTION_PERCENT = 80; 
    uint256 public constant GLOBAL_PRIZE_POOL_CLAIM_PERCENT = 10; 

    // State variables
    uint32[32][32] public grid;
    address[32][32] public lastPainter;
    uint256[32][32] public lastPaintedAt;
    uint256[32][32] public pixelCurrentFee; // Dynamic price per pixel
    
    uint256 public prizePool; // Global prize pool
    mapping(uint256 => mapping(uint256 => uint256)) public pixelClaimPool; // Pixel-specific reward pools

    uint256 public ownerRevenueAccumulated; 

    // Events
    event PixelSet(uint256 indexed x, uint256 indexed y, uint32 color, address indexed painter, uint256 pricePaid);
    event RewardClaimed(uint256 indexed x, uint256 indexed y, address indexed claimant, uint256 globalReward, uint256 pixelReward);
    event OwnerRevenueWithdrawn(address indexed to, uint256 amount);

    constructor(address _usdc, address _payoutAddress, uint256 _initialPixelPrice, uint256 _feeIncrementPercent) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        payoutAddress = _payoutAddress;
        initialPixelPrice = _initialPixelPrice;
        feeIncrementPercent = _feeIncrementPercent;
    }

    /**
     * @dev Core painting logic for a single pixel. 
     */
    function _setPixel(uint256 x, uint256 y, uint32 color, address painter) internal {
        require(x < 32 && y < 32, "Out of bounds");
        
        uint256 currentPrice = pixelCurrentFee[x][y] == 0 ? initialPixelPrice : pixelCurrentFee[x][y];

        // Increase price if repainted by a different agent
        if (lastPainter[x][y] != address(0) && painter != lastPainter[x][y]) {
            currentPrice = currentPrice + (currentPrice * feeIncrementPercent) / 100;
        }
        
        pixelCurrentFee[x][y] = currentPrice;

        // Collect USDC fee from the painter
        require(usdc.transferFrom(msg.sender, address(this), currentPrice), "USDC transfer failed");
        
        uint256 revenueShare = (currentPrice * REVENUE_PERCENT) / 100;
        uint256 totalPrizeShare = (currentPrice * PRIZE_POOL_PERCENT) / 100;

        ownerRevenueAccumulated += revenueShare;

        uint256 toGlobalPrizePool = (totalPrizeShare * GLOBAL_PRIZE_POOL_CONTRIBUTION_PERCENT) / 100;
        uint256 toPixelClaimPool = (totalPrizeShare * PIXEL_CLAIM_POOL_CONTRIBUTION_PERCENT) / 100;

        prizePool += toGlobalPrizePool;
        pixelClaimPool[x][y] += toPixelClaimPool;

        grid[x][y] = color;
        lastPainter[x][y] = painter;
        lastPaintedAt[x][y] = block.timestamp;

        emit PixelSet(x, y, color, painter, currentPrice);
    }

    function setPixel(uint256 x, uint256 y, uint32 color) external {
        _setPixel(x, y, color, msg.sender);
    }

    /**
     * @dev Optimized batch painting for agent-first efficiency.
     */
    function setPixels(uint256[] calldata x, uint256[] calldata y, uint32[] calldata colors) external {
        require(x.length == y.length && y.length == colors.length, "Array mismatch");
        for (uint256 i = 0; i < x.length; i++) {
            _setPixel(x[i], y[i], colors[i], msg.sender);
        }
    }

    function claimReward(uint256 x, uint256 y) external {
        require(x < 32 && y < 32, "Out of bounds");
        require(lastPaintedAt[x][y] != 0, "Pixel never painted");
        require(block.timestamp > lastPaintedAt[x][y] + SURVIVAL_TIME, "Pixel is still active");
        require(msg.sender == lastPainter[x][y], "Not the last painter");

        uint256 globalPrizeShare = (prizePool * GLOBAL_PRIZE_POOL_CLAIM_PERCENT) / 100;
        uint256 pixelSpecificReward = pixelClaimPool[x][y];
        uint256 totalReward = globalPrizeShare + pixelSpecificReward;

        require(totalReward > 0, "No reward to claim");

        prizePool -= globalPrizeShare;
        pixelClaimPool[x][y] = 0; 
        
        // Reset pixel to re-enable affordable competition
        lastPainter[x][y] = address(0);
        lastPaintedAt[x][y] = block.timestamp; 
        pixelCurrentFee[x][y] = initialPixelPrice;

        require(usdc.transfer(msg.sender, totalReward), "Reward transfer failed");

        emit RewardClaimed(x, y, msg.sender, globalPrizeShare, pixelSpecificReward);
    }

    function withdrawOwnerRevenue() external onlyOwner returns (uint256 amount) {
        require(ownerRevenueAccumulated > 0, "No revenue to withdraw");
        amount = ownerRevenueAccumulated; 
        ownerRevenueAccumulated = 0;
        require(usdc.transfer(payoutAddress, amount), "Owner revenue withdrawal failed");
        emit OwnerRevenueWithdrawn(payoutAddress, amount);
    }

    function getGrid() external view returns (uint32[32][32] memory) {
        return grid;
    }

    function getPixelCurrentFee(uint256 x, uint256 y) external view returns (uint256) {
        require(x < 32 && y < 32, "Out of bounds");
        return pixelCurrentFee[x][y] == 0 ? initialPixelPrice : pixelCurrentFee[x][y];
    }
}
