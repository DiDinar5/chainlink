import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const { RPC_URL = "", PRIVATE_KEY = "" } = process.env;

// Hardhat default account #0 key; HH8 rejects it for sepolia — never add sepolia with this key
const HARDHAT_DEFAULT_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const isLocalOnlyKey =
  !PRIVATE_KEY ||
  PRIVATE_KEY.trim().length < 64 ||
  PRIVATE_KEY.trim().toLowerCase() === HARDHAT_DEFAULT_KEY.toLowerCase();

// Same key as first account from "hardhat node" so scripts can sign when using --network localhost
const LOCALHOST_ACCOUNTS = [HARDHAT_DEFAULT_KEY];

const networks: HardhatUserConfig["networks"] = {
  hardhat: {},
  localhost: {
    url: "http://127.0.0.1:8545",
    accounts: LOCALHOST_ACCOUNTS,
  },
};

// Add sepolia only when deploying to a real network with a non-default key
if (RPC_URL?.trim() && PRIVATE_KEY?.trim() && PRIVATE_KEY.length >= 64 && !isLocalOnlyKey) {
  networks.sepolia = {
    url: RPC_URL,
    accounts: [PRIVATE_KEY],
    chainId: 11155111,
  };
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
};

export default config;