const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VaultV1 Basic", function () {
  let vaultV1, vaultFactory, token;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy("Test Token", "TEST");
    await token.deployed();

    await token.transfer(user1.address, ethers.utils.parseEther("10000"));
    await token.transfer(user2.address, ethers.utils.parseEther("10000"));

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    vaultFactory = await VaultFactory.deploy();
    await vaultFactory.deployed();

    const VaultV1 = await ethers.getContractFactory("VaultV1");
    const vaultV1Implementation = await VaultV1.deploy();
    await vaultV1Implementation.deployed();

    const tx = await vaultFactory.createVault(vaultV1Implementation.address, token.address);
    const receipt = await tx.wait();
    const vaultCreatedEvent = receipt.events.find(e => e.event === "VaultCreated");
    const vaultAddress = vaultCreatedEvent.args.vaultProxy;

    vaultV1 = await ethers.getContractAt("VaultV1", vaultAddress);
  });

  it("Should initialize correctly", async function () {
    expect(await vaultV1.token()).to.equal(token.address);
    expect(await vaultV1.factory()).to.equal(vaultFactory.address);
    expect(await vaultV1.paused()).to.equal(false);
  });

  it("Should deposit successfully", async function () {
    const amount = ethers.utils.parseEther("1000");
    await token.connect(user1).approve(vaultV1.address, amount);
    await vaultV1.connect(user1).deposit(amount);

    const userShares = await vaultV1.shares(user1.address);
    expect(userShares).to.be.gt(0);
  });

  it("Should withdraw successfully", async function () {
    const amount = ethers.utils.parseEther("1000");
    await token.connect(user1).approve(vaultV1.address, amount);
    await vaultV1.connect(user1).deposit(amount);

    const userShares = await vaultV1.shares(user1.address);
    await vaultV1.connect(user1).withdraw(userShares);

    expect(await vaultV1.shares(user1.address)).to.equal(0);
  });
});
