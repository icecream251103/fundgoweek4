// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract VaultV1 is Initializable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    IERC20Upgradeable public token;
    address public factory;
    uint256 public totalShares;
    mapping(address => uint256) public shares;
    bool public paused;
    
    uint256 private constant MINIMUM_LIQUIDITY = 1000;
    
    event Deposited(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed user, uint256 sharesBurned, uint256 amountReceived);
    event Paused(bool status);

    modifier notPaused() {
        require(!paused, "Vault is paused");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory can call");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address _token, address _factory) external initializer {
        require(_token != address(0), "Invalid token address");
        require(_factory != address(0), "Invalid factory address");
        
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        token = IERC20Upgradeable(_token);
        factory = _factory;
        paused = false;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyFactory {}

    function deposit(uint256 amount) external notPaused nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 balanceBefore = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        uint256 sharesToMint;
        
        if (totalShares == 0) {
            require(amount >= MINIMUM_LIQUIDITY, "First deposit must be >= MINIMUM_LIQUIDITY");
            sharesToMint = amount;
            totalShares = MINIMUM_LIQUIDITY;
            shares[address(0)] = MINIMUM_LIQUIDITY;
            sharesToMint -= MINIMUM_LIQUIDITY;
        } else {
            sharesToMint = (amount * totalShares) / balanceBefore;
            require(sharesToMint > 0, "Shares to mint must be > 0");
        }
        
        totalShares += sharesToMint;
        shares[msg.sender] += sharesToMint;
        
        emit Deposited(msg.sender, amount, sharesToMint);
    }

    function withdraw(uint256 shareAmount) external virtual notPaused nonReentrant {
        require(shareAmount > 0, "Share amount must be greater than 0");
        require(shareAmount <= shares[msg.sender], "Insufficient shares");
        
        uint256 totalVaultBalance = token.balanceOf(address(this));
        uint256 amountToReturn = (shareAmount * totalVaultBalance) / totalShares;
        require(amountToReturn > 0, "Cannot withdraw 0 tokens");
        
        totalShares -= shareAmount;
        shares[msg.sender] -= shareAmount;
        
        require(token.transfer(msg.sender, amountToReturn), "Transfer failed");
        
        emit Withdrawn(msg.sender, shareAmount, amountToReturn);
    }

    function setPaused(bool _paused) external onlyFactory {
        paused = _paused;
        emit Paused(_paused);
    }

    function getVersion() public pure virtual returns (string memory) {
        return "v1";
    }

    function getUserShares(address user) external view returns (uint256) {
        return shares[user];
    }

    function getTotalShares() external view returns (uint256) {
        return totalShares;
    }

    function getShareValue(uint256 shareAmount) external view returns (uint256) {
        if (totalShares == 0) return 0;
        uint256 totalVaultBalance = token.balanceOf(address(this));
        return (shareAmount * totalVaultBalance) / totalShares;
    }
}
