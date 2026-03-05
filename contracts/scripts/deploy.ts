import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

function updateEnvFile(filePath: string, updates: Record<string, string>): void {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf8");
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content = content.trimEnd() + "\n" + line + "\n";
    }
  }

  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

/** Hardhat provider does not implement resolveName; ethers v6 calls it for address params. */
function patchProviderResolveName(
  provider: { resolveName?(name: string): Promise<string | null> }
) {
  provider.resolveName = async (name: string): Promise<string | null> => {
    if (typeof name === "string" && /^0x[0-9a-fA-F]{40}$/.test(name)) return name;
    return null;
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (deployer.provider) patchProviderResolveName(deployer.provider);
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

  // Auto-update .env files with deployed addresses
  const root = path.resolve(__dirname, "../..");

  updateEnvFile(path.join(root, "contracts", ".env"), {
    PASS_REGISTRY_ADDRESS: registryAddress,
    KYC_BROKER_ADDRESS: brokerAddress,
    ASSET_REGISTRY_ADDRESS: assetRegistryAddress,
  });

  updateEnvFile(path.join(root, "cre", ".env"), {
    PASS_REGISTRY_ADDRESS: registryAddress,
    KYC_BROKER_ADDRESS: brokerAddress,
    ASSET_REGISTRY_ADDRESS: assetRegistryAddress,
  });

  updateEnvFile(path.join(root, "frontend", ".env"), {
    VITE_POLICY_ID: kycPolicyId.toString(),
    VITE_KYB_POLICY_ID: kybPolicyId.toString(),
    VITE_PASS_REGISTRY: registryAddress,
    VITE_KYC_BROKER: brokerAddress,
    VITE_ASSET_REGISTRY: assetRegistryAddress,
    VITE_ACCESS_PASS: accessPassAddress,
    VITE_CLAIM_DROP: claimDropAddress,
  });

  console.log("\\nDeployed addresses written to .env files:");
  console.log(`  PASS_REGISTRY=${registryAddress}`);
  console.log(`  KYC_BROKER=${brokerAddress}`);
  console.log(`  ASSET_REGISTRY=${assetRegistryAddress}`);
  console.log(`  ACCESS_PASS=${accessPassAddress}`);
  console.log(`  CLAIM_DROP=${claimDropAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
