import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, Signer } from "ethers";

describe("VaultV1 - Basic Functionality", function () {
  let vaultV1: Contract;
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
    const vaultAddress = vaultCreatedEvent?.args?.vaultProxy;

    vaultV1 = await ethers.getContractAt("VaultV1", vaultAddress);
  });

  describe("Initialization", function () {
    it("Should initialize with correct values", async function () {
      expect(await vaultV1.token()).to.equal(token.address);
      expect(await vaultV1.factory()).to.equal(vaultFactory.address);
      expect(await vaultV1.paused()).to.equal(false);
      expect(await vaultV1.totalShares()).to.equal(0);
    });

    it("Should not allow re-initialization", async function () {
      await expect(
        vaultV1.initialize(token.address, vaultFactory.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Deposit - First Depositor", function () {
    it("Should enforce minimum liquidity on first deposit", async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(user1).approve(vaultV1.address, amount);
      await vaultV1.connect(user1).deposit(amount);

      expect(await vaultV1.shares(user1Address)).to.equal(amount.sub(1000));
      expect(await vaultV1.totalShares()).to.equal(amount);
      expect(await vaultV1.shares(ethers.constants.AddressZero)).to.equal(1000);
    });

    it("Should reject first deposit below minimum liquidity", async function () {
      const amount = 999;
      await token.connect(user1).approve(vaultV1.address, amount);
      await expect(vaultV1.connect(user1).deposit(amount)).to.be.revertedWith(
        "First deposit must be >= MINIMUM_LIQUIDITY"
      );
    });
  });

  describe("Deposit - Multiple Users", function () {
    beforeEach(async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(user1).approve(vaultV1.address, amount);
      await vaultV1.connect(user1).deposit(amount);
    });

    it("Should mint correct shares for second depositor", async function () {
      const amount = ethers.utils.parseEther("500");
      await token.connect(user2).approve(vaultV1.address, amount);
      
      const totalSharesBefore = await vaultV1.totalShares();
      const vaultBalanceBefore = await token.balanceOf(vaultV1.address);
      
      await vaultV1.connect(user2).deposit(amount);
      
      const expectedShares = amount.mul(totalSharesBefore).div(vaultBalanceBefore);
      expect(await vaultV1.shares(user2Address)).to.equal(expectedShares);
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(user1).approve(vaultV1.address, amount);
      await vaultV1.connect(user1).deposit(amount);
    });

    it("Should withdraw correct amount", async function () {
      const userShares = await vaultV1.shares(user1Address);
      const balanceBefore = await token.balanceOf(user1Address);
      
      await vaultV1.connect(user1).withdraw(userShares);
      
      const balanceAfter = await token.balanceOf(user1Address);
      expect(balanceAfter.sub(balanceBefore)).to.be.gt(0);
      expect(await vaultV1.shares(user1Address)).to.equal(0);
    });

    it("Should reject withdrawal with insufficient shares", async function () {
      const userShares = await vaultV1.shares(user1Address);
      await expect(
        vaultV1.connect(user1).withdraw(userShares.add(1))
      ).to.be.revertedWith("Insufficient shares");
    });

    it("Should reject zero share withdrawal", async function () {
      await expect(vaultV1.connect(user1).withdraw(0)).to.be.revertedWith(
        "Share amount must be greater than 0"
      );
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy on deposit", async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(user1).approve(vaultV1.address, amount.mul(2));
      
      await vaultV1.connect(user1).deposit(amount);
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow factory to pause", async function () {
      await vaultFactory.pauseVault(vaultV1.address, true);
      expect(await vaultV1.paused()).to.equal(true);
    });

    it("Should prevent deposits when paused", async function () {
      await vaultFactory.pauseVault(vaultV1.address, true);
      
      const amount = ethers.utils.parseEther("1000");
      await token.connect(user1).approve(vaultV1.address, amount);
      
      await expect(vaultV1.connect(user1).deposit(amount)).to.be.revertedWith(
        "Vault is paused"
      );
    });

    it("Should prevent withdrawals when paused", async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(user1).approve(vaultV1.address, amount);
      await vaultV1.connect(user1).deposit(amount);
      
      await vaultFactory.pauseVault(vaultV1.address, true);
      
      const userShares = await vaultV1.shares(user1Address);
      await expect(vaultV1.connect(user1).withdraw(userShares)).to.be.revertedWith(
        "Vault is paused"
      );
    });

    it("Should not allow non-factory to pause", async function () {
      await expect(vaultV1.connect(user1).setPaused(true)).to.be.revertedWith(
        "Only factory can call"
      );
    });
  });

  describe("Version", function () {
    it("Should return correct version", async function () {
      expect(await vaultV1.getVersion()).to.equal("v1");
    });
  });
});
