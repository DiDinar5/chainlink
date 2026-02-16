import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const creIssuer = process.env.CRE_ISSUER;

  console.log("Deployer:", deployer.address);

  const registryFactory = await ethers.getContractFactory("PassRegistry");
  const registry = await registryFactory.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PassRegistry:", registryAddress);

  const brokerFactory = await ethers.getContractFactory("KycSessionBroker");
  const broker = await brokerFactory.deploy();
  await broker.waitForDeployment();
  const brokerAddress = await broker.getAddress();
  console.log("KycSessionBroker:", brokerAddress);

  const createKycPolicyTx = await registry.createPolicy(
    1n,
    100,
    0,
    true,
    true
  );
  await createKycPolicyTx.wait();
  const kycPolicyId = 0n;
  console.log("KYC policy created:", kycPolicyId.toString());

  const createKybPolicyTx = await registry.createPolicy(
    5n, // FLAG_HUMAN | FLAG_KYB
    100,
    0,
    true,
    true
  );
  await createKybPolicyTx.wait();
  const kybPolicyId = 1n;
  console.log("KYB policy created:", kybPolicyId.toString());

  const assetRegistryFactory = await ethers.getContractFactory("AssetRegistry");
  const assetRegistry = await assetRegistryFactory.deploy(registryAddress, kybPolicyId);
  await assetRegistry.waitForDeployment();
  const assetRegistryAddress = await assetRegistry.getAddress();
  console.log("AssetRegistry:", assetRegistryAddress);

  if (creIssuer) {
    const tx1 = await registry.setIssuer(creIssuer, true);
    await tx1.wait();
    const tx2 = await broker.setIssuer(creIssuer, true);
    await tx2.wait();
    const tx3 = await assetRegistry.setIssuer(creIssuer, true);
    await tx3.wait();
    console.log("CRE issuer enabled:", creIssuer);
  } else {
    console.log("CRE_ISSUER is not set, skipping issuer allowlist setup.");
  }

  const accessPassFactory = await ethers.getContractFactory("AccessPass");
  const accessPass = await accessPassFactory.deploy(registryAddress, kycPolicyId);
  await accessPass.waitForDeployment();
  const accessPassAddress = await accessPass.getAddress();
  console.log("AccessPass:", accessPassAddress);

  const claimDropFactory = await ethers.getContractFactory("ClaimDrop");
  const claimDrop = await claimDropFactory.deploy(registryAddress, kycPolicyId, ethers.parseUnits("100", 18));
  await claimDrop.waitForDeployment();
  const claimDropAddress = await claimDrop.getAddress();
  console.log("ClaimDrop:", claimDropAddress);

  console.log("\\nCopy these addresses to frontend/.env and cre/.env:");
  console.log(`VITE_POLICY_ID=${kycPolicyId.toString()}`);
  console.log(`VITE_KYB_POLICY_ID=${kybPolicyId.toString()}`);
  console.log(`VITE_PASS_REGISTRY=${registryAddress}`);
  console.log(`VITE_KYC_BROKER=${brokerAddress}`);
  console.log(`VITE_ASSET_REGISTRY=${assetRegistryAddress}`);
  console.log(`VITE_ACCESS_PASS=${accessPassAddress}`);
  console.log(`VITE_CLAIM_DROP=${claimDropAddress}`);
  console.log(`PASS_POLICY_ID=${kycPolicyId.toString()}`);
  console.log(`KYB_POLICY_ID=${kybPolicyId.toString()}`);
  console.log(`PASS_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`KYC_BROKER_ADDRESS=${brokerAddress}`);
  console.log(`ASSET_REGISTRY_ADDRESS=${assetRegistryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
