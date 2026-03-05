import { expect } from "chai";
import { ethers } from "hardhat";

describe("PassStore MVP", function () {
  async function deployFixture() {
    const [admin, issuer, user] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("PassRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    const Broker = await ethers.getContractFactory("KycSessionBroker");
    const broker = await Broker.deploy();
    await broker.waitForDeployment();

    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    const assetRegistry = await AssetRegistry.deploy(await registry.getAddress(), 1n);
    await assetRegistry.waitForDeployment();

    await (await registry.setIssuer(issuer.address, true)).wait();
    await (await broker.setIssuer(issuer.address, true)).wait();
    await (await assetRegistry.setIssuer(issuer.address, true)).wait();

    await (await registry.createPolicy(1n, 100, 0, true, true)).wait();
    await (await registry.createPolicy(5n, 100, 0, true, true)).wait();

    const AccessPass = await ethers.getContractFactory("AccessPass");
    const accessPass = await AccessPass.deploy(await registry.getAddress(), 0n);
    await accessPass.waitForDeployment();

    const ClaimDrop = await ethers.getContractFactory("ClaimDrop");
    const claimDrop = await ClaimDrop.deploy(await registry.getAddress(), 0n, 1000n);
    await claimDrop.waitForDeployment();

    return { admin, issuer, user, registry, broker, accessPass, claimDrop, assetRegistry };
  }

  it("rejects user without attestation", async () => {
    const { user, registry } = await deployFixture();

    const result = await registry.verifyUser(user.address, 0n);
    expect(result[0]).to.equal(false);
    expect(result[1]).to.equal(1n);
  });

  it("allows mint + claim after attestation", async () => {
    const { user, issuer, registry, accessPass, claimDrop } = await deployFixture();

    const now = Math.floor(Date.now() / 1000);

    await (
      await registry.connect(issuer).attest(user.address, {
        flags: 1n,
        expiration: BigInt(now + 3600),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    await expect(accessPass.connect(user).mint()).to.emit(accessPass, "PassMinted");
    await expect(claimDrop.connect(user).claim()).to.emit(claimDrop, "Claimed");
  });

  it("treats expiration=0 as non-expiring when policy requires unexpired", async () => {
    const { user, issuer, registry } = await deployFixture();

    await (
      await registry.connect(issuer).attest(user.address, {
        flags: 1n,
        expiration: 0n,
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    const result = await registry.verifyUser(user.address, 0n);
    expect(result[0]).to.equal(true);
    expect(result[1]).to.equal(0n);
  });

  it("blocks after revoke", async () => {
    const { user, issuer, registry, accessPass } = await deployFixture();

    const now = Math.floor(Date.now() / 1000);

    await (
      await registry.connect(issuer).attest(user.address, {
        flags: 1n,
        expiration: BigInt(now + 3600),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    await (await registry.connect(issuer).revoke(user.address)).wait();

    await expect(accessPass.connect(user).mint()).to.be.revertedWithCustomError(accessPass, "NotEligible");
  });

  it("requests on-demand KYC sync with cooldown", async () => {
    const { user, broker } = await deployFixture();

    await (await broker.connect(user).setEncryptionPubKey("0x11223344")).wait();
    await (await broker.connect(user).requestKyc("basic-kyc")).wait();

    await expect(broker.connect(user).requestKycSync()).to.emit(broker, "KycSyncRequested");

    await expect(broker.connect(user).requestKycSync()).to.be.revertedWith("KycSessionBroker: sync cooldown");

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await expect(broker.connect(user).requestKycSync()).to.emit(broker, "KycSyncRequested");
  });

  it("emits world id verification request event", async () => {
    const { user, broker } = await deployFixture();

    await expect(
      broker.connect(user).requestWorldIdVerification("proof-data", "root-data", "nullifier-data", "device")
    ).to.emit(broker, "WorldIdVerificationRequested");
  });

  it("enforces predictable packet overwrite rules", async () => {
    const { user, issuer, broker } = await deployFixture();

    await (await broker.connect(user).setEncryptionPubKey("0x11223344")).wait();
    await (await broker.connect(user).requestKyc("basic-kyc")).wait();

    const requestId = await broker.latestKycRequestId(user.address);
    const now = BigInt((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);

    await expect(broker.connect(issuer).storeEncryptedToken(requestId, "0x", now + 60n)).to.be.revertedWith(
      "KycSessionBroker: empty ciphertext"
    );

    await expect(
      broker.connect(issuer).storeEncryptedToken(requestId, "0x1122", now)
    ).to.be.revertedWith("KycSessionBroker: invalid expiresAt");

    await expect(broker.connect(issuer).storeEncryptedToken(requestId, "0x1122", now + 60n)).to.emit(
      broker,
      "TokenStored"
    );

    await (await broker.connect(user).markConsumed(requestId)).wait();

    await expect(
      broker.connect(issuer).storeEncryptedToken(requestId, "0x3344", now + 120n)
    ).to.be.revertedWith("KycSessionBroker: packet consumed");
  });

  it("enforces KYB only after active KYC", async () => {
    const { user, issuer, registry } = await deployFixture();
    const now = Math.floor(Date.now() / 1000);

    await expect(
      registry.connect(issuer).attest(user.address, {
        flags: 4n,
        expiration: BigInt(now + 3600),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).to.be.revertedWith("PassRegistry: kyb requires active kyc");

    await (
      await registry.connect(issuer).attest(user.address, {
        flags: 1n,
        expiration: BigInt(now + 3600),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    await expect(
      registry.connect(issuer).attest(user.address, {
        flags: 5n,
        expiration: BigInt(now + 3600),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).to.emit(registry, "Attested");
  });

  it("verifies asset only for KYB-verified owner", async () => {
    const { user, issuer, registry, assetRegistry } = await deployFixture();
    const now = Math.floor(Date.now() / 1000);

    await (
      await registry.connect(issuer).attest(user.address, {
        flags: 1n,
        expiration: BigInt(now + 3600),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    await expect(
      assetRegistry
        .connect(issuer)
        .verifyAsset(
          user.address,
          11155111n,
          "0x0000000000000000000000000000000000001111",
          0n,
          1,
          "RWA20",
          ethers.ZeroHash,
          "ipfs://asset-doc",
          12n
        )
    ).to.be.revertedWith("AssetRegistry: owner not KYB-verified");

    await (
      await registry.connect(issuer).attest(user.address, {
        flags: 5n,
        expiration: BigInt(now + 3600),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    await expect(
      assetRegistry
        .connect(issuer)
        .verifyAsset(
          user.address,
          11155111n,
          "0x0000000000000000000000000000000000001111",
          0n,
          1,
          "RWA20",
          ethers.ZeroHash,
          "ipfs://asset-doc",
          12n
        )
    ).to.emit(assetRegistry, "AssetVerified");
  });

  it("tracks separate expirations for KYC and KYB", async () => {
    const { user, issuer, registry } = await deployFixture();
    const now = Math.floor(Date.now() / 1000);

    await (
      await registry.connect(issuer).attestV2(user.address, {
        flags: 1n,
        humanExpiration: BigInt(now + 3600),
        worldIdExpiration: 0n,
        kybExpiration: 0n,
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    await (
      await registry.connect(issuer).attestV2(user.address, {
        flags: 5n,
        humanExpiration: BigInt(now + 3600),
        worldIdExpiration: 0n,
        kybExpiration: BigInt(now - 5),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.id("kyb-expired")
      })
    ).wait();

    const kycOnly = await registry.verifyUser(user.address, 0n);
    expect(kycOnly[0]).to.equal(true);
    expect(kycOnly[1]).to.equal(0n);

    const kycKyb = await registry.verifyUser(user.address, 1n);
    expect(kycKyb[0]).to.equal(false);
    expect(kycKyb[1]).to.equal(3n);
  });

  it("emits KYB and asset verification request events", async () => {
    const { user, broker } = await deployFixture();

    await (await broker.connect(user).setEncryptionPubKey("0x11223344")).wait();
    await (await broker.connect(user).requestKyc("basic-kyc")).wait();

    await expect(broker.connect(user).requestKyb("acme-inc", "US")).to.emit(broker, "KybRequested");

    await expect(
      broker
        .connect(user)
        .requestAssetVerification(
          0n,
          11155111n,
          "0x0000000000000000000000000000000000001111",
          0n,
          1,
          "ACME-RWA",
          ethers.id("acme-doc"),
          "ipfs://acme-doc"
        )
    ).to.emit(broker, "AssetVerificationRequested");
  });

  it("additive attestation: attest HUMAN then KYB preserves both flags", async () => {
    const { user, issuer, registry } = await deployFixture();
    const now = Math.floor(Date.now() / 1000);

    await (
      await registry.connect(issuer).attestV2(user.address, {
        flags: 1n,
        humanExpiration: BigInt(now + 3600),
        worldIdExpiration: 0n,
        kybExpiration: 0n,
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    // Attest FLAG_KYB only — should merge with existing FLAG_HUMAN
    await (
      await registry.connect(issuer).attestV2(user.address, {
        flags: 4n,
        humanExpiration: 0n,
        worldIdExpiration: 0n,
        kybExpiration: BigInt(now + 7200),
        riskScore: 10,
        subjectType: 1,
        refHash: ethers.ZeroHash
      })
    ).wait();

    const att = await registry.attestations(user.address);
    expect(att[0]).to.equal(5n); // FLAG_HUMAN | FLAG_KYB = 1 | 4 = 5

    const exps = await registry.verificationExpirations(user.address);
    expect(exps[0]).to.equal(BigInt(now + 3600));  // humanExpiration preserved
    expect(exps[2]).to.equal(BigInt(now + 7200));  // kybExpiration set

    const result = await registry.verifyUser(user.address, 1n);
    expect(result[0]).to.equal(true);
  });

  it("rejects asset verification with another user's kybRequestId", async () => {
    const { user, broker } = await deployFixture();
    const [, , , userB] = await ethers.getSigners();

    // User A sets up KYC + KYB
    await (await broker.connect(user).setEncryptionPubKey("0x11223344")).wait();
    await (await broker.connect(user).requestKyc("basic-kyc")).wait();
    await (await broker.connect(user).requestKyb("acme-inc", "US")).wait();
    const userAKybId = await broker.latestKybRequestId(user.address);

    // User B sets up KYC + KYB
    await (await broker.connect(userB).setEncryptionPubKey("0x55667788")).wait();
    await (await broker.connect(userB).requestKyc("basic-kyc")).wait();
    await (await broker.connect(userB).requestKyb("other-inc", "UK")).wait();

    // User B tries to use User A's kybRequestId
    await expect(
      broker
        .connect(userB)
        .requestAssetVerification(
          userAKybId,
          11155111n,
          "0x0000000000000000000000000000000000001111",
          0n,
          1,
          "TOKEN",
          ethers.id("doc"),
          "ipfs://doc"
        )
    ).to.be.revertedWith("KycSessionBroker: not kyb owner");
  });

  it("sets kybRequestOwner correctly on requestKyb", async () => {
    const { user, broker } = await deployFixture();

    await (await broker.connect(user).setEncryptionPubKey("0x11223344")).wait();
    await (await broker.connect(user).requestKyc("basic-kyc")).wait();
    await (await broker.connect(user).requestKyb("acme-inc", "US")).wait();

    const kybId = await broker.latestKybRequestId(user.address);
    const owner = await broker.kybRequestOwner(kybId);
    expect(owner).to.equal(user.address);
  });
});
