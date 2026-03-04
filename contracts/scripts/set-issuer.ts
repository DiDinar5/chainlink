/**
 * Set CRE_ISSUER as allowed issuer on registry, broker, and assetRegistry.
 * Run once after deploy so the worker can store tokens:
 *   npx hardhat run scripts/set-issuer.ts --network localhost
 * Requires in contracts/.env: CRE_ISSUER, PASS_REGISTRY_ADDRESS, KYC_BROKER_ADDRESS, ASSET_REGISTRY_ADDRESS
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

function patchProviderResolveName(provider: { resolveName?(name: string): Promise<string | null> }) {
  provider.resolveName = async (name: string): Promise<string | null> => {
    if (typeof name === "string" && /^0x[0-9a-fA-F]{40}$/.test(name)) return name;
    return null;
  };
}

async function main() {
  const [signer] = await ethers.getSigners();
  if (signer.provider) patchProviderResolveName(signer.provider);

  const issuer = process.env.CRE_ISSUER;
  const registryAddress = process.env.PASS_REGISTRY_ADDRESS;
  const brokerAddress = process.env.KYC_BROKER_ADDRESS;
  const assetRegistryAddress = process.env.ASSET_REGISTRY_ADDRESS;

  if (!issuer || !registryAddress || !brokerAddress || !assetRegistryAddress) {
    throw new Error(
      "Set CRE_ISSUER, PASS_REGISTRY_ADDRESS, KYC_BROKER_ADDRESS, ASSET_REGISTRY_ADDRESS in contracts/.env"
    );
  }

  if (signer.address.toLowerCase() !== issuer.toLowerCase()) {
    throw new Error(
      `CRE_ISSUER ${issuer} is not the signer ${signer.address}. Use the deployer key for --network localhost.`
    );
  }

  const registry = await ethers.getContractAt("PassRegistry", registryAddress, signer);
  const broker = await ethers.getContractAt("KycSessionBroker", brokerAddress, signer);
  const assetRegistry = await ethers.getContractAt("AssetRegistry", assetRegistryAddress, signer);

  const tx1 = await registry.setIssuer(issuer, true);
  await tx1.wait();
  console.log("PassRegistry: issuer set");

  const tx2 = await broker.setIssuer(issuer, true);
  await tx2.wait();
  console.log("KycSessionBroker: issuer set");

  const tx3 = await assetRegistry.setIssuer(issuer, true);
  await tx3.wait();
  console.log("AssetRegistry: issuer set");

  console.log("CRE issuer enabled for:", issuer);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
