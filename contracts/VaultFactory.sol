// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract VaultFactory is Ownable {
    address[] public vaults;
    mapping(address => bool) public isVault;
    
    event VaultCreated(address indexed vaultProxy, address indexed implementation, address indexed token);
    event VaultUpgraded(address indexed vaultProxy, address indexed newImplementation);
    event VaultPaused(address indexed vault, bool paused);
    
    function createVault(address implementation, address token) external onlyOwner returns (address) {
        require(implementation != address(0), "Invalid implementation");
        require(token != address(0), "Invalid token");
        
        bytes memory data = abi.encodeWithSignature(
            "initialize(address,address)",
            token,
            address(this)
        );
        
        ERC1967Proxy proxy = new ERC1967Proxy(implementation, data);
        address vaultAddress = address(proxy);
        
        vaults.push(vaultAddress);
        isVault[vaultAddress] = true;
        
        emit VaultCreated(vaultAddress, implementation, token);
        return vaultAddress;
    }
    
    function upgradeVault(address vaultProxy, address newImplementation) external onlyOwner {
        require(isVault[vaultProxy], "Not a vault managed by this factory");
        require(newImplementation != address(0), "Invalid implementation");
        
        (bool success, ) = vaultProxy.call(
            abi.encodeWithSignature("upgradeTo(address)", newImplementation)
        );
        require(success, "Upgrade failed");
        
        emit VaultUpgraded(vaultProxy, newImplementation);
    }
    
    function upgradeVaultAndCall(
        address vaultProxy,
        address newImplementation,
        bytes memory data
    ) external onlyOwner {
        require(isVault[vaultProxy], "Not a vault managed by this factory");
        require(newImplementation != address(0), "Invalid implementation");
        
        (bool success, ) = vaultProxy.call(
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImplementation, data)
        );
        require(success, "Upgrade and call failed");
        
        emit VaultUpgraded(vaultProxy, newImplementation);
    }
    
    function pauseVault(address vaultProxy, bool _paused) external onlyOwner {
        require(isVault[vaultProxy], "Not a vault managed by this factory");
        
        (bool success, ) = vaultProxy.call(
            abi.encodeWithSignature("setPaused(bool)", _paused)
        );
        require(success, "Pause failed");
        
        emit VaultPaused(vaultProxy, _paused);
    }
    
    function setVaultWithdrawFee(address vaultProxy, uint256 bps) external onlyOwner {
        require(isVault[vaultProxy], "Not a vault managed by this factory");
        
        (bool success, ) = vaultProxy.call(
            abi.encodeWithSignature("setWithdrawFee(uint256)", bps)
        );
        require(success, "Set fee failed");
    }
    
    function setVaultFeeRecipient(address vaultProxy, address recipient) external onlyOwner {
        require(isVault[vaultProxy], "Not a vault managed by this factory");
        
        (bool success, ) = vaultProxy.call(
            abi.encodeWithSignature("setFeeRecipient(address)", recipient)
        );
        require(success, "Set recipient failed");
    }
    
    function getVaultCount() external view returns (uint256) {
        return vaults.length;
    }
    
    function getVault(uint256 index) external view returns (address) {
        require(index < vaults.length, "Index out of bounds");
        return vaults[index];
    }
    
    function getAllVaults() external view returns (address[] memory) {
        return vaults;
    }
}
