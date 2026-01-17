import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("Vault Upgrade - V1 to V2", function () {
  let vaultProxy: Contract;
  let vaultFactory: Contract;
  let token: Contract;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let feeRecipient: Signer;
  let ownerAddress: string;
  let user1Address: string;
  let user2Address: string;
  let feeRecipientAddress: string;

  beforeEach(async function () {
    [owner, user1, user2, feeRecipient] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();
    feeRecipientAddress = await feeRecipient.getAddress();

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

  describe("State Persistence After Upgrade", function () {
    it("Should preserve all user shares after upgrade to V2", async function () {
      const user1SharesBefore = await vaultProxy.shares(user1Address);
      const user2SharesBefore = await vaultProxy.shares(user2Address);
      const totalSharesBefore = await vaultProxy.totalShares();
      const vaultBalanceBefore = await token.balanceOf(vaultProxy.address);

      const VaultV2 = await ethers.getContractFactory("VaultV2");
      const vaultV2Implementation = await VaultV2.deploy();
      await vaultV2Implementation.deployed();

      const initData = ethers.utils.defaultAbiCoder.encode(
        ["uint256", "address"],
        [100, feeRecipientAddress]
      );
      const calldata = vaultV2Implementation.interface.encodeFunctionData("initializeV2", [100, feeRecipientAddress]);

      await vaultFactory.upgradeVaultAndCall(
        vaultProxy.address,
        vaultV2Implementation.address,
        calldata
      );

      const vaultV2 = await ethers.getContractAt("VaultV2", vaultProxy.address);

      expect(await vaultV2.shares(user1Address)).to.equal(user1SharesBefore);
      expect(await vaultV2.shares(user2Address)).to.equal(user2SharesBefore);
      expect(await vaultV2.totalShares()).to.equal(totalSharesBefore);
      expect(await token.balanceOf(vaultV2.address)).to.equal(vaultBalanceBefore);
      expect(await vaultV2.token()).to.equal(token.address);
      expect(await vaultV2.factory()).to.equal(vaultFactory.address);
    });

    it("Should maintain correct share values after upgrade", async function () {
      const user1SharesBefore = await vaultProxy.shares(user1Address);
      const shareValueBefore = await vaultProxy.getShareValue(user1SharesBefore);

      const VaultV2 = await ethers.getContractFactory("VaultV2");
      const vaultV2Implementation = await VaultV2.deploy();
      await vaultV2Implementation.deployed();

      const calldata = vaultV2Implementation.interface.encodeFunctionData("initializeV2", [100, feeRecipientAddress]);
      await vaultFactory.upgradeVaultAndCall(
        vaultProxy.address,
        vaultV2Implementation.address,
        calldata
      );

      const vaultV2 = await ethers.getContractAt("VaultV2", vaultProxy.address);
      const shareValueAfter = await vaultV2.getShareValue(user1SharesBefore);

      expect(shareValueAfter).to.equal(shareValueBefore);
    });
  });

  describe("VaultV2 New Features", function () {
    let vaultV2: Contract;

    beforeEach(async function () {
      const VaultV2 = await ethers.getContractFactory("VaultV2");
      const vaultV2Implementation = await VaultV2.deploy();
      await vaultV2Implementation.deployed();

      const calldata = vaultV2Implementation.interface.encodeFunctionData("initializeV2", [100, feeRecipientAddress]);
      await vaultFactory.upgradeVaultAndCall(
        vaultProxy.address,
        vaultV2Implementation.address,
        calldata
      );

      vaultV2 = await ethers.getContractAt("VaultV2", vaultProxy.address);
    });

    it("Should return v2 version", async function () {
      expect(await vaultV2.getVersion()).to.equal("v2");
    });

    it("Should initialize with correct withdrawal fee", async function () {
      expect(await vaultV2.withdrawFeeBps()).to.equal(100);
      expect(await vaultV2.feeRecipient()).to.equal(feeRecipientAddress);
    });

    it("Should apply withdrawal fee correctly", async function () {
      const userShares = await vaultV2.shares(user1Address);
      const [amountAfterFee, feeAmount] = await vaultV2.getWithdrawAmount(userShares);
      
      const feeRecipientBalanceBefore = await token.balanceOf(feeRecipientAddress);
      const user1BalanceBefore = await token.balanceOf(user1Address);
      
      await vaultV2.connect(user1).withdraw(userShares);
      
      const feeRecipientBalanceAfter = await token.balanceOf(feeRecipientAddress);
      const user1BalanceAfter = await token.balanceOf(user1Address);
      
      expect(feeRecipientBalanceAfter.sub(feeRecipientBalanceBefore)).to.equal(feeAmount);
      expect(user1BalanceAfter.sub(user1BalanceBefore)).to.equal(amountAfterFee);
    });

    it("Should allow factory to update withdrawal fee", async function () {
      await vaultFactory.setVaultWithdrawFee(vaultV2.address, 150);
      expect(await vaultV2.withdrawFeeBps()).to.equal(150);
    });

    it("Should reject withdrawal fee above maximum", async function () {
      await expect(
        vaultFactory.setVaultWithdrawFee(vaultV2.address, 201)
      ).to.be.revertedWith("Fee exceeds maximum (200 bps = 2%)");
    });

    it("Should allow factory to update fee recipient", async function () {
      const newRecipient = await user2.getAddress();
      await vaultFactory.setVaultFeeRecipient(vaultV2.address, newRecipient);
      expect(await vaultV2.feeRecipient()).to.equal(newRecipient);
    });

    it("Should not allow non-factory to set fee", async function () {
      await expect(
        vaultV2.connect(user1).setWithdrawFee(150)
      ).to.be.revertedWith("Only factory can call");
    });
  });

  describe("Upgrade Access Control", function () {
    it("Should not allow non-owner to upgrade", async function () {
      const VaultV2 = await ethers.getContractFactory("VaultV2");
      const vaultV2Implementation = await VaultV2.deploy();
      await vaultV2Implementation.deployed();

      await expect(
        vaultFactory.connect(user1).upgradeVault(vaultProxy.address, vaultV2Implementation.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow direct upgradeTo call", async function () {
      const VaultV2 = await ethers.getContractFactory("VaultV2");
      const vaultV2Implementation = await VaultV2.deploy();
      await vaultV2Implementation.deployed();

      await expect(
        vaultProxy.connect(user1).upgradeTo(vaultV2Implementation.address)
      ).to.be.reverted;
    });
  });

  describe("Functional Tests After Upgrade", function () {
    let vaultV2: Contract;

    beforeEach(async function () {
      const VaultV2 = await ethers.getContractFactory("VaultV2");
      const vaultV2Implementation = await VaultV2.deploy();
      await vaultV2Implementation.deployed();

      const calldata = vaultV2Implementation.interface.encodeFunctionData("initializeV2", [100, feeRecipientAddress]);
      await vaultFactory.upgradeVaultAndCall(
        vaultProxy.address,
        vaultV2Implementation.address,
        calldata
      );

      vaultV2 = await ethers.getContractAt("VaultV2", vaultProxy.address);
    });

    it("Should allow deposits after upgrade", async function () {
      const depositAmount = ethers.utils.parseEther("500");
      await token.connect(user1).approve(vaultV2.address, depositAmount);
      
      const sharesBefore = await vaultV2.shares(user1Address);
      await vaultV2.connect(user1).deposit(depositAmount);
      const sharesAfter = await vaultV2.shares(user1Address);
      
      expect(sharesAfter).to.be.gt(sharesBefore);
    });

    it("Should maintain pause functionality after upgrade", async function () {
      await vaultFactory.pauseVault(vaultV2.address, true);
      expect(await vaultV2.paused()).to.equal(true);
      
      const userShares = await vaultV2.shares(user1Address);
      await expect(
        vaultV2.connect(user1).withdraw(userShares)
      ).to.be.revertedWith("Vault is paused");
    });

    it("Should maintain reentrancy protection after upgrade", async function () {
      const userShares = await vaultV2.shares(user1Address);
      await vaultV2.connect(user1).withdraw(userShares);
    });
  });
});
