// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PixelGridV2
 * @dev Optimized version of the Agent-Canvas PixelGrid. 
 * Features bit-packed storage, internal ledgers for gas efficiency, 
 * and escalating timers to combat bot snipers.
 */
contract PixelGridV2 is Ownable {
    IERC20 public immutable usdc;
    address public immutable payoutAddress;
    
    uint256 public initialPixelPrice; // e.g., 0.01 USDC
    uint256 public feeIncrementPercent; 
    
    // Constant parameters
    uint256 public constant REVENUE_PERCENT = 5;
    uint256 public constant PRIZE_POOL_PERCENT = 95;
    uint256 public constant BASE_SURVIVAL_TIME = 15 minutes;
    uint256 public constant TIME_INCREMENT_PER_FLIP = 30; // seconds
    
    uint256 public constant GLOBAL_PRIZE_POOL_CLAIM_PERCENT = 10;
    uint256 public constant PIXEL_CLAIM_POOL_CONTRIBUTION_PERCENT = 20;
    uint256 public constant GLOBAL_PRIZE_POOL_CONTRIBUTION_PERCENT = 80;

    // Bit-Packed Grid: [painter(160) | color(24) | timestamp(32) | fee(32) | extraTime(8)]
    uint256[1024] public pixelData;
    
    uint256 public prizePool; // Global reward fund
    mapping(uint256 => uint256) public pixelClaimPool; // Index-based mapping
    mapping(address => uint256) public userBalances; // Internal USDC ledger
    uint256 public ownerRevenueAccumulated;

    event PixelSet(uint256 indexed index, uint32 color, address indexed painter, uint256 pricePaid, uint256 survivalRequired);
    event RewardClaimed(uint256 indexed index, address indexed claimant, uint256 globalReward, uint256 pixelReward);
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);

    constructor(address _usdc, address _payoutAddress, uint256 _initialPixelPrice, uint256 _feeIncrementPercent) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        payoutAddress = _payoutAddress;
        initialPixelPrice = _initialPixelPrice;
        feeIncrementPercent = _feeIncrementPercent;
    }

    /**
     * @dev Deposit USDC into internal ledger to reduce gas for painting.
     */
    function depositUSDC(uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "Deposit failed");
        userBalances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdrawUSDC(uint256 amount) external {
        require(userBalances[msg.sender] >= amount, "Insufficient balance");
        userBalances[msg.sender] -= amount;
        require(usdc.transfer(msg.sender, amount), "Withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }

    function _setPixel(uint256 x, uint256 y, uint32 color, address painter) internal {
        require(x < 32 && y < 32, "Out of bounds");
        uint256 index = x * 32 + y;
        uint256 packed = pixelData[index];

        // Unpack
        address currentPainter = address(uint160(packed));
        uint256 currentFee = (packed >> 216) & 0xFFFFFFFF;
        uint256 lastPaintedAt = (packed >> 184) & 0xFFFFFFFF;
        uint256 extraTimeUnits = (packed >> 248) & 0xFF;

        if (currentFee == 0) currentFee = initialPixelPrice;

        // Escalation Logic
        if (currentPainter != address(0) && painter != currentPainter) {
            currentFee = currentFee + (currentFee * feeIncrementPercent) / 100;
            // Add survival penalty if flipped before expiry
            if (block.timestamp < lastPaintedAt + BASE_SURVIVAL_TIME + (extraTimeUnits * TIME_INCREMENT_PER_FLIP)) {
                if (extraTimeUnits < 255) extraTimeUnits += 1; // Cap at +127.5 mins
            }
        }

        // Deduct from internal balance
        require(userBalances[msg.sender] >= currentFee, "Insufficient internal balance");
        userBalances[msg.sender] -= currentFee;

        // Revenue & Prize Splits
        uint256 revenueShare = (currentFee * REVENUE_PERCENT) / 100;
        uint256 poolShare = (currentFee * PRIZE_POOL_PERCENT) / 100;

        ownerRevenueAccumulated += revenueShare;
        prizePool += (poolShare * GLOBAL_PRIZE_POOL_CONTRIBUTION_PERCENT) / 100;
        pixelClaimPool[index] += (poolShare * PIXEL_CLAIM_POOL_CONTRIBUTION_PERCENT) / 100;

        // Re-Pack
        // painter(160) | color(24) << 160 | timestamp(32) << 184 | fee(32) << 216 | extra(8) << 248
        uint256 newPacked = uint256(uint160(painter)) 
            | (uint256(color & 0xFFFFFF) << 160) 
            | (uint256(block.timestamp) << 184) 
            | (uint256(currentFee) << 216) 
            | (uint256(extraTimeUnits) << 248);
        
        pixelData[index] = newPacked;

        emit PixelSet(index, color, painter, currentFee, BASE_SURVIVAL_TIME + (extraTimeUnits * TIME_INCREMENT_PER_FLIP));
    }

    function setPixel(uint256 x, uint256 y, uint32 color) external {
        _setPixel(x, y, color, msg.sender);
    }

    function setPixels(uint256[] calldata x, uint256[] calldata y, uint32[] calldata colors) external {
        uint256 len = x.length;
        require(len == y.length && len == colors.length, "Mismatch");
        for (uint256 i = 0; i < len; ++i) {
            _setPixel(x[i], y[i], colors[i], msg.sender);
        }
    }

    function claimReward(uint256 x, uint256 y) external {
        uint256 index = x * 32 + y;
        uint256 packed = pixelData[index];

        address currentPainter = address(uint160(packed));
        uint256 lastPaintedAt = (packed >> 184) & 0xFFFFFFFF;
        uint256 extraTimeUnits = (packed >> 248) & 0xFF;
        uint256 totalSurvivalRequired = BASE_SURVIVAL_TIME + (extraTimeUnits * TIME_INCREMENT_PER_FLIP);

        require(currentPainter == msg.sender, "Not yours");
        require(block.timestamp > lastPaintedAt + totalSurvivalRequired, "Too soon");

        uint256 globalShare = (prizePool * GLOBAL_PRIZE_POOL_CLAIM_PERCENT) / 100;
        uint256 pixelShare = pixelClaimPool[index];
        uint256 total = globalShare + pixelShare;

        prizePool -= globalShare;
        pixelClaimPool[index] = 0;

        // Reset Pixel (Resets fee and extra time)
        pixelData[index] = 0; // Wipes all data, resetting price to initial on next paint

        userBalances[msg.sender] += total; // Payout to internal ledger (agent can withdraw later)
        emit RewardClaimed(index, msg.sender, globalShare, pixelShare);
    }

    function withdrawOwnerRevenue() external onlyOwner {
        uint256 amount = ownerRevenueAccumulated;
        ownerRevenueAccumulated = 0;
        require(usdc.transfer(payoutAddress, amount), "Fail");
    }

    // View helpers
    function getPixelInfo(uint256 x, uint256 y) external view returns (
        address painter, uint32 color, uint256 lastPaintedAt, uint256 currentFee, uint256 survivalRequired
    ) {
        uint256 packed = pixelData[x * 32 + y];
        painter = address(uint160(packed));
        color = uint32((packed >> 160) & 0xFFFFFF);
        lastPaintedAt = (packed >> 184) & 0xFFFFFFFF;
        currentFee = (packed >> 216) & 0xFFFFFFFF;
        if (currentFee == 0) currentFee = initialPixelPrice;
        survivalRequired = BASE_SURVIVAL_TIME + (((packed >> 248) & 0xFF) * TIME_INCREMENT_PER_FLIP);
    }
}
