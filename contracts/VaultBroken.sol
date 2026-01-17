// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./VaultV1.sol";

contract VaultBroken is VaultV1 {
    bool public newFeature;
    uint256 public brokenVariable;
    
    function initializeBroken() external reinitializer(2) {
        newFeature = true;
        brokenVariable = 999;
    }

    function getVersion() public pure override returns (string memory) {
        return "broken";
    }
}
