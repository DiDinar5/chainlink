/**
 * Run against localhost to test setEncryptionPubKey and see the real revert reason.
 * Usage: npm run node:local -w contracts  (in one terminal)
 *        npx hardhat run scripts/call-set-encryption-pubkey.ts --network localhost  (in another)
 */
import { ethers } from "hardhat";

const BROKER_ADDRESS = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
const PUBKEY_HEX =
  "0xa291eae762331ed66a27040e0946124c623eb9f75cf1bba7ce568408e9cce429";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Caller:", signer.address);
  console.log("Broker:", BROKER_ADDRESS);

  const broker = await ethers.getContractAt(
    "KycSessionBroker",
    BROKER_ADDRESS,
    signer
  );

  // Check if there is code at the address
  const code = await signer.provider!.getCode(BROKER_ADDRESS);
  console.log("Code at broker (length):", code.length);
  if (code === "0x" || code === "0x0") {
    console.error("No contract at broker address. Redeploy with: npm run deploy:local -w contracts");
    process.exit(1);
  }

  const pubKeyBytes = ethers.getBytes(PUBKEY_HEX);
  console.log("PubKey bytes length:", pubKeyBytes.length);

  try {
    const tx = await broker.setEncryptionPubKey(pubKeyBytes);
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Success, block:", receipt!.blockNumber);
  } catch (err: unknown) {
    const e = err as { data?: string; reason?: string; message?: string; error?: unknown };
    console.error("Revert reason:", e.reason ?? e.message);
    if (e.data) console.error("Revert data (hex):", e.data);
    if (e.error && typeof e.error === "object" && "data" in e.error) {
      console.error("Error.data:", (e.error as { data: string }).data);
    }
    process.exitCode = 1;
  }
}

main();
