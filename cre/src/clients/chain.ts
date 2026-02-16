import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { ASSET_REGISTRY_ABI, BROKER_ABI, REGISTRY_ABI } from "../abi.js";
import { config } from "../config.js";

const provider = new JsonRpcProvider(config.rpcUrl);
const wallet = new Wallet(config.creSignerPk, provider);

export function getProvider() {
  return provider;
}

export function getSigner() {
  return wallet;
}

export function getBroker() {
  return new Contract(config.brokerAddress, BROKER_ABI, wallet);
}

export function getRegistry() {
  return new Contract(config.registryAddress, REGISTRY_ABI, wallet);
}

export function getAssetRegistry() {
  return new Contract(config.assetRegistryAddress, ASSET_REGISTRY_ABI, wallet);
}
