const { ethers } = require("hardhat");

async function main() {
  console.log("\n=== DEPLOYMENT STARTING ===\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "BNB\n");

  console.log("Step 1: Deploying MockToken...");
  const MockToken = await ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy("Week4 Token", "W4TKN");
  await token.deployed();
  console.log("✓ MockToken deployed to:", token.address);

  console.log("\nStep 2: Deploying VaultFactory...");
  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const factory = await VaultFactory.deploy();
  await factory.deployed();
  console.log("✓ VaultFactory deployed to:", factory.address);

  console.log("\nStep 3: Deploying VaultV1 Implementation...");
  const VaultV1 = await ethers.getContractFactory("VaultV1");
  const vaultV1Impl = await VaultV1.deploy();
  await vaultV1Impl.deployed();
  console.log("✓ VaultV1 Implementation deployed to:", vaultV1Impl.address);

  console.log("\nStep 4: Creating Vault Proxy via Factory...");
  const tx = await factory.createVault(vaultV1Impl.address, token.address);
  const receipt = await tx.wait();
  const vaultCreatedEvent = receipt.events.find(e => e.event === "VaultCreated");
  const vaultProxyAddress = vaultCreatedEvent.args.vaultProxy;
  console.log("✓ Vault Proxy created at:", vaultProxyAddress);

  const vault = await ethers.getContractAt("VaultV1", vaultProxyAddress);
  console.log("✓ Vault version:", await vault.getVersion());

  console.log("\nStep 5: Testing deposit functionality...");
  const depositAmount = ethers.utils.parseEther("1000");
  const approveTx = await token.approve(vault.address, depositAmount);
  await approveTx.wait();
  console.log("✓ Approved tokens");
  
  const depositTx = await vault.deposit(depositAmount);
  await depositTx.wait();
  console.log("✓ Deposited:", ethers.utils.formatEther(depositAmount), "tokens");
  console.log("✓ User shares:", ethers.utils.formatEther(await vault.shares(deployer.address)));

  console.log("\nStep 6: Deploying VaultV2 Implementation...");
  const VaultV2 = await ethers.getContractFactory("VaultV2");
  const vaultV2Impl = await VaultV2.deploy();
  await vaultV2Impl.deployed();
  console.log("✓ VaultV2 Implementation deployed to:", vaultV2Impl.address);

  console.log("\nStep 7: Upgrading Vault to V2...");
  const feeRecipient = deployer.address;
  const withdrawFeeBps = 100;
  
  const VaultV2Interface = new ethers.utils.Interface([
    "function initializeV2(uint256 _withdrawFeeBps, address _feeRecipient)"
  ]);
  const initData = VaultV2Interface.encodeFunctionData("initializeV2", [withdrawFeeBps, feeRecipient]);
  
  const upgradeTx = await factory.upgradeVaultAndCall(
    vaultProxyAddress,
    vaultV2Impl.address,
    initData
  );
  await upgradeTx.wait();
  console.log("✓ Vault upgraded to V2");

  const vaultV2 = await ethers.getContractAt("VaultV2", vaultProxyAddress);
  console.log("✓ Vault version:", await vaultV2.getVersion());
  console.log("✓ Withdrawal fee:", (await vaultV2.withdrawFeeBps()).toString(), "bps");
  console.log("✓ Fee recipient:", await vaultV2.feeRecipient());

  console.log("\nStep 8: Verifying state persistence...");
  const sharesAfterUpgrade = await vaultV2.shares(deployer.address);
  console.log("✓ Shares preserved:", ethers.utils.formatEther(sharesAfterUpgrade));

  console.log("\nStep 9: Testing withdrawal with fees...");
  const withdrawShares = ethers.utils.parseEther("100");
  const [amountAfterFee, feeAmount] = await vaultV2.getWithdrawAmount(withdrawShares);
  console.log("✓ Amount to receive:", ethers.utils.formatEther(amountAfterFee));
  console.log("✓ Fee amount:", ethers.utils.formatEther(feeAmount));

  const withdrawTx = await vaultV2.withdraw(withdrawShares);
  await withdrawTx.wait();
  console.log("✓ Withdrawal successful");

  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("MockToken:", token.address);
  console.log("VaultFactory:", factory.address);
  console.log("VaultV1 Implementation:", vaultV1Impl.address);
  console.log("VaultV2 Implementation:", vaultV2Impl.address);
  console.log("Vault Proxy:", vaultProxyAddress);
  console.log("\n=== DEPLOYMENT COMPLETE ===\n");

  console.log("BSCScan Links (Testnet):");
  console.log(`Token: https://testnet.bscscan.com/address/${token.address}`);
  console.log(`Factory: https://testnet.bscscan.com/address/${factory.address}`);
  console.log(`VaultV1 Impl: https://testnet.bscscan.com/address/${vaultV1Impl.address}`);
  console.log(`VaultV2 Impl: https://testnet.bscscan.com/address/${vaultV2Impl.address}`);
  console.log(`Vault Proxy: https://testnet.bscscan.com/address/${vaultProxyAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
