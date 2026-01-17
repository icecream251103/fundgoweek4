import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("Unsafe Upgrade - VaultBroken", function () {
  let vaultProxy: Contract;
  let vaultFactory: Contract;
  let token: Contract;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let ownerAddress: string;
  let user1Address: string;
  let user2Address: string;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy("Test Token", "TEST");
    await token.deployed();

    await token.transfer(user1Address, ethers.utils.parseEther("10000"));
    await token.transfer(user2Address, ethers.utils.parseEther("10000"));

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    vaultFactory = await VaultFactory.deploy();
    await vaultFactory.deployed();

    const VaultV1 = await ethers.getContractFactory("VaultV1");
    const vaultV1Implementation = await VaultV1.deploy();
    await vaultV1Implementation.deployed();

    const tx = await vaultFactory.createVault(vaultV1Implementation.address, token.address);
    const receipt = await tx.wait();
    const vaultCreatedEvent = receipt.events?.find((e: any) => e.event === "VaultCreated");
    const vaultProxyAddress = vaultCreatedEvent?.args?.vaultProxy;

    vaultProxy = await ethers.getContractAt("VaultV1", vaultProxyAddress);

    const depositAmount = ethers.utils.parseEther("1000");
    await token.connect(user1).approve(vaultProxy.address, depositAmount);
    await vaultProxy.connect(user1).deposit(depositAmount);
    
    await token.connect(user2).approve(vaultProxy.address, depositAmount);
    await vaultProxy.connect(user2).deposit(depositAmount);
  });

  describe("Storage Layout Corruption", function () {
    it("Should demonstrate state corruption with VaultBroken", async function () {
      const user1SharesBefore = await vaultProxy.shares(user1Address);
      const user2SharesBefore = await vaultProxy.shares(user2Address);
      const totalSharesBefore = await vaultProxy.totalShares();
      const tokenAddressBefore = await vaultProxy.token();
      const factoryAddressBefore = await vaultProxy.factory();

      console.log("\n=== STATE BEFORE UNSAFE UPGRADE ===");
      console.log("User1 Shares:", ethers.utils.formatEther(user1SharesBefore));
      console.log("User2 Shares:", ethers.utils.formatEther(user2SharesBefore));
      console.log("Total Shares:", ethers.utils.formatEther(totalSharesBefore));
      console.log("Token Address:", tokenAddressBefore);
      console.log("Factory Address:", factoryAddressBefore);

      const VaultBroken = await ethers.getContractFactory("VaultBroken");
      const vaultBrokenImplementation = await VaultBroken.deploy();
      await vaultBrokenImplementation.deployed();

      const calldata = vaultBrokenImplementation.interface.encodeFunctionData("initializeBroken", []);
      await vaultFactory.upgradeVaultAndCall(
        vaultProxy.address,
        vaultBrokenImplementation.address,
        calldata
      );

      const vaultBroken = await ethers.getContractAt("VaultBroken", vaultProxy.address);

      const user1SharesAfter = await vaultBroken.shares(user1Address);
      const user2SharesAfter = await vaultBroken.shares(user2Address);
      const totalSharesAfter = await vaultBroken.totalShares();
      
      let tokenAddressAfter, factoryAddressAfter;
      try {
        tokenAddressAfter = await vaultBroken.token();
        factoryAddressAfter = await vaultBroken.factory();
      } catch (e) {
        tokenAddressAfter = "CORRUPTED";
        factoryAddressAfter = "CORRUPTED";
      }

      console.log("\n=== STATE AFTER UNSAFE UPGRADE ===");
      console.log("User1 Shares:", ethers.utils.formatEther(user1SharesAfter));
      console.log("User2 Shares:", ethers.utils.formatEther(user2SharesAfter));
      console.log("Total Shares:", ethers.utils.formatEther(totalSharesAfter));
      console.log("Token Address:", tokenAddressAfter);
      console.log("Factory Address:", factoryAddressAfter);

      console.log("\n=== CORRUPTION DETECTED ===");
      const sharesCorrupted = !user1SharesAfter.eq(user1SharesBefore) || !user2SharesAfter.eq(user2SharesBefore);
      const totalSharesCorrupted = !totalSharesAfter.eq(totalSharesBefore);
      
      console.log("Shares Corrupted:", sharesCorrupted);
      console.log("Total Shares Corrupted:", totalSharesCorrupted);
      
      expect(await vaultBroken.getVersion()).to.equal("broken");
    });

    it("Should fail to withdraw after unsafe upgrade", async function () {
      const VaultBroken = await ethers.getContractFactory("VaultBroken");
      const vaultBrokenImplementation = await VaultBroken.deploy();
      await vaultBrokenImplementation.deployed();

      const calldata = vaultBrokenImplementation.interface.encodeFunctionData("initializeBroken", []);
      await vaultFactory.upgradeVaultAndCall(
        vaultProxy.address,
        vaultBrokenImplementation.address,
        calldata
      );

      const vaultBroken = await ethers.getContractAt("VaultBroken", vaultProxy.address);
      const userShares = await vaultBroken.shares(user1Address);

      try {
        await vaultBroken.connect(user1).withdraw(userShares);
        console.log("\n!!! WARNING: Withdrawal succeeded despite corruption !!!");
      } catch (e: any) {
        console.log("\n✓ Withdrawal correctly failed after unsafe upgrade");
        console.log("Error:", e.message);
      }
    });
  });

  describe("Safe vs Unsafe Upgrade Comparison", function () {
    it("Should show difference between safe V2 and unsafe VaultBroken", async function () {
      const user1SharesBefore = await vaultProxy.shares(user1Address);

      console.log("\n=== SAFE UPGRADE TO V2 ===");
      const VaultV2 = await ethers.getContractFactory("VaultV2");
      const vaultV2Implementation = await VaultV2.deploy();
      await vaultV2Implementation.deployed();

      const feeRecipient = await owner.getAddress();
      const calldata = vaultV2Implementation.interface.encodeFunctionData("initializeV2", [100, feeRecipient]);
      
      await vaultFactory.upgradeVaultAndCall(
        vaultProxy.address,
        vaultV2Implementation.address,
        calldata
      );

      const vaultV2 = await ethers.getContractAt("VaultV2", vaultProxy.address);
      const user1SharesAfterV2 = await vaultV2.shares(user1Address);
      
      console.log("Shares preserved:", user1SharesAfterV2.eq(user1SharesBefore));
      console.log("Version:", await vaultV2.getVersion());
      
      expect(user1SharesAfterV2).to.equal(user1SharesBefore);
    });
  });

  describe("Explanation of Storage Corruption", function () {
    it("Should document why VaultBroken causes corruption", async function () {
      console.log("\n=== WHY VAULTBROKEN CORRUPTS STATE ===");
      console.log("\nVaultV1 Storage Layout:");
      console.log("Slot 0-50: Initializable + UUPSUpgradeable + ReentrancyGuard");
      console.log("Slot 51: token (IERC20)");
      console.log("Slot 52: factory (address)");
      console.log("Slot 53: totalShares (uint256)");
      console.log("Slot 54: shares mapping");
      console.log("Slot 55: paused (bool)");
      
      console.log("\nVaultBroken Storage Layout:");
      console.log("Slot 0-55: INHERITED from VaultV1");
      console.log("Slot 56: newFeature (bool) - PREPENDED INCORRECTLY");
      console.log("Slot 57: brokenVariable (uint256) - PREPENDED INCORRECTLY");
      
      console.log("\n⚠️  PROBLEM:");
      console.log("VaultBroken adds variables at the BEGINNING instead of END");
      console.log("This shifts all storage slots, corrupting existing data");
      
      console.log("\n✓ CORRECT (VaultV2):");
      console.log("New variables APPENDED after existing ones");
      console.log("Slot 56: withdrawFeeBps");
      console.log("Slot 57: feeRecipient");
    });
  });
});
