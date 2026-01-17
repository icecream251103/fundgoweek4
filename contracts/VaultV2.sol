// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./VaultV1.sol";

contract VaultV2 is VaultV1 {
    uint256 public withdrawFeeBps;
    address public feeRecipient;
    
    uint256 private constant MAX_FEE_BPS = 200;
    
    event WithdrawFeeSet(uint256 newFeeBps);
    event FeeRecipientSet(address newRecipient);
    event FeeCollected(address indexed recipient, uint256 amount);

    function initializeV2(uint256 _withdrawFeeBps, address _feeRecipient) external reinitializer(2) {
        require(_withdrawFeeBps <= MAX_FEE_BPS, "Fee exceeds maximum");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        
        withdrawFeeBps = _withdrawFeeBps;
        feeRecipient = _feeRecipient;
    }

    function setWithdrawFee(uint256 bps) external onlyFactory {
        require(bps <= MAX_FEE_BPS, "Fee exceeds maximum (200 bps = 2%)");
        withdrawFeeBps = bps;
        emit WithdrawFeeSet(bps);
    }

    function setFeeRecipient(address recipient) external onlyFactory {
        require(recipient != address(0), "Invalid recipient address");
        feeRecipient = recipient;
        emit FeeRecipientSet(recipient);
    }

    function withdraw(uint256 shareAmount) external override notPaused nonReentrant {
        require(shareAmount > 0, "Share amount must be greater than 0");
        require(shareAmount <= shares[msg.sender], "Insufficient shares");
        
        uint256 totalVaultBalance = token.balanceOf(address(this));
        uint256 amountBeforeFee = (shareAmount * totalVaultBalance) / totalShares;
        require(amountBeforeFee > 0, "Cannot withdraw 0 tokens");
        
        uint256 feeAmount = (amountBeforeFee * withdrawFeeBps) / 10000;
        uint256 amountToReturn = amountBeforeFee - feeAmount;
        
        totalShares -= shareAmount;
        shares[msg.sender] -= shareAmount;
        
        if (feeAmount > 0 && feeRecipient != address(0)) {
            require(token.transfer(feeRecipient, feeAmount), "Fee transfer failed");
            emit FeeCollected(feeRecipient, feeAmount);
        }
        
        require(token.transfer(msg.sender, amountToReturn), "Transfer failed");
        
        emit Withdrawn(msg.sender, shareAmount, amountToReturn);
    }

    function getVersion() public pure override returns (string memory) {
        return "v2";
    }

    function getWithdrawAmount(uint256 shareAmount) external view returns (uint256 amountAfterFee, uint256 feeAmount) {
        if (totalShares == 0) return (0, 0);
        
        uint256 totalVaultBalance = token.balanceOf(address(this));
        uint256 amountBeforeFee = (shareAmount * totalVaultBalance) / totalShares;
        
        feeAmount = (amountBeforeFee * withdrawFeeBps) / 10000;
        amountAfterFee = amountBeforeFee - feeAmount;
    }
}
