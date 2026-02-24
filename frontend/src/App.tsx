import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, Interface, JsonRpcProvider, ethers } from "ethers";
import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { IDKitWidget, IErrorState, ISuccessResult, VerificationLevel } from "@worldcoin/idkit";
import { assetRegistryAbi } from "./abi/assetRegistry";
import { kycBrokerAbi } from "./abi/kycBroker";
import { passRegistryAbi } from "./abi/passRegistry";
import { env } from "./lib/env";
import { decryptSessionCiphertextHex, generateSessionKeyPairHex } from "./lib/sessionCrypto";

type VerifySnapshot = {
  ok: boolean;
  reason: number;
};

type AttestationSnapshot = {
  exists: boolean;
  revoked: boolean;
  flags: string;
  expiration: number;
  riskScore: number;
  subjectType: number;
};

type VerificationExpirationsSnapshot = {
  humanExpiration: number;
  worldIdExpiration: number;
  kybExpiration: number;
};

type PendingDecryptPacket = {
  requestId: string;
  ciphertextHex: string;
  expiresAt: number;
  owner: string;
};

type OnchainSnapshot = {
  verify: VerifySnapshot;
  worldIdVerified: boolean;
  hasActiveKybFlag: boolean;
  hasKybRequest: boolean;
  latestKybRequestId: string;
};

type WalletProviderLike = unknown;
type AssetReadProvider = BrowserProvider | JsonRpcProvider;
type AssetsViewMode = "all" | "mine";

type SumsubStatusSnapshot = {
  reviewStatus: string;
  reviewAnswer: string;
};

type SdkPacketStage = "idle" | "requested" | "token_ready" | "consumed";

type KybStubStatus = "not_started" | "in_review" | "verified";

type TokenStandard = "ERC20" | "ERC721" | "ERC1155";
type BuyerVerificationRequirement = "open" | "kyc" | "worldid" | "kyc_worldid";

type AppTab = "assets" | "personal" | "business" | "checkers" | "integrations";
type UiTheme = "light" | "dark";

type NetworkOption = {
  chainId: number;
  label: string;
};

type KybCompanyProfile = {
  legalName: string;
  companyRef: string;
  jurisdiction: string;
  registrationCountry: string;
  website: string;
  verifiedAt: number;
  mode: "stub";
};

type AssetDeploymentDraft = {
  id: string;
  chainId: string;
  tokenAddress: string;
  tokenStandard: TokenStandard;
  tokenId: string;
};

type AssetDeploymentRecord = {
  chainId: number;
  tokenAddress: string;
  tokenStandard: TokenStandard;
  tokenId: string;
  assetRequestId?: string;
  requestTxHash?: string;
  requestBlockNumber?: number;
  assetKey?: string;
  verifyTxHash?: string;
  verifyBlockNumber?: number;
  verifiedAt?: number;
};

type RegistryRecordStatus = "queued" | "submitting" | "submitted" | "verified" | "failed";

type AssetDraft = {
  name: string;
  metadataUri: string;
  metadataHash: string;
  notes: string;
  buyerVerificationRequirement: BuyerVerificationRequirement;
  deployments: AssetDeploymentDraft[];
};

type RegistryRecord = {
  id: string;
  createdAt: number;
  name: string;
  metadataUri: string;
  metadataHash: string;
  notes: string;
  deployments: AssetDeploymentRecord[];
  companyLegalName?: string;
  companyRef?: string;
  companyJurisdiction?: string;
  companyWebsite?: string;
  buyerVerificationRequirement?: BuyerVerificationRequirement;
  kybVerifiedAt?: number;
  kybRequestId?: string;
  status: RegistryRecordStatus;
  lastError?: string;
};

type ProgressCopy = {
  title: string;
  message: string;
};

type GeneratedAssetPreset = {
  name: string;
  metadataUri: string;
  notes: string;
  deployments: Array<{
    chainId: number;
    tokenAddress: string;
    tokenStandard: TokenStandard;
    tokenId: string;
  }>;
};

type VerifiedAssetDeployment = {
  assetKey: string;
  chainId: number;
  tokenAddress: string;
  tokenStandard: TokenStandard;
  tokenId: string;
  kybRequestId: string;
  verifiedAt: number;
  updatedAt: number;
  verifyTxHash?: string;
  verifyBlockNumber?: number;
};

type VerifiedAssetCard = {
  groupId: string;
  owner: string;
  name: string;
  metadataUri: string;
  metadataHash: string;
  latestVerifiedAt: number;
  latestUpdatedAt: number;
  deployments: VerifiedAssetDeployment[];
  companyLegalName?: string;
  companyRef?: string;
  companyJurisdiction?: string;
  companyWebsite?: string;
  buyerVerificationRequirement?: BuyerVerificationRequirement;
  sourceRecordId?: string;
};

type StatusLogEntry = {
  id: number;
  level: "info" | "error";
  message: string;
  timestamp: string;
};

type ResolvedAssetMetadataSnapshot = {
  status: "loading" | "ready" | "error";
  metadataHttpUrl: string;
  imageHttpUrl: string;
  imageHttpFallbackUrls?: string[];
  inlineImageDataUrl?: string;
  name: string;
  description: string;
  buyerVerificationRequirement?: BuyerVerificationRequirement;
  companyLegalName?: string;
  companyRef?: string;
  companyWebsite?: string;
  companyJurisdiction?: string;
  error?: string;
};

const SESSION_SECRET_STORAGE_PREFIX = "passstore:session-secret:";
const KYB_STUB_STORAGE_PREFIX = "passstore:kyb-stub:";
const KYB_COMPANY_PROFILE_STORAGE_PREFIX = "passstore:kyb-company-profile:";
const REGISTRY_QUEUE_STORAGE_PREFIX = "passstore:registry-queue:";
const IPFS_HTTP_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/"
] as const;
const IPFS_GATEWAY_FETCH_TIMEOUT_MS = 4500;
const NETWORK_OPTIONS: NetworkOption[] = [
  { chainId: 31337, label: "Localhost" },
  { chainId: 11155111, label: "Ethereum Sepolia" },
  { chainId: 84532, label: "Base Sepolia" },
  { chainId: 421614, label: "Arbitrum Sepolia" },
  { chainId: 80002, label: "Polygon Amoy" },
  { chainId: 97, label: "BSC Testnet" }
];

function isTokenStandard(value: unknown): value is TokenStandard {
  return value === "ERC20" || value === "ERC721" || value === "ERC1155";
}

function normalizeBuyerVerificationRequirement(value: unknown): BuyerVerificationRequirement | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "open":
    case "none":
    case "public":
      return "open";
    case "kyc":
      return "kyc";
    case "wid":
    case "worldid":
    case "world_id":
    case "world-id":
      return "worldid";
    case "kyc+wid":
    case "kyc+worldid":
    case "kyc_worldid":
    case "kyc-worldid":
    case "kyc,wid":
    case "kyc,worldid":
      return "kyc_worldid";
    default:
      return undefined;
  }
}

function buyerVerificationRequirementLabel(value: BuyerVerificationRequirement): string {
  switch (value) {
    case "kyc":
      return "KYC";
    case "worldid":
      return "World ID";
    case "kyc_worldid":
      return "KYC + World ID";
    case "open":
    default:
      return "Open";
  }
}

function buyerVerificationRequirementHelpText(value: BuyerVerificationRequirement): string {
  switch (value) {
    case "kyc":
      return "KYC required to buy";
    case "worldid":
      return "World ID required to buy";
    case "kyc_worldid":
      return "KYC + World ID required to buy";
    case "open":
    default:
      return "No verification required to buy";
  }
}

function buyerVerificationRequirementSatisfied(
  requirement: BuyerVerificationRequirement,
  hasKyc: boolean,
  hasWorldId: boolean
): boolean {
  switch (requirement) {
    case "kyc":
      return hasKyc;
    case "worldid":
      return hasWorldId;
    case "kyc_worldid":
      return hasKyc && hasWorldId;
    case "open":
    default:
      return true;
  }
}

function buyerVerificationRequirementBadgeClass(value: BuyerVerificationRequirement): "ok" | "neutral" | "warn" {
  switch (value) {
    case "open":
      return "neutral";
    case "kyc":
    case "worldid":
    case "kyc_worldid":
    default:
      return "warn";
  }
}

function buyerVerificationRequirementFromMetadata(payload: Record<string, unknown>): BuyerVerificationRequirement | undefined {
  const topLevelCandidates = [
    payload.buyerVerificationRequirement,
    payload.buyerVerification,
    payload.accessRequirement,
    payload.buyRequirement
  ];

  for (const candidate of topLevelCandidates) {
    const parsed = normalizeBuyerVerificationRequirement(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const rawProperties = payload.properties;
  if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties)) {
    return undefined;
  }

  const properties = rawProperties as Record<string, unknown>;
  const propertyCandidates = [
    properties.buyerVerificationRequirement,
    properties.buyerVerification,
    properties.accessRequirement,
    properties.buyRequirement
  ];
  for (const candidate of propertyCandidates) {
    const parsed = normalizeBuyerVerificationRequirement(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function metadataObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function metadataString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function metadataCompanyFields(payload: Record<string, unknown>): Pick<
  ResolvedAssetMetadataSnapshot,
  "companyLegalName" | "companyRef" | "companyWebsite" | "companyJurisdiction"
> {
  const properties = metadataObject(payload.properties);
  const nestedSources = [
    metadataObject(payload.issuer),
    metadataObject(payload.company),
    properties ? metadataObject(properties.issuer) : null,
    properties ? metadataObject(properties.company) : null
  ].filter(Boolean) as Record<string, unknown>[];

  const pickNested = (...keys: string[]): string | undefined => {
    for (const source of nestedSources) {
      for (const key of keys) {
        const value = metadataString(source[key]);
        if (value) {
          return value;
        }
      }
    }
    return undefined;
  };

  const companyLegalName =
    pickNested("legalName", "companyLegalName", "companyName", "name") ||
    metadataString(payload.issuerLegalName) ||
    metadataString(payload.companyLegalName) ||
    metadataString(payload.issuerName) ||
    metadataString(payload.publisherName) ||
    (properties ? metadataString(properties.issuerLegalName) : undefined) ||
    (properties ? metadataString(properties.companyLegalName) : undefined) ||
    (properties ? metadataString(properties.issuerName) : undefined);

  const companyRef =
    pickNested("companyRef", "ref", "companyId") ||
    metadataString(payload.companyRef) ||
    metadataString(payload.issuerRef) ||
    (properties ? metadataString(properties.companyRef) : undefined) ||
    (properties ? metadataString(properties.issuerRef) : undefined);

  const companyWebsite =
    pickNested("website", "url", "link") ||
    metadataString(payload.companyWebsite) ||
    metadataString(payload.issuerWebsite) ||
    (properties ? metadataString(properties.companyWebsite) : undefined) ||
    (properties ? metadataString(properties.issuerWebsite) : undefined);

  const companyJurisdiction =
    pickNested("jurisdiction", "registrationCountry", "country") ||
    metadataString(payload.companyJurisdiction) ||
    (properties ? metadataString(properties.companyJurisdiction) : undefined);

  return {
    companyLegalName,
    companyRef,
    companyWebsite,
    companyJurisdiction
  };
}

function defaultNetworkChainId(preferredChainId: number): number {
  if (preferredChainId > 0) {
    return preferredChainId;
  }
  return NETWORK_OPTIONS[0].chainId;
}

function chainName(chainId: number): string {
  const network = NETWORK_OPTIONS.find((item) => item.chainId === chainId);
  return network ? network.label : `Chain ${chainId}`;
}

function contractExplorerUrl(chainId: number, address: string): string {
  const normalized = address.trim();
  if (!ethers.isAddress(normalized)) {
    return "";
  }

  const checksummed = ethers.getAddress(normalized);
  switch (chainId) {
    case 11155111:
      return `https://sepolia.etherscan.io/address/${checksummed}`;
    case 84532:
      return `https://sepolia.basescan.org/address/${checksummed}`;
    case 421614:
      return `https://sepolia.arbiscan.io/address/${checksummed}`;
    case 80002:
      return `https://amoy.polygonscan.com/address/${checksummed}`;
    case 97:
      return `https://testnet.bscscan.com/address/${checksummed}`;
    default:
      return "";
  }
}

function tokenStandardToCode(value: TokenStandard): number {
  switch (value) {
    case "ERC20":
      return 1;
    case "ERC721":
      return 2;
    case "ERC1155":
      return 3;
    default:
      return 4;
  }
}

function tokenStandardFromCode(value: number): TokenStandard {
  switch (value) {
    case 2:
      return "ERC721";
    case 3:
      return "ERC1155";
    case 1:
    default:
      return "ERC20";
  }
}

const GENERATED_ASSET_PRESETS: GeneratedAssetPreset[] = [
  {
    name: "No Time To Explain Poster",
    metadataUri: "ipfs://bafybeibnsoufr2renqzsh347nrx54wcubt5lgkeivez63xvivplfwhtpym/metadata.json",
    notes:
      "IPFS reference preset. Preview image: ipfs://bafybeidfjqmasnpu6z7gvn7l6wthdcyzxh5uystkky3xvutddbapchbopi/no-time-to-explain.jpeg",
    deployments: [
      {
        chainId: 11155111,
        tokenAddress: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
        tokenStandard: "ERC20",
        tokenId: "0"
      },
      {
        chainId: 84532,
        tokenAddress: "0x036CbD53842c5426634e7929541eC2318f3dCf7e",
        tokenStandard: "ERC20",
        tokenId: "0"
      }
    ]
  },
  {
    name: "OpenSea Creatures Ticket Series",
    metadataUri: "ipfs://QmTNgv3jx2HHfBjQX9RnKtxj2xv2xQDtbVXoRi5rJ3a46e",
    notes: "Collection-style IPFS metadata preset for NFT/NFT1155 cross-network listing demo.",
    deployments: [
      {
        chainId: 11155111,
        tokenAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        tokenStandard: "ERC721",
        tokenId: "1"
      },
      {
        chainId: 80002,
        tokenAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        tokenStandard: "ERC1155",
        tokenId: "1"
      }
    ]
  },
  {
    name: "RWA Bond Note Pilot",
    metadataUri: "ipfs://Qmf5RHhnUjSCfCN9d1Ee6sUWxe3Eqvogw1cTsssrxAxtPn/metadata.json",
    notes: "RWA-style preset with shared metadata and multi-network ERC20 deployments.",
    deployments: [
      {
        chainId: 421614,
        tokenAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
        tokenStandard: "ERC20",
        tokenId: "0"
      },
      {
        chainId: 97,
        tokenAddress: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        tokenStandard: "ERC20",
        tokenId: "0"
      }
    ]
  }
];

function makeContracts(runner: ethers.ContractRunner) {
  return {
    registry: new Contract(env.passRegistry, passRegistryAbi, runner),
    broker: new Contract(env.kycBroker, kycBrokerAbi, runner),
    assetRegistry: new Contract(env.assetRegistry, assetRegistryAbi, runner)
  };
}

function shortAddress(address: string): string {
  if (!address) {
    return "-";
  }
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function reasonLabel(reason: number): string {
  switch (reason) {
    case 0:
      return "OK";
    case 1:
      return "NO_ATTESTATION";
    case 2:
      return "REVOKED";
    case 3:
      return "EXPIRED";
    case 4:
      return "FLAGS_MISSING";
    case 5:
      return "RISK_TOO_HIGH";
    case 6:
      return "SUBJECT_TYPE_MISMATCH";
    case 7:
      return "POLICY_DISABLED";
    default:
      return `UNKNOWN_${reason}`;
  }
}

function queueStatusBadgeClass(status: RegistryRecordStatus): "ok" | "warn" | "neutral" {
  switch (status) {
    case "verified":
      return "ok";
    case "failed":
      return "warn";
    case "queued":
    case "submitting":
    case "submitted":
    default:
      return "neutral";
  }
}

function formatUnixTimestamp(ts: number): string {
  if (!ts) {
    return "Never";
  }
  const date = new Date(ts * 1000);
  return Number.isNaN(date.getTime()) ? "Invalid" : date.toLocaleString();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSignalToField(signal: string): string {
  const normalized = signal.trim();
  const hashInput = ethers.isHexString(normalized) ? normalized : ethers.toUtf8Bytes(normalized);
  const fullHash = BigInt(ethers.keccak256(hashInput));
  const shifted = fullHash >> 8n;
  return `0x${shifted.toString(16).padStart(64, "0")}`;
}

function worldIdVerifyEndpoint(appId: string): string {
  return `https://developer.worldcoin.org/api/v2/verify/${appId}`;
}

function parseWorldIdVerifyError(rawBody: string, status: number): string {
  const fallback = `World ID pre-check failed (${status})`;
  const body = rawBody.trim();
  if (!body) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(body) as { detail?: string; code?: string };
    if (parsed.detail?.trim()) {
      return parsed.detail.trim();
    }
    if (parsed.code?.trim()) {
      return parsed.code.trim();
    }
    return fallback;
  } catch {
    return `${fallback}: ${body.slice(0, 200)}`;
  }
}

function parseWorldIdVerificationLevel(raw: string): VerificationLevel {
  const normalized = raw.trim().toLowerCase();
  switch (normalized) {
    case "orb":
      return VerificationLevel.Orb;
    case "document":
      return VerificationLevel.Document;
    case "secure_document":
      return VerificationLevel.SecureDocument;
    case "device":
    default:
      return VerificationLevel.Device;
  }
}

function parseWorldIdPrecheckMode(raw: string): "strict" | "soft" | "off" {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "soft" || normalized === "off") {
    return normalized;
  }
  return "strict";
}

function getProgressCopy(status: string, waitingPacket: boolean, refreshingStatus: boolean, syncWaiting: boolean): ProgressCopy {
  if (waitingPacket) {
    return {
      title: "Waiting CRE packet",
      message: "Encrypted SDK token is being delivered from CRE."
    };
  }

  if (refreshingStatus || syncWaiting) {
    return {
      title: "Syncing status",
      message: "Checking fresh onchain verification state."
    };
  }

  if (status.toLowerCase().includes("wallet")) {
    return {
      title: "Wallet action required",
      message: "Please confirm the transaction in your wallet."
    };
  }

  return {
    title: "Processing",
    message: "Please keep this tab open."
  };
}

function sessionSecretStorageKey(address: string): string {
  return `${SESSION_SECRET_STORAGE_PREFIX}${address.toLowerCase()}`;
}

function kybStubStorageKey(address: string): string {
  return `${KYB_STUB_STORAGE_PREFIX}${address.toLowerCase()}`;
}

function kybCompanyProfileStorageKey(address: string): string {
  return `${KYB_COMPANY_PROFILE_STORAGE_PREFIX}${address.toLowerCase()}`;
}

function registryQueueStorageKey(address: string): string {
  return `${REGISTRY_QUEUE_STORAGE_PREFIX}${address.toLowerCase()}`;
}

function readSessionSecret(address: string): string {
  if (typeof window === "undefined" || !address) {
    return "";
  }

  try {
    return window.sessionStorage.getItem(sessionSecretStorageKey(address)) ?? "";
  } catch {
    return "";
  }
}

function writeSessionSecret(address: string, secretKeyHex: string): void {
  if (typeof window === "undefined" || !address || !secretKeyHex) {
    return;
  }

  try {
    window.sessionStorage.setItem(sessionSecretStorageKey(address), secretKeyHex);
  } catch {
    // Keep flow alive if storage is unavailable.
  }
}

function readKybStubStatus(address: string): KybStubStatus {
  if (typeof window === "undefined" || !address) {
    return "not_started";
  }

  try {
    const value = window.localStorage.getItem(kybStubStorageKey(address));
    if (value === "in_review" || value === "verified") {
      return value;
    }
  } catch {
    // Ignore storage issues in dev flow.
  }

  return "not_started";
}

function writeKybStubStatus(address: string, status: KybStubStatus): void {
  if (typeof window === "undefined" || !address) {
    return;
  }

  try {
    window.localStorage.setItem(kybStubStorageKey(address), status);
  } catch {
    // Ignore storage issues in dev flow.
  }
}

function buildStubCompanyProfile(address: string, verifiedAt?: number): KybCompanyProfile {
  const normalized = address.toLowerCase();
  const suffix = normalized.slice(2, 8).toUpperCase();
  const websiteSuffix = normalized.slice(2, 10);

  return {
    legalName: `Stub Issuer ${suffix} LLC`,
    companyRef: `KYB-${suffix}`,
    jurisdiction: "US-DE",
    registrationCountry: "United States",
    website: `https://issuer-${websiteSuffix}.stub`,
    verifiedAt: verifiedAt ?? Date.now(),
    mode: "stub"
  };
}

function readKybCompanyProfile(address: string): KybCompanyProfile | null {
  if (typeof window === "undefined" || !address) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(kybCompanyProfileStorageKey(address));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<KybCompanyProfile>;
    if (
      typeof parsed.legalName !== "string" ||
      typeof parsed.companyRef !== "string" ||
      typeof parsed.jurisdiction !== "string"
    ) {
      return null;
    }

    return {
      legalName: parsed.legalName,
      companyRef: parsed.companyRef,
      jurisdiction: parsed.jurisdiction,
      registrationCountry: typeof parsed.registrationCountry === "string" ? parsed.registrationCountry : "",
      website: typeof parsed.website === "string" ? parsed.website : "",
      verifiedAt: typeof parsed.verifiedAt === "number" ? parsed.verifiedAt : Date.now(),
      mode: "stub"
    };
  } catch {
    return null;
  }
}

function writeKybCompanyProfile(address: string, profile: KybCompanyProfile | null): void {
  if (typeof window === "undefined" || !address) {
    return;
  }

  try {
    if (!profile) {
      window.localStorage.removeItem(kybCompanyProfileStorageKey(address));
      return;
    }
    window.localStorage.setItem(kybCompanyProfileStorageKey(address), JSON.stringify(profile));
  } catch {
    // Ignore storage issues in dev flow.
  }
}

function makeDraftRowId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createDeploymentDraft(preferredChainId: number): AssetDeploymentDraft {
  return {
    id: makeDraftRowId(),
    chainId: String(defaultNetworkChainId(preferredChainId)),
    tokenAddress: "",
    tokenStandard: "ERC20",
    tokenId: "0"
  };
}

function deploymentDraftFromPresetRow(
  row: GeneratedAssetPreset["deployments"][number]
): AssetDeploymentDraft {
  return {
    id: makeDraftRowId(),
    chainId: String(row.chainId),
    tokenAddress: row.tokenAddress,
    tokenStandard: row.tokenStandard,
    tokenId: row.tokenStandard === "ERC20" ? "0" : row.tokenId
  };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function compactSvg(svg: string): string {
  return svg.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
}

function assertValidSvgXml(svg: string): void {
  if (typeof DOMParser === "undefined") {
    return;
  }

  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Generated SVG XML is invalid: ${parserError.textContent?.trim() || "parsererror"}`);
  }

  const rootName = doc.documentElement?.nodeName?.toLowerCase?.() ?? "";
  if (rootName !== "svg") {
    throw new Error("Generated SVG root element is not <svg>");
  }
}

function svgSnippet(value: string, maxChars: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function slugifyAssetName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "asset";
}

function buildGeneratedAssetPreviewSvg(
  preset: GeneratedAssetPreset,
  generatedAt: Date
): string {
  const title = xmlEscape(preset.name);
  const subtitle = xmlEscape(generatedAt.toLocaleString());
  const noteLine = xmlEscape(svgSnippet(preset.notes, 92));
  const deploymentsCount = preset.deployments.length;
  const tokenKinds = Array.from(new Set(preset.deployments.map((item) => item.tokenStandard))).join(" · ");
  const seedSource = `${preset.name}|${generatedAt.toISOString()}`;
  let seed = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    seed = (seed * 31 + seedSource.charCodeAt(index)) >>> 0;
  }
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const hueA = Math.floor(rand() * 360);
  const hueB = (hueA + 54 + Math.floor(rand() * 66)) % 360;
  const hueC = (hueB + 72 + Math.floor(rand() * 58)) % 360;
  const circles = Array.from({ length: 6 }, (_, index) => {
    const cx = Math.round(80 + rand() * 1040);
    const cy = Math.round(70 + rand() * 490);
    const r = Math.round(84 + rand() * 190);
    const hue = [hueA, hueB, hueC][index % 3];
    const alpha = (0.12 + rand() * 0.16).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue} 88% 58%)" opacity="${alpha}"/>`;
  }).join("");
  const ribbons = Array.from({ length: 4 }, (_, index) => {
    const x = Math.round(-120 + rand() * 1230);
    const y = Math.round(50 + rand() * 500);
    const width = Math.round(360 + rand() * 470);
    const height = Math.round(38 + rand() * 52);
    const rotate = Math.round(-28 + rand() * 56);
    const hue = [hueC, hueA, hueB][index % 3];
    const alpha = (0.1 + rand() * 0.08).toFixed(2);
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${Math.round(height / 2)}" fill="hsl(${hue} 94% 55%)" opacity="${alpha}" transform="rotate(${rotate} ${x + width / 2} ${y + height / 2})"/>`;
  }).join("");
  const arcs = Array.from({ length: 5 }, (_, index) => {
    const x = Math.round(120 + rand() * 930);
    const y = Math.round(90 + rand() * 370);
    const rx = Math.round(60 + rand() * 150);
    const ry = Math.round(30 + rand() * 90);
    const sweep = index % 2 === 0 ? 1 : 0;
    const strokeHue = [hueB, hueC, hueA][index % 3];
    const opacity = (0.18 + rand() * 0.18).toFixed(2);
    const x2 = x + Math.round((rand() * 2 - 1) * 180);
    const y2 = y + Math.round((rand() * 2 - 1) * 120);
    return `<path d="M ${x} ${y} A ${rx} ${ry} ${Math.round(rand() * 180)} 0 ${sweep} ${x2} ${y2}" stroke="hsl(${strokeHue} 92% 92%)" stroke-width="${(2 + rand() * 3).toFixed(1)}" opacity="${opacity}" fill="none" stroke-linecap="round"/>`;
  }).join("");
  const gridLines = Array.from({ length: 6 }, (_, index) => {
    const x = 72 + index * 178;
    return `<line x1="${x}" y1="64" x2="${x}" y2="566" stroke="#FFFFFF" stroke-opacity="0.08"/>`;
  }).join("");
  const gridRows = Array.from({ length: 4 }, (_, index) => {
    const y = 92 + index * 118;
    return `<line x1="66" y1="${y}" x2="1134" y2="${y}" stroke="#FFFFFF" stroke-opacity="0.07"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="24" x2="1184" y2="610" gradientUnits="userSpaceOnUse">
      <stop stop-color="hsl(${hueA} 92% 54%)"/>
      <stop offset="0.52" stop-color="hsl(${hueB} 90% 56%)"/>
      <stop offset="1" stop-color="hsl(${hueC} 88% 52%)"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(210 150) rotate(24) scale(430 290)">
      <stop stop-color="#FFFFFF" stop-opacity="0.58"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(995 502) rotate(-18) scale(470 310)">
      <stop stop-color="#FFFFFF" stop-opacity="0.46"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" rx="24" fill="url(#bg)"/>
  <rect width="1200" height="630" rx="24" fill="url(#glowA)"/>
  <rect width="1200" height="630" rx="24" fill="url(#glowB)"/>
  ${gridLines}
  ${gridRows}
  ${circles}
  ${ribbons}
  ${arcs}
  <rect x="44" y="44" width="1112" height="542" rx="22" fill="#FFFFFF" opacity="0.08" stroke="#FFFFFF" stroke-opacity="0.22"/>
  <rect x="78" y="78" width="280" height="38" rx="19" fill="#0F172A" fill-opacity="0.18" stroke="#FFFFFF" stroke-opacity="0.24"/>
  <text x="102" y="103" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="0.06em">VERIFIED ASSET MARKET</text>
  <rect x="78" y="408" width="1044" height="154" rx="20" fill="#0B1220" fill-opacity="0.22" stroke="#FFFFFF" stroke-opacity="0.18"/>
  <text x="102" y="454" fill="#F3F8FF" font-family="Arial, sans-serif" font-size="44" font-weight="700">${title}</text>
  ${noteLine ? `<text x="102" y="488" fill="#E6EEFF" font-family="Arial, sans-serif" font-size="18">${noteLine}</text>` : ""}
  <rect x="102" y="508" width="${Math.max(122, Math.min(260, 120 + deploymentsCount * 22))}" height="28" rx="14" fill="#FFFFFF" fill-opacity="0.12" stroke="#FFFFFF" stroke-opacity="0.18"/>
  <text x="118" y="527" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="14" font-weight="700">${deploymentsCount} network${deploymentsCount === 1 ? "" : "s"}</text>
  <rect x="274" y="508" width="264" height="28" rx="14" fill="#FFFFFF" fill-opacity="0.10" stroke="#FFFFFF" stroke-opacity="0.14"/>
  <text x="290" y="527" fill="#F8FBFF" font-family="Arial, sans-serif" font-size="14" font-weight="700">${xmlEscape(tokenKinds || "Token")}</text>
  <text x="102" y="551" fill="#EAF2FF" font-family="Arial, sans-serif" font-size="15">Generated ${subtitle}</text>
</svg>`;
}

function pinataAuthHeader(jwt: string): string {
  const normalized = jwt.trim();
  return normalized.toLowerCase().startsWith("bearer ") ? normalized : `Bearer ${normalized}`;
}

function parsePinataIpfsHash(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Pinata response is not JSON");
  }

  const hash = String((payload as { IpfsHash?: unknown }).IpfsHash ?? "").trim();
  if (!hash) {
    throw new Error("Pinata response did not include IpfsHash");
  }
  return hash;
}

function parsePinataErrorMessage(raw: string, status: number): string {
  const fallback = `Pinata request failed (${status})`;
  const body = raw.trim();
  if (!body) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(body) as { error?: { reason?: string; details?: string } | string; message?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
    if (parsed.error && typeof parsed.error === "object") {
      const reason = typeof parsed.error.reason === "string" ? parsed.error.reason.trim() : "";
      const details = typeof parsed.error.details === "string" ? parsed.error.details.trim() : "";
      if (reason && details) {
        return `${reason}: ${details}`;
      }
      if (reason) {
        return reason;
      }
      if (details) {
        return details;
      }
    }
  } catch {
    // Fall through to raw body snippet.
  }

  return `${fallback}: ${body.slice(0, 200)}`;
}

async function uploadFileToPinata(blob: Blob, fileName: string, jwt: string, pinName: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("pinataMetadata", JSON.stringify({ name: pinName }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: pinataAuthHeader(jwt)
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parsePinataErrorMessage(body, response.status));
  }

  const payload = (await response.json()) as unknown;
  return parsePinataIpfsHash(payload);
}

async function uploadJsonToPinata(content: unknown, jwt: string, pinName: string): Promise<string> {
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: pinataAuthHeader(jwt),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      pinataMetadata: { name: pinName },
      pinataContent: content
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parsePinataErrorMessage(body, response.status));
  }

  const payload = (await response.json()) as unknown;
  return parsePinataIpfsHash(payload);
}

function contentUriToHttpUrls(uri: string): string[] {
  const normalized = uri.trim();
  if (!normalized) {
    return [];
  }

  if (/^https?:\/\//i.test(normalized)) {
    return [normalized];
  }

  if (normalized.toLowerCase().startsWith("ipfs://")) {
    const rawPath = normalized.slice("ipfs://".length).replace(/^ipfs\//i, "");
    if (!rawPath) {
      return [];
    }
    return IPFS_HTTP_GATEWAYS.map((base) => `${base}${rawPath}`);
  }

  return [];
}

function contentUriToHttpUrl(uri: string): string {
  const urls = contentUriToHttpUrls(uri);
  return urls[0] ?? "";
}

async function fetchJsonWithGatewayFallback(uri: string): Promise<{ url: string; payload: Record<string, unknown> }> {
  const candidates = contentUriToHttpUrls(uri);
  if (candidates.length === 0) {
    throw new Error("Unsupported metadata URI");
  }

  const failures: string[] = [];
  for (const url of candidates) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      controller && typeof window !== "undefined"
        ? window.setTimeout(() => controller.abort(), IPFS_GATEWAY_FETCH_TIMEOUT_MS)
        : null;

    try {
      const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) {
        failures.push(`${new URL(url).host}: ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        failures.push(`${new URL(url).host}: invalid JSON payload`);
        continue;
      }

      return { url, payload: payload as Record<string, unknown> };
    } catch (err) {
      const message = err instanceof DOMException && err.name === "AbortError"
        ? `timeout (${IPFS_GATEWAY_FETCH_TIMEOUT_MS}ms)`
        : (err as Error).message;
      failures.push(`${new URL(url).host}: ${message}`);
    } finally {
      if (timeoutId !== null && typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
      }
    }
  }

  throw new Error(failures.length > 0 ? `Metadata fetch failed (${failures.join(" | ")})` : "Metadata fetch failed");
}

function preferredIpfsMediaHttpUrl(uri: string): string {
  const candidates = contentUriToHttpUrls(uri);
  if (candidates.length === 0) {
    return "";
  }

  const preferred = candidates.find((item) => item.includes("ipfs.io")) ?? candidates[0];
  return preferred;
}

function ipfsMediaFallbackUrls(uri: string): string[] {
  return contentUriToHttpUrls(uri);
}

function metadataInlineImageDataUrl(payload: Record<string, unknown>): string {
  const properties = metadataObject(payload.properties);
  const candidates = [
    payload.image_data,
    payload.imageData,
    properties?.image_data,
    properties?.imageData
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("data:")) {
      return trimmed;
    }
    if (trimmed.includes("<svg")) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
    }
  }

  return "";
}

function handleVerifiedAssetImageError(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  const fallbackUrls = (img.dataset.fallbackUrls ?? "").split("\n").filter(Boolean);
  if (fallbackUrls.length === 0) {
    return;
  }

  const currentIndex = Number(img.dataset.fallbackIndex ?? "0");
  const nextIndex = Number.isFinite(currentIndex) ? currentIndex + 1 : 1;
  const nextUrl = fallbackUrls[nextIndex];
  if (!nextUrl) {
    img.onerror = null;
    return;
  }

  img.dataset.fallbackIndex = String(nextIndex);
  img.src = nextUrl;
}

function unsupportedMetadataSnapshot(): ResolvedAssetMetadataSnapshot {
  return {
    status: "error",
    metadataHttpUrl: "",
    imageHttpUrl: "",
    name: "",
    description: "",
    error: "Unsupported metadata URI"
  };
}

function imagePlaceholderSnapshot(metadataHttpUrl: string): ResolvedAssetMetadataSnapshot {
  return {
    status: "loading",
    metadataHttpUrl,
    imageHttpUrl: "",
    inlineImageDataUrl: "",
    name: "",
    description: ""
  };
}

function metadataErrorSnapshot(metadataHttpUrl: string, message: string): ResolvedAssetMetadataSnapshot {
  return {
    status: "error",
    metadataHttpUrl,
    imageHttpUrl: "",
    inlineImageDataUrl: "",
    name: "",
    description: "",
    error: message
  };
}

function metadataReadySnapshot(metadataHttpUrl: string, payload: Record<string, unknown>): ResolvedAssetMetadataSnapshot {
  const imageCandidate =
    typeof payload.image === "string"
      ? payload.image
      : typeof payload.image_url === "string"
        ? payload.image_url
        : typeof payload.imageUrl === "string"
          ? payload.imageUrl
          : "";

  const inlineImageDataUrl = metadataInlineImageDataUrl(payload);
  return {
    status: "ready",
    metadataHttpUrl,
    imageHttpUrl: preferredIpfsMediaHttpUrl(imageCandidate) || contentUriToHttpUrl(imageCandidate),
    imageHttpFallbackUrls: ipfsMediaFallbackUrls(imageCandidate),
    inlineImageDataUrl,
    name: typeof payload.name === "string" ? payload.name.trim() : "",
    description: typeof payload.description === "string" ? payload.description.trim() : "",
    buyerVerificationRequirement: buyerVerificationRequirementFromMetadata(payload),
    ...metadataCompanyFields(payload)
  };
}

function externalHttpUrl(url: string): string {
  const normalized = url.trim();
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(normalized)) {
    return `https://${normalized}`;
  }

  return "";
}

function readRegistryQueue(address: string): RegistryRecord[] {
  if (typeof window === "undefined" || !address) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(registryQueueStorageKey(address));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized: RegistryRecord[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const deploymentsRaw = Array.isArray(item.deployments) ? item.deployments : [];
      const deployments: AssetDeploymentRecord[] = [];

      for (const deployment of deploymentsRaw) {
        if (!deployment || typeof deployment !== "object") {
          continue;
        }

        const chainId = Number((deployment as Record<string, unknown>).chainId);
        const tokenAddress = String((deployment as Record<string, unknown>).tokenAddress ?? "");
        const tokenStandardValue = (deployment as Record<string, unknown>).tokenStandard;
        const tokenId = String((deployment as Record<string, unknown>).tokenId ?? "0");
        if (!Number.isInteger(chainId) || chainId <= 0 || !isTokenStandard(tokenStandardValue)) {
          continue;
        }
        deployments.push({
          chainId,
          tokenAddress,
          tokenStandard: tokenStandardValue,
          tokenId,
          assetRequestId:
            typeof (deployment as Record<string, unknown>).assetRequestId === "string"
              ? String((deployment as Record<string, unknown>).assetRequestId)
              : undefined,
          requestTxHash:
            typeof (deployment as Record<string, unknown>).requestTxHash === "string"
              ? String((deployment as Record<string, unknown>).requestTxHash)
              : undefined,
          requestBlockNumber:
            typeof (deployment as Record<string, unknown>).requestBlockNumber === "number"
              ? Number((deployment as Record<string, unknown>).requestBlockNumber)
              : undefined,
          assetKey:
            typeof (deployment as Record<string, unknown>).assetKey === "string"
              ? String((deployment as Record<string, unknown>).assetKey)
              : undefined,
          verifyTxHash:
            typeof (deployment as Record<string, unknown>).verifyTxHash === "string"
              ? String((deployment as Record<string, unknown>).verifyTxHash)
              : undefined,
          verifyBlockNumber:
            typeof (deployment as Record<string, unknown>).verifyBlockNumber === "number"
              ? Number((deployment as Record<string, unknown>).verifyBlockNumber)
              : undefined,
          verifiedAt:
            typeof (deployment as Record<string, unknown>).verifiedAt === "number"
              ? Number((deployment as Record<string, unknown>).verifiedAt)
              : undefined
        });
      }

      // Backward compatibility with the old single-network record format.
      if (deployments.length === 0) {
        const legacyChainId = Number(item.chainId);
        const legacyTokenAddress = String(item.tokenAddress ?? "");
        const legacyTokenStandard = item.tokenStandard;
        const legacyTokenId = String(item.tokenId ?? "0");
        if (
          Number.isInteger(legacyChainId) &&
          legacyChainId > 0 &&
          isTokenStandard(legacyTokenStandard) &&
          legacyTokenAddress
        ) {
          deployments.push({
            chainId: legacyChainId,
            tokenAddress: legacyTokenAddress,
            tokenStandard: legacyTokenStandard,
            tokenId: legacyTokenId
          });
        }
      }

      if (deployments.length === 0) {
        continue;
      }

      const rawStatus = String(item.status ?? "queued");
      const status: RegistryRecordStatus =
        rawStatus === "queued" ||
        rawStatus === "submitting" ||
        rawStatus === "submitted" ||
        rawStatus === "verified" ||
        rawStatus === "failed"
          ? rawStatus
          : "queued";

      normalized.push({
        id: String(item.id ?? makeDraftRowId()),
        createdAt: Number(item.createdAt ?? Date.now()),
        name: String(item.name ?? ""),
        metadataUri: String(item.metadataUri ?? ""),
        metadataHash: String(item.metadataHash ?? ""),
        notes: String(item.notes ?? ""),
        deployments,
        companyLegalName: typeof item.companyLegalName === "string" ? item.companyLegalName : undefined,
        companyRef: typeof item.companyRef === "string" ? item.companyRef : undefined,
        companyJurisdiction: typeof item.companyJurisdiction === "string" ? item.companyJurisdiction : undefined,
        companyWebsite: typeof item.companyWebsite === "string" ? item.companyWebsite : undefined,
        buyerVerificationRequirement: normalizeBuyerVerificationRequirement(item.buyerVerificationRequirement),
        kybVerifiedAt: typeof item.kybVerifiedAt === "number" ? item.kybVerifiedAt : undefined,
        kybRequestId: typeof item.kybRequestId === "string" ? item.kybRequestId : undefined,
        status,
        lastError: typeof item.lastError === "string" ? item.lastError : undefined
      });
    }

    return normalized;
  } catch {
    return [];
  }
}

function writeRegistryQueue(address: string, queue: RegistryRecord[]): void {
  if (typeof window === "undefined" || !address) {
    return;
  }

  try {
    window.localStorage.setItem(registryQueueStorageKey(address), JSON.stringify(queue));
  } catch {
    // Ignore storage issues in dev flow.
  }
}

function defaultAssetDraft(chainId: number): AssetDraft {
  return {
    name: "",
    metadataUri: "",
    metadataHash: "",
    notes: "",
    buyerVerificationRequirement: "kyc",
    deployments: [createDeploymentDraft(chainId)]
  };
}

function parseSumsubStatus(payload: unknown): SumsubStatusSnapshot {
  if (!payload || typeof payload !== "object") {
    return { reviewStatus: "", reviewAnswer: "" };
  }

  const raw = payload as Record<string, unknown>;
  const reviewStatus = String(raw.reviewStatus ?? "").trim().toLowerCase();

  let reviewAnswer = "";
  if (raw.reviewResult && typeof raw.reviewResult === "object") {
    const reviewResult = raw.reviewResult as Record<string, unknown>;
    reviewAnswer = String(reviewResult.reviewAnswer ?? "").trim().toLowerCase();
  }

  return { reviewStatus, reviewAnswer };
}

function isTerminalSumsubStatus(payload: unknown): boolean {
  const { reviewStatus, reviewAnswer } = parseSumsubStatus(payload);
  if (reviewStatus === "completed") {
    return true;
  }
  if (reviewAnswer === "green" || reviewAnswer === "red") {
    return true;
  }
  return false;
}

export default function App() {
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [refreshingStatus, setRefreshingStatus] = useState<boolean>(false);
  const [syncWaiting, setSyncWaiting] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Idle");
  const [statusHistory, setStatusHistory] = useState<StatusLogEntry[]>([]);
  const [error, setError] = useState<string>("");
  const [requestId, setRequestId] = useState<string>("-");
  const [sdkTokenPreview, setSdkTokenPreview] = useState<string>("-");
  const [sdkPacketStage, setSdkPacketStage] = useState<SdkPacketStage>("idle");
  const [sdkPacketExpiresAt, setSdkPacketExpiresAt] = useState<number>(0);
  const [verify, setVerify] = useState<VerifySnapshot>({ ok: false, reason: 1 });
  const [attestation, setAttestation] = useState<AttestationSnapshot | null>(null);
  const [verificationExpirations, setVerificationExpirations] = useState<VerificationExpirationsSnapshot>({
    humanExpiration: 0,
    worldIdExpiration: 0,
    kybExpiration: 0
  });
  const [encryptionReady, setEncryptionReady] = useState<boolean>(false);
  const [creIssuerAllowed, setCreIssuerAllowed] = useState<boolean | null>(null);
  const [pendingDecrypt, setPendingDecrypt] = useState<PendingDecryptPacket | null>(null);
  const [sessionSecretKeyHex, setSessionSecretKeyHex] = useState<string>("");
  const [waitingPacket, setWaitingPacket] = useState<boolean>(false);
  const [sumsubModalOpen, setSumsubModalOpen] = useState<boolean>(false);
  const [worldIdVerified, setWorldIdVerified] = useState<boolean>(false);
  const [worldIdErrorCode, setWorldIdErrorCode] = useState<string>("");
  const [kybStubStatus, setKybStubStatus] = useState<KybStubStatus>("not_started");
  const [kybCompanyProfile, setKybCompanyProfile] = useState<KybCompanyProfile | null>(null);
  const [hasKybRequest, setHasKybRequest] = useState<boolean>(false);
  const [latestKybRequestId, setLatestKybRequestId] = useState<string>("-");
  const [generatedPresetCursor, setGeneratedPresetCursor] = useState<number>(0);
  const [createRealIpfsData, setCreateRealIpfsData] = useState<boolean>(false);
  const [generatingAsset, setGeneratingAsset] = useState<boolean>(false);
  const [assetDraft, setAssetDraft] = useState<AssetDraft>(defaultAssetDraft(env.chainId));
  const [registryQueue, setRegistryQueue] = useState<RegistryRecord[]>([]);
  const [verifiedAssets, setVerifiedAssets] = useState<VerifiedAssetCard[]>([]);
  const [resolvedAssetMetadataByUri, setResolvedAssetMetadataByUri] = useState<Record<string, ResolvedAssetMetadataSnapshot>>({});
  const [refreshingAssets, setRefreshingAssets] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<AppTab>("assets");
  const [assetsViewMode, setAssetsViewMode] = useState<AssetsViewMode>("all");
  const [integrationUserQuery, setIntegrationUserQuery] = useState<string>("");
  const [integrationUserChecking, setIntegrationUserChecking] = useState<boolean>(false);
  const [integrationUserResponse, setIntegrationUserResponse] = useState<unknown | null>(null);
  const [integrationAssetChainId, setIntegrationAssetChainId] = useState<string>("11155111");
  const [integrationAssetTokenAddress, setIntegrationAssetTokenAddress] = useState<string>("");
  const [integrationAssetTokenStandard, setIntegrationAssetTokenStandard] = useState<TokenStandard>("ERC721");
  const [integrationAssetTokenId, setIntegrationAssetTokenId] = useState<string>("1");
  const [integrationAssetChecking, setIntegrationAssetChecking] = useState<boolean>(false);
  const [integrationAssetResponse, setIntegrationAssetResponse] = useState<unknown | null>(null);
  const [integrationAssetsRequested, setIntegrationAssetsRequested] = useState<boolean>(false);
  const [integrationAssetsLoading, setIntegrationAssetsLoading] = useState<boolean>(false);
  const [integrationAssetsResponse, setIntegrationAssetsResponse] = useState<unknown | null>(null);
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    try {
      const stored = window.localStorage.getItem("vam-ui-theme");
      return stored === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  const { open } = useAppKit();
  const { address: appKitAddress, isConnected: isAppKitConnected } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider<WalletProviderLike>("eip155");

  const sessionSecretKeyRef = useRef<string>("");
  const worldIdPollNonceRef = useRef<number>(0);
  const kybPollNonceRef = useRef<number>(0);
  const worldIdPendingAddressRef = useRef<string>("");
  const sumsubAutoSyncInFlightRef = useRef<boolean>(false);
  const sumsubAutoSyncCooldownUntilRef = useRef<number>(0);
  const statusLogRef = useRef<HTMLDivElement | null>(null);
  const statusLogCounterRef = useRef<number>(0);

  const provider = useMemo(() => {
    if (!walletProvider) {
      return null;
    }
    return new BrowserProvider(walletProvider as ethers.Eip1193Provider);
  }, [walletProvider]);

  const publicReadProvider = useMemo(() => {
    if (!env.rpcUrl) {
      return null;
    }
    return new JsonRpcProvider(env.rpcUrl);
  }, []);

  useEffect(() => {
    sessionSecretKeyRef.current = sessionSecretKeyHex;
  }, [sessionSecretKeyHex]);

  useEffect(() => {
    const timestamp = new Date().toLocaleTimeString();
    setStatusHistory((previous) => {
      const lastEntry = previous[previous.length - 1];
      if (lastEntry && lastEntry.level === "info" && lastEntry.message === status) {
        return previous;
      }
      statusLogCounterRef.current += 1;
      const entry: StatusLogEntry = {
        id: statusLogCounterRef.current,
        level: "info",
        message: status,
        timestamp
      };
      const next = [
        ...previous,
        entry
      ];
      return next.slice(-250);
    });
  }, [status]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    setStatusHistory((previous) => {
      const lastEntry = previous[previous.length - 1];
      if (lastEntry && lastEntry.level === "error" && lastEntry.message === error) {
        return previous;
      }
      statusLogCounterRef.current += 1;
      const entry: StatusLogEntry = {
        id: statusLogCounterRef.current,
        level: "error",
        message: error,
        timestamp
      };
      const next = [
        ...previous,
        entry
      ];
      return next.slice(-250);
    });
  }, [error]);

  useEffect(() => {
    const el = statusLogRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [statusHistory]);

  useEffect(() => {
    const darkThemeClass = "theme-dark";
    const lightThemeClass = "theme-light";
    const legacyDarkThemeClass = "page-theme-light";
    document.body.classList.toggle(darkThemeClass, uiTheme === "dark");
    document.body.classList.toggle(lightThemeClass, uiTheme === "light");
    document.body.classList.remove(legacyDarkThemeClass);

    return () => {
      document.body.classList.remove(darkThemeClass);
      document.body.classList.remove(lightThemeClass);
      document.body.classList.remove(legacyDarkThemeClass);
    };
  }, [uiTheme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem("vam-ui-theme", uiTheme);
    } catch {
      // Ignore storage failures in dev/local environments.
    }
  }, [uiTheme]);

  useEffect(() => {
    let cancelled = false;
    const metadataUris = Array.from(new Set(verifiedAssets.map((asset) => asset.metadataUri.trim()).filter(Boolean)));

    for (const metadataUri of metadataUris) {
      if (resolvedAssetMetadataByUri[metadataUri]) {
        continue;
      }

      const metadataHttpUrl = contentUriToHttpUrl(metadataUri);
      if (!metadataHttpUrl) {
        setResolvedAssetMetadataByUri((previous) => ({
          ...previous,
          [metadataUri]: unsupportedMetadataSnapshot()
        }));
        continue;
      }

      setResolvedAssetMetadataByUri((previous) => {
        if (previous[metadataUri]) {
          return previous;
        }
        return {
          ...previous,
          [metadataUri]: imagePlaceholderSnapshot(metadataHttpUrl)
        };
      });

      void (async () => {
        try {
          const { url: resolvedMetadataHttpUrl, payload } = await fetchJsonWithGatewayFallback(metadataUri);
          const next = metadataReadySnapshot(resolvedMetadataHttpUrl, payload);

          if (!cancelled) {
            setResolvedAssetMetadataByUri((previous) => ({ ...previous, [metadataUri]: next }));
          }
        } catch (err) {
          if (!cancelled) {
            setResolvedAssetMetadataByUri((previous) => ({
              ...previous,
              [metadataUri]: metadataErrorSnapshot(metadataHttpUrl, (err as Error).message)
            }));
          }
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [verifiedAssets]);

  useEffect(() => {
    if (!appKitAddress || !isAppKitConnected) {
      if (account) {
        worldIdPollNonceRef.current += 1;
        kybPollNonceRef.current += 1;
        worldIdPendingAddressRef.current = "";
        setAccount("");
        setChainId(0);
        setSessionSecretKeyHex("");
        sessionSecretKeyRef.current = "";
        setPendingDecrypt(null);
        setEncryptionReady(false);
        setSumsubModalOpen(false);
        setRequestId("-");
        setSdkTokenPreview("-");
        setSdkPacketStage("idle");
        setSdkPacketExpiresAt(0);
        setVerificationExpirations({ humanExpiration: 0, worldIdExpiration: 0, kybExpiration: 0 });
        setWorldIdVerified(false);
        setKybStubStatus("not_started");
        setKybCompanyProfile(null);
        setHasKybRequest(false);
        setLatestKybRequestId("-");
        setRegistryQueue([]);
        setVerifiedAssets([]);
        setStatus("Wallet disconnected");
      }
      return;
    }

    if (!account || account.toLowerCase() !== appKitAddress.toLowerCase()) {
      worldIdPollNonceRef.current += 1;
      kybPollNonceRef.current += 1;
      worldIdPendingAddressRef.current = "";
      const restoredSessionSecret = readSessionSecret(appKitAddress);
      setAccount(appKitAddress);
      setSessionSecretKeyHex(restoredSessionSecret);
      sessionSecretKeyRef.current = restoredSessionSecret;
      setPendingDecrypt(null);
      setEncryptionReady(false);
      setSumsubModalOpen(false);
      setRequestId("-");
      setSdkTokenPreview("-");
      setSdkPacketStage("idle");
      setSdkPacketExpiresAt(0);
      setVerificationExpirations({ humanExpiration: 0, worldIdExpiration: 0, kybExpiration: 0 });
      setWorldIdVerified(false);
      setHasKybRequest(false);
      setLatestKybRequestId("-");
      setStatus("Wallet connected");
      window.setTimeout(() => {
        void refreshOnchainData(appKitAddress);
      }, 0);
    }
  }, [account, appKitAddress, isAppKitConnected]);

  useEffect(() => {
    if (!account) {
      setKybStubStatus("not_started");
      setKybCompanyProfile(null);
      setRegistryQueue([]);
      setVerifiedAssets([]);
      setRequestId("-");
      setSdkTokenPreview("-");
      setSdkPacketStage("idle");
      setSdkPacketExpiresAt(0);
      setVerificationExpirations({ humanExpiration: 0, worldIdExpiration: 0, kybExpiration: 0 });
      return;
    }

    setKybStubStatus(readKybStubStatus(account));
    const storedCompanyProfile = readKybCompanyProfile(account);
    setKybCompanyProfile(storedCompanyProfile ?? buildStubCompanyProfile(account));
    setRegistryQueue(readRegistryQueue(account));
  }, [account]);

  useEffect(() => {
    if (!account) {
      return;
    }
    writeKybStubStatus(account, kybStubStatus);
  }, [account, kybStubStatus]);

  useEffect(() => {
    if (!account) {
      return;
    }
    writeKybCompanyProfile(account, kybCompanyProfile);
  }, [account, kybCompanyProfile]);

  useEffect(() => {
    if (!account) {
      return;
    }
    writeRegistryQueue(account, registryQueue);
  }, [account, registryQueue]);

  useEffect(() => {
    if (activeTab === "assets" || !account || !provider) {
      return;
    }

    void refreshVerifiedAssets(account, provider);
    const intervalId = window.setInterval(() => {
      void refreshVerifiedAssets(account, provider);
    }, 9000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [account, provider, activeTab]);

  useEffect(() => {
    if (assetsViewMode === "mine" && !account) {
      setAssetsViewMode("all");
    }
  }, [assetsViewMode, account]);

  useEffect(() => {
    if (activeTab !== "assets") {
      return;
    }

    const assetsProvider = publicReadProvider ?? provider;
    if (!assetsProvider) {
      return;
    }

    const wantsMine = assetsViewMode === "mine" && Boolean(account);
    void refreshVerifiedAssets(wantsMine ? account : undefined, assetsProvider, wantsMine ? "owner" : "public");
    const intervalId = window.setInterval(() => {
      void refreshVerifiedAssets(wantsMine ? account : undefined, assetsProvider, wantsMine ? "owner" : "public");
    }, 12000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTab, publicReadProvider, provider, assetsViewMode, account]);

  useEffect(() => {
    if (!account || !attestation) {
      return;
    }

    const flags = BigInt(attestation.flags);
    const onchainKyb = (flags & 4n) === 4n && attestation.exists && !attestation.revoked;
    if (onchainKyb && kybStubStatus !== "verified") {
      setKybStubStatus("verified");
      setStatus("KYB attestation confirmed onchain.");
    }
    if (!onchainKyb && hasKybRequest && kybStubStatus === "not_started") {
      setKybStubStatus("in_review");
    }
  }, [account, attestation, hasKybRequest, kybStubStatus]);

  useEffect(() => {
    setAssetDraft((previous) => {
      if (previous.deployments.length === 0) {
        return {
          ...previous,
          deployments: [createDeploymentDraft(chainId || env.chainId)]
        };
      }

      if (previous.deployments[0].chainId) {
        return previous;
      }

      const resolvedChainId = String(defaultNetworkChainId(chainId || env.chainId));
      return {
        ...previous,
        deployments: [{ ...previous.deployments[0], chainId: resolvedChainId }, ...previous.deployments.slice(1)]
      };
    });
  }, [chainId]);

  async function triggerAutoSyncFromSumsub(payload: unknown): Promise<void> {
    if (!isTerminalSumsubStatus(payload)) {
      return;
    }
    if (!provider || !account || verify.ok) {
      return;
    }
    if (sumsubAutoSyncInFlightRef.current) {
      return;
    }

    const now = Date.now();
    if (now < sumsubAutoSyncCooldownUntilRef.current) {
      return;
    }

    sumsubAutoSyncCooldownUntilRef.current = now + 30_000;
    sumsubAutoSyncInFlightRef.current = true;

    try {
      setStatus("Sumsub review finished. Syncing onchain status...");
      await refreshStatusWithRetry();
    } finally {
      sumsubAutoSyncInFlightRef.current = false;
    }
  }

  async function waitForWorldIdAttestation(userAddress: string): Promise<void> {
    if (!userAddress) {
      return;
    }

    const pollNonce = worldIdPollNonceRef.current + 1;
    worldIdPollNonceRef.current = pollNonce;
    const maxAttempts = 18;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (pollNonce !== worldIdPollNonceRef.current) {
        return;
      }

      const snapshot = await refreshOnchainData(userAddress);
      if (pollNonce !== worldIdPollNonceRef.current) {
        return;
      }

      if (snapshot?.worldIdVerified) {
        setStatus("World ID linked onchain.");
        worldIdPendingAddressRef.current = "";
        return;
      }

      if (attempt < maxAttempts) {
        setStatus(`Waiting for CRE World ID attestation... ${attempt}/${maxAttempts}`);
        await sleep(2500);
      }
    }

    if (pollNonce === worldIdPollNonceRef.current) {
      setStatus("World ID proof accepted. CRE attestation is still pending. Press Check status.");
    }
  }

  async function waitForKybAttestation(userAddress: string): Promise<void> {
    if (!userAddress) {
      return;
    }

    const pollNonce = kybPollNonceRef.current + 1;
    kybPollNonceRef.current = pollNonce;
    const maxAttempts = 18;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (pollNonce !== kybPollNonceRef.current) {
        return;
      }

      const snapshot = await refreshOnchainData(userAddress);
      if (pollNonce !== kybPollNonceRef.current) {
        return;
      }

      if (snapshot?.hasActiveKybFlag) {
        setStatus("KYB linked onchain.");
        return;
      }

      if (attempt < maxAttempts) {
        setStatus(`Waiting for CRE KYB attestation... ${attempt}/${maxAttempts}`);
        await sleep(2500);
      }
    }

    if (pollNonce === kybPollNonceRef.current) {
      setStatus("KYB stub is marked complete, but CRE onchain attestation is still pending. Press Check status.");
    }
  }

  async function handleWorldIdVerify(result: ISuccessResult): Promise<void> {
    if (!provider || !account) {
      throw new Error("Connect wallet first");
    }

    setBusy(true);
    setError("");
    setWorldIdErrorCode("");
    setStatus("Submitting World ID proof onchain...");

    try {
      const onExpectedNetwork = await ensureExpectedNetwork();
      if (!onExpectedNetwork) {
        throw new Error("Wrong network for World ID request");
      }

      if (worldIdPrecheckMode !== "off") {
        setStatus("Pre-checking World ID proof...");

        try {
          const precheckResponse = await fetch(worldIdVerifyEndpoint(env.worldIdAppId), {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              ...result,
              action: env.worldIdAction,
              signal_hash: hashSignalToField(account.toLowerCase())
            })
          });

          if (!precheckResponse.ok) {
            const errorBody = await precheckResponse.text();
            const precheckError = parseWorldIdVerifyError(errorBody, precheckResponse.status);

            if (worldIdPrecheckMode === "strict") {
              throw new Error(precheckError);
            }

            setStatus(`World ID pre-check failed (${precheckError}). Submitting onchain request...`);
          }
        } catch (precheckErr) {
          if (worldIdPrecheckMode === "strict") {
            throw precheckErr;
          }
          const message = (precheckErr as Error).message;
          setStatus(`World ID pre-check unavailable (${message}). Submitting onchain request...`);
        }
      }

      const { signer, address } = await getActiveSignerAndAddress();
      const { broker } = makeContracts(signer);

      const tx = await broker.requestWorldIdVerification(
        result.proof,
        result.merkle_root,
        result.nullifier_hash,
        result.verification_level
      );
      const receipt = await tx.wait();

      let requestIdLabel = "";
      const iface = new Interface(kycBrokerAbi);

      for (const log of receipt?.logs ?? []) {
        if (log.address.toLowerCase() !== env.kycBroker.toLowerCase()) {
          continue;
        }

        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "WorldIdVerificationRequested") {
            requestIdLabel = `#${(parsed.args.worldIdRequestId as bigint).toString()}`;
            break;
          }
        } catch {
          // Ignore unrelated logs.
        }
      }

      if (requestIdLabel) {
        setStatus(`World ID request ${requestIdLabel} submitted. Waiting for CRE verification...`);
      } else {
        setStatus("World ID request submitted onchain. Waiting for CRE verification...");
      }

      worldIdPendingAddressRef.current = address;
      await refreshOnchainData(address);
    } catch (err) {
      worldIdPendingAddressRef.current = "";
      const message = (err as Error).message;
      setStatus(`World ID host verification failed: ${message}`);
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function onWorldIdSuccess(): Promise<void> {
    setWorldIdErrorCode("");
    const targetAddress = worldIdPendingAddressRef.current || account;
    setStatus("World ID proof accepted by app. Waiting for CRE onchain attestation...");

    if (targetAddress) {
      void waitForWorldIdAttestation(targetAddress);
    }
  }

  async function onWorldIdError(errorState: IErrorState): Promise<void> {
    const code = String(errorState.code || "unknown_error");
    const detail = errorState.message?.trim();

    setWorldIdErrorCode(code);
    worldIdPendingAddressRef.current = "";
    setStatus(detail ? `World ID declined (${code}): ${detail}` : `World ID declined (${code}).`);
  }

  async function getActiveSignerAndAddress(): Promise<{ signer: ethers.Signer; address: string }> {
    if (!provider) {
      throw new Error("Provider unavailable");
    }

    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    if (!account || account.toLowerCase() !== address.toLowerCase()) {
      const restoredSessionSecret = readSessionSecret(address);
      setAccount(address);
      setSessionSecretKeyHex(restoredSessionSecret);
      sessionSecretKeyRef.current = restoredSessionSecret;
      setPendingDecrypt(null);
      setEncryptionReady(false);
      setSumsubModalOpen(false);
      setWorldIdVerified(false);
      setHasKybRequest(false);
      setLatestKybRequestId("-");
    }

    return { signer, address };
  }

  async function ensureExpectedNetwork(providerOverride?: BrowserProvider): Promise<boolean> {
    const activeProvider = providerOverride ?? provider;
    if (!activeProvider) {
      return false;
    }

    const network = await activeProvider.getNetwork();
    const currentChainId = Number(network.chainId);
    setChainId(currentChainId);

    if (env.chainId > 0 && currentChainId !== env.chainId) {
      setStatus(`Wrong network (${currentChainId}). Switch to chain ${env.chainId}.`);
      setError(`Wrong network: expected chainId ${env.chainId}, got ${currentChainId}`);
      return false;
    }

    return true;
  }

  async function connectWallet() {
    setBusy(true);
    setError("");

    try {
      await open({ view: isAppKitConnected ? "Account" : "Connect" });
      setStatus(
        isAppKitConnected
          ? "Account modal opened. You can switch network or disconnect there."
          : "Wallet modal opened. Choose MetaMask in AppKit."
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshOnchainData(
    forAccount?: string,
    providerOverride?: BrowserProvider
  ): Promise<OnchainSnapshot | null> {
    const activeProvider = providerOverride ?? provider;
    if (!activeProvider) {
      return null;
    }

    const user = (forAccount ?? account).toLowerCase();
    if (!user) {
      return null;
    }

    const onExpectedNetwork = await ensureExpectedNetwork(activeProvider);
    if (!onExpectedNetwork) {
      return null;
    }

    const { registry, broker } = makeContracts(activeProvider);

    const [
      verifyResult,
      attResult,
      verificationExpResult,
      pubKeyHex,
      hasKybRequestOnchain,
      latestKybRequestIdOnchain,
      hasKycRequestOnchain,
      latestKycRequestIdOnchain
    ] = await Promise.all([
      registry.verifyUser(user, env.policyId),
      registry.attestations(user),
      registry.verificationExpirations(user),
      broker.encryptionPubKey(user),
      broker.hasKybRequest(user),
      broker.latestKybRequestId(user),
      broker.hasKycRequest(user),
      broker.latestKycRequestId(user)
    ]);

    const verifySnapshot = { ok: Boolean(verifyResult[0]), reason: Number(verifyResult[1]) };
    const attFlags = BigInt(attResult[0]);
    const verificationExpSnapshot: VerificationExpirationsSnapshot = {
      humanExpiration: Number(verificationExpResult[0]),
      worldIdExpiration: Number(verificationExpResult[1]),
      kybExpiration: Number(verificationExpResult[2])
    };
    const nowTs = Math.floor(Date.now() / 1000);
    const isWorldIdLinked =
      (attFlags & env.worldIdFlag) === env.worldIdFlag &&
      Boolean(attResult[7]) &&
      !Boolean(attResult[6]) &&
      (verificationExpSnapshot.worldIdExpiration === 0 || verificationExpSnapshot.worldIdExpiration >= nowTs);
    const isKybLinked =
      (attFlags & 4n) === 4n &&
      Boolean(attResult[7]) &&
      !Boolean(attResult[6]) &&
      (verificationExpSnapshot.kybExpiration === 0 || verificationExpSnapshot.kybExpiration >= nowTs);

    setVerify(verifySnapshot);
    setAttestation({
      flags: attFlags.toString(),
      expiration: Number(attResult[1]),
      riskScore: Number(attResult[2]),
      subjectType: Number(attResult[3]),
      revoked: Boolean(attResult[6]),
      exists: Boolean(attResult[7])
    });
    setVerificationExpirations(verificationExpSnapshot);
    setWorldIdVerified(isWorldIdLinked);
    setHasKybRequest(Boolean(hasKybRequestOnchain));
    setLatestKybRequestId(Boolean(hasKybRequestOnchain) ? (latestKybRequestIdOnchain as bigint).toString() : "-");

    let normalizedRequestId = "-";
    let nextSdkPacketStage: SdkPacketStage = "idle";
    let nextSdkPacketExpiresAt = 0;

    if (Boolean(hasKycRequestOnchain)) {
      normalizedRequestId = (latestKycRequestIdOnchain as bigint).toString();
      const packet = await broker.getPacket(latestKycRequestIdOnchain);
      const ciphertextHex = packet[1] as string;
      const expiresAt = Number(packet[2]);
      const consumed = Boolean(packet[3]);
      const exists = Boolean(packet[4]);

      nextSdkPacketExpiresAt = expiresAt;
      if (consumed) {
        nextSdkPacketStage = "consumed";
      } else if (ciphertextHex !== "0x") {
        nextSdkPacketStage = "token_ready";
      } else if (exists) {
        nextSdkPacketStage = "requested";
      }
    }

    setRequestId(normalizedRequestId);
    setSdkPacketStage(nextSdkPacketStage);
    setSdkPacketExpiresAt(nextSdkPacketExpiresAt);

    const hasOnchainEncryptionKey = pubKeyHex !== "0x";
    const localSessionSecret =
      account && account.toLowerCase() === user ? sessionSecretKeyRef.current || readSessionSecret(user) : readSessionSecret(user);

    if (localSessionSecret && account && account.toLowerCase() === user && !sessionSecretKeyRef.current) {
      setSessionSecretKeyHex(localSessionSecret);
      sessionSecretKeyRef.current = localSessionSecret;
    }

    setEncryptionReady(hasOnchainEncryptionKey && Boolean(localSessionSecret));

    if (hasOnchainEncryptionKey && !localSessionSecret) {
      setStatus("Onchain encryption key exists, but local session key is missing. Click Enable encryption again.");
    }

    if (env.creIssuer) {
      const allowed = await registry.isIssuer(env.creIssuer);
      setCreIssuerAllowed(Boolean(allowed));
    }

    await refreshVerifiedAssets(user, activeProvider);

    return {
      verify: verifySnapshot,
      worldIdVerified: isWorldIdLinked,
      hasActiveKybFlag: isKybLinked,
      hasKybRequest: Boolean(hasKybRequestOnchain),
      latestKybRequestId: Boolean(hasKybRequestOnchain) ? (latestKybRequestIdOnchain as bigint).toString() : "-"
    };
  }

  async function refreshVerifiedAssets(
    forAccount?: string,
    providerOverride?: AssetReadProvider,
    scope: "owner" | "public" = "owner"
  ): Promise<void> {
    const activeProvider = providerOverride ?? provider ?? publicReadProvider;
    if (!activeProvider) {
      return;
    }

    const requestedUser = (forAccount ?? account).trim().toLowerCase();
    const isPublicScope = scope === "public";
    if (!isPublicScope && !requestedUser) {
      setVerifiedAssets([]);
      return;
    }

    const network = await activeProvider.getNetwork();
    if (env.chainId > 0 && Number(network.chainId) !== env.chainId) {
      return;
    }

    const { assetRegistry } = makeContracts(activeProvider);
    setRefreshingAssets(true);

    try {
      const latestBlock = await activeProvider.getBlockNumber();
      const verifyMetaByKey = new Map<string, { txHash?: string; blockNumber?: number }>();
      const ownerByKey = new Map<string, string>();
      let assetKeys: string[] = [];

      if (isPublicScope) {
        const logs = await assetRegistry.queryFilter(assetRegistry.filters.AssetVerified(), 0, latestBlock);
        const uniqueAssetKeys = new Set<string>();

        for (const log of logs) {
          const rawAssetKey = String((log as { args?: { assetKey?: unknown } }).args?.assetKey ?? "");
          if (!rawAssetKey) {
            continue;
          }
          const keyLower = rawAssetKey.toLowerCase();
          uniqueAssetKeys.add(rawAssetKey);

          const eventOwner = String((log as { args?: { owner?: unknown } }).args?.owner ?? "").toLowerCase();
          if (eventOwner) {
            ownerByKey.set(keyLower, eventOwner);
          }

          // queryFilter is chronological; later log overwrites earlier verification metadata for the same key.
          verifyMetaByKey.set(keyLower, {
            txHash: log.transactionHash,
            blockNumber: log.blockNumber
          });
        }

        assetKeys = Array.from(uniqueAssetKeys);
      } else {
        assetKeys = (await assetRegistry.getOwnerAssetKeys(requestedUser)) as string[];
        for (const key of assetKeys) {
          const filter = assetRegistry.filters.AssetVerified(key, requestedUser);
          const logs = await assetRegistry.queryFilter(filter, 0, latestBlock);
          const latestLog = logs.length > 0 ? logs[logs.length - 1] : undefined;
          if (latestLog) {
            verifyMetaByKey.set(key.toLowerCase(), {
              txHash: latestLog.transactionHash,
              blockNumber: latestLog.blockNumber
            });
          }
          ownerByKey.set(key.toLowerCase(), requestedUser);
        }
      }

      type VerifiedDeploymentRow = VerifiedAssetDeployment & {
        owner: string;
        name: string;
        metadataUri: string;
        metadataHash: string;
        companyLegalName?: string;
        companyRef?: string;
        companyJurisdiction?: string;
        companyWebsite?: string;
        buyerVerificationRequirement?: BuyerVerificationRequirement;
        sourceRecordId?: string;
      };

      const verifiedRows: VerifiedDeploymentRow[] = [];
      for (const key of assetKeys) {
        const record = await assetRegistry.assets(key);
        const exists = Boolean(record[12]);
        const revoked = Boolean(record[11]);
        if (!exists || revoked) {
          continue;
        }

        const chainIdValue = Number(record[1]);
        const tokenAddressValue = String(record[2]);
        const tokenIdValue = String(record[3]);
        const tokenStandardValue = tokenStandardFromCode(Number(record[4]));
        const symbolOrNameValue = String(record[5]);
        const metadataHashValue = String(record[6]);
        const metadataUriValue = String(record[7]);
        const kybRequestIdValue = (record[8] as bigint).toString();
        const verifiedAtValue = Number(record[9]);
        const updatedAtValue = Number(record[10]);
        const verifyMeta = verifyMetaByKey.get(key.toLowerCase());
        const ownerValue = String(record[0] ?? "").toLowerCase() || ownerByKey.get(key.toLowerCase()) || requestedUser;

        const linkedQueueRecord = registryQueue.find((item) =>
          item.deployments.some(
            (deployment) =>
              deployment.chainId === chainIdValue &&
              deployment.tokenStandard === tokenStandardValue &&
              deployment.tokenId === tokenIdValue &&
              deployment.tokenAddress.toLowerCase() === tokenAddressValue.toLowerCase()
          )
        );

        verifiedRows.push({
          assetKey: key,
          owner: ownerValue,
          chainId: chainIdValue,
          tokenAddress: tokenAddressValue,
          tokenStandard: tokenStandardValue,
          tokenId: tokenIdValue,
          name: linkedQueueRecord?.name || symbolOrNameValue,
          metadataUri: linkedQueueRecord?.metadataUri || metadataUriValue,
          metadataHash: linkedQueueRecord?.metadataHash || metadataHashValue,
          companyLegalName: linkedQueueRecord?.companyLegalName,
          companyRef: linkedQueueRecord?.companyRef,
          companyJurisdiction: linkedQueueRecord?.companyJurisdiction,
          companyWebsite: linkedQueueRecord?.companyWebsite,
          buyerVerificationRequirement: linkedQueueRecord?.buyerVerificationRequirement,
          kybRequestId: kybRequestIdValue,
          verifiedAt: verifiedAtValue,
          updatedAt: updatedAtValue,
          verifyTxHash: verifyMeta?.txHash,
          verifyBlockNumber: verifyMeta?.blockNumber,
          sourceRecordId: linkedQueueRecord?.id
        });
      }

      const groupedByAsset = new Map<string, VerifiedAssetCard>();
      for (const row of verifiedRows) {
        const fallbackGroup = `${row.owner}:${row.name}:${row.metadataHash || row.metadataUri}`;
        const groupId = row.sourceRecordId ?? fallbackGroup;
        const existing = groupedByAsset.get(groupId);

        if (!existing) {
          groupedByAsset.set(groupId, {
            groupId,
            owner: row.owner,
            name: row.name,
            metadataUri: row.metadataUri,
            metadataHash: row.metadataHash,
            latestVerifiedAt: row.verifiedAt,
            latestUpdatedAt: row.updatedAt,
            deployments: [
              {
                assetKey: row.assetKey,
                chainId: row.chainId,
                tokenAddress: row.tokenAddress,
                tokenStandard: row.tokenStandard,
                tokenId: row.tokenId,
                kybRequestId: row.kybRequestId,
                verifiedAt: row.verifiedAt,
                updatedAt: row.updatedAt,
                verifyTxHash: row.verifyTxHash,
                verifyBlockNumber: row.verifyBlockNumber
              }
            ],
            companyLegalName: row.companyLegalName,
            companyRef: row.companyRef,
            companyJurisdiction: row.companyJurisdiction,
            companyWebsite: row.companyWebsite,
            buyerVerificationRequirement: row.buyerVerificationRequirement,
            sourceRecordId: row.sourceRecordId
          });
          continue;
        }

        existing.latestVerifiedAt = Math.max(existing.latestVerifiedAt, row.verifiedAt);
        existing.latestUpdatedAt = Math.max(existing.latestUpdatedAt, row.updatedAt);
        existing.deployments.push({
          assetKey: row.assetKey,
          chainId: row.chainId,
          tokenAddress: row.tokenAddress,
          tokenStandard: row.tokenStandard,
          tokenId: row.tokenId,
          kybRequestId: row.kybRequestId,
          verifiedAt: row.verifiedAt,
          updatedAt: row.updatedAt,
          verifyTxHash: row.verifyTxHash,
          verifyBlockNumber: row.verifyBlockNumber
        });
        if (!existing.companyLegalName && row.companyLegalName) {
          existing.companyLegalName = row.companyLegalName;
        }
        if (!existing.companyRef && row.companyRef) {
          existing.companyRef = row.companyRef;
        }
        if (!existing.companyJurisdiction && row.companyJurisdiction) {
          existing.companyJurisdiction = row.companyJurisdiction;
        }
        if (!existing.companyWebsite && row.companyWebsite) {
          existing.companyWebsite = row.companyWebsite;
        }
        if (!existing.buyerVerificationRequirement && row.buyerVerificationRequirement) {
          existing.buyerVerificationRequirement = row.buyerVerificationRequirement;
        }
      }

      const groupedCards = Array.from(groupedByAsset.values());
      groupedCards.forEach((card) => {
        card.deployments.sort((left, right) => {
          if (left.chainId !== right.chainId) {
            return left.chainId - right.chainId;
          }
          return right.verifiedAt - left.verifiedAt;
        });
      });
      groupedCards.sort((left, right) => {
        if (right.latestVerifiedAt !== left.latestVerifiedAt) {
          return right.latestVerifiedAt - left.latestVerifiedAt;
        }
        return right.latestUpdatedAt - left.latestUpdatedAt;
      });

      setVerifiedAssets(groupedCards);

      if (!isPublicScope) {
        setRegistryQueue((previous) =>
          previous.map((item) => {
          const updatedDeployments = item.deployments.map((deployment) => {
            const matchedRow = verifiedRows.find(
              (row) =>
                row.chainId === deployment.chainId &&
                row.tokenStandard === deployment.tokenStandard &&
                row.tokenId === deployment.tokenId &&
                row.tokenAddress.toLowerCase() === deployment.tokenAddress.toLowerCase()
            );

            if (!matchedRow) {
              return deployment;
            }

            return {
              ...deployment,
              assetKey: matchedRow.assetKey,
              verifyTxHash: matchedRow.verifyTxHash ?? deployment.verifyTxHash,
              verifyBlockNumber: matchedRow.verifyBlockNumber ?? deployment.verifyBlockNumber,
              verifiedAt: matchedRow.verifiedAt
            };
          });

          const allVerified = updatedDeployments.every((deployment) => Boolean(deployment.assetKey));
          let nextStatus: RegistryRecordStatus = item.status;
          if (allVerified) {
            nextStatus = "verified";
          } else if (item.status === "submitted" || item.status === "verified") {
            nextStatus = "submitted";
          }

          return {
            ...item,
            deployments: updatedDeployments,
            status: nextStatus
          };
          })
        );
      }
    } catch (err) {
      console.error("Failed to refresh verified assets", err);
    } finally {
      setRefreshingAssets(false);
    }
  }

  async function ensureSessionEncryption(signer: ethers.Signer, address: string): Promise<string> {
    const keyPair = generateSessionKeyPairHex();
    const { broker } = makeContracts(signer);

    const tx = await broker.setEncryptionPubKey(keyPair.publicKeyHex);
    await tx.wait();

    sessionSecretKeyRef.current = keyPair.secretKeyHex;
    setSessionSecretKeyHex(keyPair.secretKeyHex);
    writeSessionSecret(address, keyPair.secretKeyHex);
    setEncryptionReady(true);
    setStatus(`Session encryption key stored onchain for ${shortAddress(address)}`);

    return keyPair.secretKeyHex;
  }

  async function enableEncryption() {
    if (!provider || !account) {
      setError("Connect wallet first");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const onExpectedNetwork = await ensureExpectedNetwork();
      if (!onExpectedNetwork) {
        return;
      }

      const { signer, address } = await getActiveSignerAndAddress();
      await ensureSessionEncryption(signer, address);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pollEncryptedPacket(
    reqId: bigint,
    ownerAddress: string
  ): Promise<{ requestId: bigint; ciphertextHex: string; expiresAt: number }> {
    const runners = [publicReadProvider, provider].filter(
      (runner, index, all): runner is BrowserProvider | JsonRpcProvider =>
        Boolean(runner) && all.findIndex((item) => item === runner) === index
    );
    if (runners.length === 0) {
      throw new Error("Provider unavailable");
    }

    const started = Date.now();
    let activeRequestId = reqId;
    let latestRequestRefreshAt = 0;

    const readPacket = async (
      requestId: bigint
    ): Promise<{ ciphertextHex: string; expiresAt: number; exists: boolean }> => {
      for (const runner of runners) {
        try {
          const { broker } = makeContracts(runner);
          const packet = await broker.getPacket(requestId);
          return {
            ciphertextHex: packet[1] as string,
            expiresAt: Number(packet[2]),
            exists: Boolean(packet[4])
          };
        } catch {
          // Try next runner (wallet provider vs public RPC).
        }
      }
      throw new Error("Failed to read KYC packet from chain");
    };

    while (Date.now() - started < 180_000) {
      const packet = await readPacket(activeRequestId);
      const ciphertextHex = packet.ciphertextHex;
      const expiresAt = packet.expiresAt;

      if (ciphertextHex !== "0x") {
        return { requestId: activeRequestId, ciphertextHex, expiresAt };
      }

      // Defensive recovery: re-check latest request id onchain in case UI parsed an old/missed request id.
      if (Date.now() - latestRequestRefreshAt >= 2500) {
        latestRequestRefreshAt = Date.now();
        for (const runner of runners) {
          try {
            const { broker } = makeContracts(runner);
            const latestOnchainReqId = (await broker.latestKycRequestId(ownerAddress)) as bigint;
            if (latestOnchainReqId !== activeRequestId) {
              const latestPacket = await readPacket(latestOnchainReqId);
              if (latestPacket.exists) {
                activeRequestId = latestOnchainReqId;
                break;
              }
            }
          } catch {
            // Ignore runner-specific read issues and keep polling.
          }
        }
      }

      setStatus(`Waiting encrypted SDK token for request ${activeRequestId.toString()}...`);
      await sleep(1000);
    }

    throw new Error("Timed out waiting for encrypted SDK token from CRE");
  }

  function launchSumsub(token: string) {
    if (!window.snsWebSdk) {
      setStatus("Sumsub SDK script missing; token fetched successfully");
      return;
    }

    setSumsubModalOpen(true);

    window.setTimeout(() => {
      if (!window.snsWebSdk) {
        return;
      }

      const sdk = window.snsWebSdk
        .init(token, async () => token)
        .withConf({
          lang: "en",
          email: "",
          phone: ""
        })
        .withOptions({
          addViewportTag: false,
          adaptIframeHeight: true
        })
        .on("idCheck.onApplicantStatusChanged", (payload: unknown) => {
          console.log("Sumsub status update", payload);
          void triggerAutoSyncFromSumsub(payload);
        })
        .build();

      sdk.launch("#sumsub-modal-container");
    }, 25);
  }

  async function autoDecryptAndLaunch(packet: PendingDecryptPacket, secretKeyHexOverride?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    if (packet.expiresAt > 0 && packet.expiresAt < now) {
      throw new Error("SDK token packet expired. Start verification again.");
    }

    let activeSecretKeyHex = secretKeyHexOverride || sessionSecretKeyRef.current;
    if (!activeSecretKeyHex && packet.owner) {
      activeSecretKeyHex = readSessionSecret(packet.owner);
    }
    if (!activeSecretKeyHex) {
      throw new Error("Missing local session secret key. Click Enable encryption and start verification again.");
    }

    if (!account || account.toLowerCase() !== packet.owner.toLowerCase()) {
      throw new Error(`Wrong wallet for auto-decrypt. Switch to ${shortAddress(packet.owner)}.`);
    }

    if (activeSecretKeyHex !== sessionSecretKeyRef.current) {
      sessionSecretKeyRef.current = activeSecretKeyHex;
      setSessionSecretKeyHex(activeSecretKeyHex);
    }

    const decryptedToken = decryptSessionCiphertextHex(packet.ciphertextHex, activeSecretKeyHex);
    const preview = `${decryptedToken.slice(0, 8)}...${decryptedToken.slice(-6)}`;
    const isMockToken = decryptedToken.startsWith("mock-sdk-");

    setSdkTokenPreview(preview);
    setPendingDecrypt(null);
    setSdkPacketStage("token_ready");
    setSdkPacketExpiresAt(packet.expiresAt);

    let packetConsumedOnchain = false;
    try {
      const { signer } = await getActiveSignerAndAddress();
      const { broker } = makeContracts(signer);
      const consumeTx = await broker.markConsumed(BigInt(packet.requestId));
      await consumeTx.wait();
      packetConsumedOnchain = true;
      setSdkPacketStage("consumed");
    } catch (consumeErr) {
      const message = (consumeErr as Error).message;
      if (message.includes("KycSessionBroker: already consumed")) {
        packetConsumedOnchain = true;
        setSdkPacketStage("consumed");
      } else {
        console.warn("Failed to mark SDK packet consumed", consumeErr);
      }
    }

    if (isMockToken) {
      setSumsubModalOpen(false);
      setStatus(
        packetConsumedOnchain
          ? "Demo mode: KYC mock accepted. SDK packet consumed onchain. Press Check status to sync onchain state."
          : "Demo mode: KYC mock accepted. SDK packet still token-ready. Press Check status to sync onchain state."
      );
    } else {
      setStatus(
        packetConsumedOnchain
          ? `SDK token consumed onchain (expiresAt=${packet.expiresAt}), launching Sumsub...`
          : `SDK token decrypted (expiresAt=${packet.expiresAt}), launching Sumsub...`
      );
      launchSumsub(decryptedToken);
      setStatus("Sumsub started. Complete verification and then press Check status.");
    }

    await refreshOnchainData(packet.owner);
  }

  async function submitKycRequest(signer: ethers.Signer, address: string, sessionSecretHex: string): Promise<void> {
    const { broker } = makeContracts(signer);
    setSyncWaiting(false);

    const tx = await broker.requestKyc(env.kycLevelName);
    const receipt = await tx.wait();

    const iface = new Interface(kycBrokerAbi);
    let newRequestId: bigint | null = null;

    for (const log of receipt?.logs ?? []) {
      if (log.address.toLowerCase() !== env.kycBroker.toLowerCase()) {
        continue;
      }

      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "KycRequested") {
          newRequestId = parsed.args.requestId as bigint;
          break;
        }
      } catch {
        // Ignore logs from other contracts.
      }
    }

    if (newRequestId === null) {
      throw new Error("Could not read requestId from tx logs");
    }

    setRequestId(newRequestId.toString());
    setSdkTokenPreview("-");
    setSdkPacketStage("requested");
    setSdkPacketExpiresAt(0);
    setPendingDecrypt(null);
    setWaitingPacket(true);
    setStatus(`KYC request submitted (#${newRequestId.toString()}). Waiting for CRE packet...`);

    void (async () => {
      try {
        const packet = await pollEncryptedPacket(newRequestId, address);
        const pendingPacket = {
          requestId: packet.requestId.toString(),
          ciphertextHex: packet.ciphertextHex,
          expiresAt: packet.expiresAt,
          owner: address
        };

        if (packet.requestId !== newRequestId) {
          setRequestId(packet.requestId.toString());
        }

        setSdkPacketStage("token_ready");
        setSdkPacketExpiresAt(packet.expiresAt);
        setPendingDecrypt(pendingPacket);
        setStatus("Encrypted SDK token received. Decrypting locally...");
        await autoDecryptAndLaunch(pendingPacket, sessionSecretHex);
      } catch (pollErr) {
        setError((pollErr as Error).message);
        setStatus("Could not auto-decrypt token. Start KYC again.");
      } finally {
        setWaitingPacket(false);
      }
    })();
  }

  async function goToKyc() {
    if (!provider || !account) {
      setError("Connect wallet first");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const onExpectedNetwork = await ensureExpectedNetwork();
      if (!onExpectedNetwork) {
        return;
      }

      const { signer, address } = await getActiveSignerAndAddress();
      let activeSessionSecret = sessionSecretKeyRef.current;

      if (!activeSessionSecret) {
        activeSessionSecret = readSessionSecret(address);
        if (activeSessionSecret) {
          sessionSecretKeyRef.current = activeSessionSecret;
          setSessionSecretKeyHex(activeSessionSecret);
        }
      }

      if (!encryptionReady || !activeSessionSecret) {
        setStatus("Preparing session key...");
        activeSessionSecret = await ensureSessionEncryption(signer, address);
      }

      if (!activeSessionSecret) {
        throw new Error("Could not prepare local session key");
      }

      setStatus("Session key ready. Submitting KYC request...");
      await submitKycRequest(signer, address, activeSessionSecret);
    } catch (err) {
      setError((err as Error).message);
      setWaitingPacket(false);
    } finally {
      setBusy(false);
    }
  }

  async function requestKycSyncFromUser(): Promise<boolean> {
    if (!provider || !account) {
      setError("Connect wallet first");
      return false;
    }

    const onExpectedNetwork = await ensureExpectedNetwork();
    if (!onExpectedNetwork) {
      return false;
    }

    const { signer } = await getActiveSignerAndAddress();
    const { broker } = makeContracts(signer);

    try {
      const tx = await broker.requestKycSync();
      setStatus("Sync request sent onchain. Waiting for confirmation...");
      await tx.wait();
      setStatus("Sync request confirmed. Waiting for CRE status update...");
      return true;
    } catch (err) {
      const message = (err as Error).message;

      if (message.includes("KycSessionBroker: no kyc request")) {
        setStatus("No KYC request found yet. Start verification first.");
        return false;
      }

      if (message.includes("KycSessionBroker: sync cooldown")) {
        setStatus("Sync was requested recently. Waiting for CRE update...");
        return false;
      }

      throw err;
    }
  }

  async function refreshStatusWithRetry() {
    if (!provider || !account) {
      setError("Connect wallet first");
      return;
    }

    setBusy(true);
    setRefreshingStatus(true);
    setSyncWaiting(true);
    setError("");

    const initialOk = verify.ok;
    const initialReason = verify.reason;
    const maxAttempts = 8;
    let latest: OnchainSnapshot | null = null;

    try {
      if (!verify.ok) {
        await requestKycSyncFromUser();
      }

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        setStatus(`Refreshing onchain status... ${attempt}/${maxAttempts}`);
        latest = await refreshOnchainData();

        if (!latest) {
          break;
        }

        if (latest.verify.ok || latest.verify.ok !== initialOk || latest.verify.reason !== initialReason) {
          break;
        }

        if (attempt < maxAttempts) {
          await sleep(2200);
        }
      }

      if (!latest) {
        return;
      }

      if (latest.verify.ok) {
        setStatus("Onchain status updated: verifyUser=true.");
        return;
      }

      if (latest.verify.ok !== initialOk || latest.verify.reason !== initialReason) {
        setStatus(`Onchain status changed: ${reasonLabel(latest.verify.reason)}.`);
        return;
      }

      setStatus("No new onchain update yet. CRE sync may still be pending.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncWaiting(false);
      setRefreshingStatus(false);
      setBusy(false);
    }
  }

  async function startKybStub() {
    if (!provider || !account) {
      setError("Connect wallet first");
      return;
    }

    if (!verify.ok) {
      setError("KYB is available only after KYC is verified");
      return;
    }

    setBusy(true);
    setError("");
    const profile = kybCompanyProfile ?? buildStubCompanyProfile(account);
    setKybCompanyProfile(profile);

    try {
      const onExpectedNetwork = await ensureExpectedNetwork();
      if (!onExpectedNetwork) {
        return;
      }

      const { signer, address } = await getActiveSignerAndAddress();
      const { broker } = makeContracts(signer);
      setKybStubStatus("in_review");
      setStatus("Submitting KYB stub request onchain...");

      const tx = await broker.requestKyb(profile.companyRef, profile.jurisdiction);
      const receipt = await tx.wait();
      const iface = new Interface(kycBrokerAbi);
      let newKybRequestId: string | null = null;

      for (const log of receipt?.logs ?? []) {
        if (log.address.toLowerCase() !== env.kycBroker.toLowerCase()) {
          continue;
        }

        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "KybRequested") {
            newKybRequestId = (parsed.args.kybRequestId as bigint).toString();
            break;
          }
        } catch {
          // Ignore unrelated logs.
        }
      }

      if (newKybRequestId) {
        setLatestKybRequestId(newKybRequestId);
      }
      setHasKybRequest(true);
      setStatus(
        newKybRequestId
          ? `KYB stub request #${newKybRequestId} submitted. Waiting CRE attestation...`
          : "KYB stub request submitted. Waiting CRE attestation..."
      );
      await refreshOnchainData(address);
      void waitForKybAttestation(address);
    } catch (err) {
      setKybStubStatus("not_started");
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function approveKybStub() {
    if (!account) {
      setError("Connect wallet first");
      return;
    }

    if (!verify.ok) {
      setError("KYB is available only after KYC is verified");
      return;
    }

    const baseProfile = kybCompanyProfile ?? buildStubCompanyProfile(account);
    const profile: KybCompanyProfile = { ...baseProfile, verifiedAt: Date.now() };

    setError("");
    setKybStubStatus("verified");
    setKybCompanyProfile(profile);
    setStatus(`KYB stub marked as verified for ${profile.legalName}. If onchain flag is still missing, click Check status.`);
    void waitForKybAttestation(account);
  }

  function resetKybStub() {
    if (!account) {
      setError("Connect wallet first");
      return;
    }

    setError("");
    setKybStubStatus("not_started");
    setKybCompanyProfile(buildStubCompanyProfile(account));
    setStatus("KYB stub reset.");
  }

  function updateDraft<K extends keyof AssetDraft>(field: K, value: AssetDraft[K]) {
    setAssetDraft((previous) => ({ ...previous, [field]: value }));
  }

  async function generateAssetDraftFromPreset() {
    if (GENERATED_ASSET_PRESETS.length === 0) {
      setError("No asset presets configured");
      return;
    }

    const presetIndex = generatedPresetCursor % GENERATED_ASSET_PRESETS.length;
    const preset = GENERATED_ASSET_PRESETS[presetIndex];

    if (!createRealIpfsData) {
      const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(`${preset.name}|${preset.metadataUri}`));

      setError("");
      setAssetDraft({
        name: preset.name,
        metadataUri: preset.metadataUri,
        metadataHash,
        notes: preset.notes,
        buyerVerificationRequirement: assetDraft.buyerVerificationRequirement,
        deployments: preset.deployments.map((deployment) => deploymentDraftFromPresetRow(deployment))
      });
      setGeneratedPresetCursor((previous) => (previous + 1) % GENERATED_ASSET_PRESETS.length);
      setStatus(`Generated asset preset: ${preset.name}`);
      return;
    }

    if (!env.pinataJwt) {
      setError("Missing VITE_PINATA_JWT in frontend/.env for real IPFS generation");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const generatedAt = new Date();
      const slug = slugifyAssetName(preset.name);
      const imageFileName = `${slug}-${generatedAt.getTime()}.svg`;
      const issuerMetadata = (() => {
        if (!kybCompanyProfile) {
          return undefined;
        }
        const name = kybCompanyProfile.legalName?.trim();
        const companyRef = kybCompanyProfile.companyRef?.trim();
        const website = kybCompanyProfile.website?.trim();
        const jurisdiction = kybCompanyProfile.jurisdiction?.trim();
        const registrationCountry = kybCompanyProfile.registrationCountry?.trim();
        if (!name && !companyRef && !website && !jurisdiction && !registrationCountry) {
          return undefined;
        }
        return {
          name: name || undefined,
          legalName: name || undefined,
          companyRef: companyRef || undefined,
          website: website || undefined,
          jurisdiction: jurisdiction || undefined,
          registrationCountry: registrationCountry || undefined
        };
      })();

      setStatus("Generating asset preview image...");
      const imageSvg = compactSvg(buildGeneratedAssetPreviewSvg(preset, generatedAt));
      assertValidSvgXml(imageSvg);
      const imageBlob = new Blob([imageSvg], { type: "image/svg+xml" });

      setStatus("Uploading generated image to Pinata...");
      const imageCid = await uploadFileToPinata(imageBlob, imageFileName, env.pinataJwt, `${preset.name} image`);
      const imageUri = `ipfs://${imageCid}`;

      const metadataPayload = {
        name: preset.name,
        description: preset.notes,
        image: imageUri,
        image_data: imageSvg,
        attributes: [],
        buyerVerificationRequirement: assetDraft.buyerVerificationRequirement,
        issuer: issuerMetadata,
        properties: {
          generatedAt: generatedAt.toISOString(),
          source: "passstore-frontend-pinata-generator",
          metadataScope: "shared_asset",
          imageDataFormat: "svg",
          buyerVerificationRequirement: assetDraft.buyerVerificationRequirement,
          buyerVerificationLabel: buyerVerificationRequirementLabel(assetDraft.buyerVerificationRequirement),
          issuer: issuerMetadata
        }
      };

      setStatus("Uploading metadata to Pinata...");
      const metadataCid = await uploadJsonToPinata(metadataPayload, env.pinataJwt, `${preset.name} metadata`);
      const metadataUri = `ipfs://${metadataCid}`;
      const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(`${preset.name}|${metadataUri}`));
      const notesWithIpfs = `${preset.notes}\nGenerated preview image: ${imageUri}`;

      setAssetDraft({
        name: preset.name,
        metadataUri,
        metadataHash,
        notes: notesWithIpfs,
        buyerVerificationRequirement: assetDraft.buyerVerificationRequirement,
        deployments: preset.deployments.map((deployment) => deploymentDraftFromPresetRow(deployment))
      });
      setGeneratedPresetCursor((previous) => (previous + 1) % GENERATED_ASSET_PRESETS.length);
      setStatus(`Generated real IPFS asset via Pinata: ${preset.name}`);
    } catch (err) {
      const message = (err as Error).message || "Unknown Pinata error";
      setStatus(`Real IPFS generation failed: ${message}`);
      setError(message);
    } finally {
      setGeneratingAsset(false);
      setBusy(false);
    }
  }

  function updateDeploymentDraft<K extends keyof AssetDeploymentDraft>(
    deploymentId: string,
    field: K,
    value: AssetDeploymentDraft[K]
  ) {
    setAssetDraft((previous) => ({
      ...previous,
      deployments: previous.deployments.map((deployment) => {
        if (deployment.id !== deploymentId) {
          return deployment;
        }

        const updated = { ...deployment, [field]: value } as AssetDeploymentDraft;
        if (field === "tokenStandard" && value === "ERC20") {
          updated.tokenId = "0";
        }
        return updated;
      })
    }));
  }

  function addDeploymentRow() {
    setAssetDraft((previous) => ({
      ...previous,
      deployments: [...previous.deployments, createDeploymentDraft(chainId || env.chainId)]
    }));
  }

  function removeDeploymentRow(deploymentId: string) {
    setAssetDraft((previous) => {
      if (previous.deployments.length <= 1) {
        setError("At least one network deployment is required");
        return previous;
      }

      return {
        ...previous,
        deployments: previous.deployments.filter((deployment) => deployment.id !== deploymentId)
      };
    });
  }

  function addAssetToQueue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!account) {
      setError("Connect wallet first");
      return;
    }

    if (!verify.ok) {
      setError("KYC must be verified before asset registration");
      return;
    }

    if (!hasActiveKybFlag) {
      setError("KYB must be verified before asset registration");
      return;
    }

    if (!kybCompanyProfile) {
      setError("No KYB company profile found. Complete KYB first.");
      return;
    }

    if (!assetDraft.name.trim()) {
      setError("Asset name is required");
      return;
    }

    if (assetDraft.deployments.length === 0) {
      setError("Add at least one network deployment");
      return;
    }

    if (!assetDraft.metadataUri.trim() && !assetDraft.metadataHash.trim()) {
      setError("Add metadata URI or metadata hash");
      return;
    }

    const normalizedDeployments: AssetDeploymentRecord[] = [];
    for (const deployment of assetDraft.deployments) {
      const chainValue = Number(deployment.chainId);
      if (!Number.isInteger(chainValue) || chainValue <= 0) {
        setError("Choose a valid network for each deployment row");
        return;
      }

      const tokenAddressRaw = deployment.tokenAddress.trim();
      if (!tokenAddressRaw) {
        setError("Every deployment row requires a contract value");
        return;
      }

      const normalizedTokenId = deployment.tokenId.trim() || "0";
      if (!/^\d+$/.test(normalizedTokenId)) {
        setError("Token ID must be an integer >= 0");
        return;
      }

      if (deployment.tokenStandard === "ERC20" && normalizedTokenId !== "0") {
        setError("For ERC20 deployment rows tokenId must be 0");
        return;
      }

      normalizedDeployments.push({
        chainId: chainValue,
        // Prototype mode: allow non-checksummed and even non-EVM identifiers for UI mocking.
        tokenAddress: ethers.isAddress(tokenAddressRaw) ? ethers.getAddress(tokenAddressRaw) : tokenAddressRaw,
        tokenStandard: deployment.tokenStandard,
        tokenId: normalizedTokenId
      });
    }

    setError("");

    const record: RegistryRecord = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: Date.now(),
      name: assetDraft.name.trim(),
      metadataUri: assetDraft.metadataUri.trim(),
      metadataHash: assetDraft.metadataHash.trim(),
      notes: assetDraft.notes.trim(),
      buyerVerificationRequirement: assetDraft.buyerVerificationRequirement,
      deployments: normalizedDeployments,
      companyLegalName: kybCompanyProfile.legalName,
      companyRef: kybCompanyProfile.companyRef,
      companyJurisdiction: kybCompanyProfile.jurisdiction,
      companyWebsite: kybCompanyProfile.website,
      kybVerifiedAt: kybCompanyProfile.verifiedAt,
      kybRequestId: hasKybRequest ? latestKybRequestId : undefined,
      status: "queued"
    };

    setRegistryQueue((previous) => [record, ...previous]);
    setAssetDraft((previous) => ({
      ...defaultAssetDraft(chainId || env.chainId),
      buyerVerificationRequirement: previous.buyerVerificationRequirement
    }));
    setStatus(`Asset "${record.name}" added to queue for ${kybCompanyProfile.legalName}. Submit it to CRE from the queue.`);
  }

  function removeQueuedAsset(id: string) {
    setRegistryQueue((previous) => previous.filter((item) => item.id !== id));
    setStatus("Asset draft removed from queue.");
  }

  async function submitQueuedAsset(recordId: string): Promise<void> {
    if (!provider || !account) {
      setError("Connect wallet first");
      return;
    }

    const record = registryQueue.find((item) => item.id === recordId);
    if (!record) {
      setError("Asset record not found");
      return;
    }

    if (record.status === "verified") {
      setStatus(`Asset "${record.name}" already verified.`);
      return;
    }

    if (!hasKybRequest || latestKybRequestId === "-") {
      setError("Start KYB first to create an onchain KYB request ID");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const onExpectedNetwork = await ensureExpectedNetwork();
      if (!onExpectedNetwork) {
        return;
      }

      setRegistryQueue((previous) =>
        previous.map((item) => (item.id === recordId ? { ...item, status: "submitting", lastError: undefined } : item))
      );

      const { signer, address } = await getActiveSignerAndAddress();
      const { broker } = makeContracts(signer);
      const iface = new Interface(kycBrokerAbi);
      const kybRequestId = BigInt(latestKybRequestId);

      const rawMetadataHash = record.metadataHash.trim();
      let metadataHash = ethers.ZeroHash;
      if (rawMetadataHash) {
        if (!ethers.isHexString(rawMetadataHash, 32)) {
          throw new Error(`Asset "${record.name}" has invalid metadata hash (expected bytes32)`);
        }
        metadataHash = rawMetadataHash;
      }

      const updatedDeployments: AssetDeploymentRecord[] = [];

      for (const deployment of record.deployments) {
        if (!ethers.isAddress(deployment.tokenAddress)) {
          throw new Error(
            `Deployment ${chainName(deployment.chainId)} has non-EVM token address. Use a valid 0x address for onchain submit.`
          );
        }

        const tokenIdBigint = BigInt(deployment.tokenId);
        const tokenStandardCode = tokenStandardToCode(deployment.tokenStandard);

        const tx = await broker.requestAssetVerification(
          kybRequestId,
          BigInt(deployment.chainId),
          ethers.getAddress(deployment.tokenAddress),
          tokenIdBigint,
          tokenStandardCode,
          record.name,
          metadataHash,
          record.metadataUri
        );
        const receipt = await tx.wait();

        let assetRequestId: string | undefined;
        for (const log of receipt?.logs ?? []) {
          if (log.address.toLowerCase() !== env.kycBroker.toLowerCase()) {
            continue;
          }

          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "AssetVerificationRequested") {
              assetRequestId = (parsed.args.assetRequestId as bigint).toString();
              break;
            }
          } catch {
            // Ignore unrelated logs.
          }
        }

        updatedDeployments.push({
          ...deployment,
          assetRequestId,
          requestTxHash: tx.hash,
          requestBlockNumber: receipt ? Number(receipt.blockNumber) : undefined
        });
      }

      setRegistryQueue((previous) =>
        previous.map((item) =>
          item.id === recordId
            ? {
                ...item,
                status: "submitted",
                kybRequestId: kybRequestId.toString(),
                deployments: updatedDeployments,
                lastError: undefined
              }
            : item
        )
      );

      setStatus(`Submitted ${updatedDeployments.length} deployment request(s) for "${record.name}". Waiting CRE verification...`);
      await refreshOnchainData(address);
    } catch (err) {
      const message = (err as Error).message;
      setRegistryQueue((previous) =>
        previous.map((item) => (item.id === recordId ? { ...item, status: "failed", lastError: message } : item))
      );
      setError(message);
      setStatus(`Asset submit failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitAllQueuedAssets(): Promise<void> {
    const pendingIds = registryQueue.filter((item) => item.status === "queued" || item.status === "failed").map((item) => item.id);
    if (pendingIds.length === 0) {
      setStatus("No queued assets to submit.");
      return;
    }

    for (const recordId of pendingIds) {
      // Sequential submit keeps wallet confirmations deterministic.
      await submitQueuedAsset(recordId);
    }
  }

  const expectedChainId = env.chainId || 0;
  const networkMismatch = chainId > 0 && expectedChainId > 0 && chainId !== expectedChainId;
  const worldIdConfigured = Boolean(env.worldIdAppId && env.worldIdAction);
  const hasSdkToken = sdkTokenPreview !== "-";
  const sdkPacketStageLabel =
    sdkPacketStage === "token_ready"
      ? "token ready"
      : sdkPacketStage === "requested"
        ? "requested"
        : sdkPacketStage === "consumed"
          ? "consumed"
          : "idle";
  const sdkPacketExpiryLabel = sdkPacketExpiresAt > 0 ? formatUnixTimestamp(sdkPacketExpiresAt) : "-";
  const worldIdVerificationLevel = parseWorldIdVerificationLevel(env.worldIdVerificationLevel);
  const worldIdPrecheckMode = parseWorldIdPrecheckMode(env.worldIdPrecheckMode);

  const walletLabel = account ? shortAddress(account) : "Wallet not connected";
  const walletButtonLabel =
    isAppKitConnected && (account || appKitAddress)
      ? shortAddress(account || appKitAddress || "")
      : "Connect wallet";
  const chainLabel = chainId || expectedChainId || "-";

  const attestationFlags = attestation ? BigInt(attestation.flags) : 0n;
  const hasKycFlag = (attestationFlags & 1n) === 1n;
  const hasWorldIdFlag = (attestationFlags & env.worldIdFlag) === env.worldIdFlag;
  const hasKybFlag = (attestationFlags & 4n) === 4n;
  const nowTs = Math.floor(Date.now() / 1000);
  const hasActiveWorldIdFlag =
    hasWorldIdFlag &&
    (verificationExpirations.worldIdExpiration === 0 || verificationExpirations.worldIdExpiration >= nowTs);
  const hasActiveKybFlag =
    hasKybFlag && (verificationExpirations.kybExpiration === 0 || verificationExpirations.kybExpiration >= nowTs);

  const kybStatusLabel =
    kybStubStatus === "verified" ? "Verified" : kybStubStatus === "in_review" ? "In review" : "Not started";
  const kybCompanyLinked = hasActiveKybFlag && Boolean(kybCompanyProfile);
  const nextGeneratedPresetName =
    GENERATED_ASSET_PRESETS.length > 0
      ? GENERATED_ASSET_PRESETS[generatedPresetCursor % GENERATED_ASSET_PRESETS.length].name
      : "Preset";

  const kycQuickLabel = verify.ok ? "Verified" : hasSdkToken ? "In progress" : "Pending";
  const kycQuickBadgeClass = verify.ok ? "ok" : hasSdkToken ? "neutral" : "warn";
  const worldIdQuickLabel = worldIdVerified ? "Verified" : "Pending";
  const worldIdQuickBadgeClass = worldIdVerified ? "ok" : "warn";
  const kybQuickLabel = hasActiveKybFlag ? "Verified" : kybStatusLabel;
  const kybQuickBadgeClass = hasActiveKybFlag ? "ok" : kybStubStatus === "in_review" ? "neutral" : "warn";
  const kycQuickExpLabel = hasKycFlag ? formatUnixTimestamp(verificationExpirations.humanExpiration) : "-";
  const worldIdQuickExpLabel = hasWorldIdFlag ? formatUnixTimestamp(verificationExpirations.worldIdExpiration) : "-";
  const kybQuickExpLabel = hasKybFlag ? formatUnixTimestamp(verificationExpirations.kybExpiration) : "-";
  const kybActionCompleted = hasActiveKybFlag || kybStubStatus === "verified";
  const kybCompanyProfileVisible = kybActionCompleted;
  const kybActionLabel = kybActionCompleted ? "Completed" : kybStubStatus === "in_review" ? "Approve KYB" : "Start KYB";
  const kybActionDisabled = busy || !account || !verify.ok || kybActionCompleted;
  const assetRegistryIntakeLocked = !verify.ok || !hasActiveKybFlag;
  const assetRegistryIntakeLockReason = !verify.ok ? "Complete KYC first to unlock asset intake." : "Complete KYB to unlock asset intake.";
  const runKybAction = () => {
    if (kybStubStatus === "in_review") {
      approveKybStub();
      return;
    }
    void startKybStub();
  };

  const globalBusy = busy || waitingPacket || refreshingStatus || syncWaiting;
  const progressCopy = getProgressCopy(status, waitingPacket, refreshingStatus, syncWaiting);
  const isDarkTheme = uiTheme === "dark";
  const assetsReadProvider = publicReadProvider ?? provider ?? null;
  const wantsMineAssets = assetsViewMode === "mine" && Boolean(account);
  const canReadPublicAssets = Boolean(assetsReadProvider);
  const canReadMineAssets = Boolean(assetsReadProvider && account);
  const canReadCurrentAssetsView = wantsMineAssets ? canReadMineAssets : canReadPublicAssets;
  const integrationRegistryNetworkLabel = `${chainName(env.chainId)} (${env.chainId})`;
  const integrationVerificationRegistryContractLabel = env.passRegistry || "-";
  const integrationAssetRegistryContractLabel = env.assetRegistry || "-";
  const integrationQuickPoints = [
    "No API key required",
    "Read-only calls (`eth_call`) — no gas",
    "Works from any frontend or backend with RPC access"
  ] as const;
  const integrationMethodGuide = [
    {
      key: "user",
      step: "1",
      title: "Check a user",
      input: "wallet address",
      methods: [
        "verifyUser(address user, uint256 policyId)",
        "attestations(address user)",
        "verificationExpirations(address user)"
      ],
      note: "Returns user verification status (KYC / World ID / KYB) with expirations."
    },
    {
      key: "asset",
      step: "2",
      title: "Check one asset",
      input: "source chain + token contract (+ tokenId for NFT / 1155)",
      methods: [
        "computeAssetKey(uint256 sourceChainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard)",
        "assets(bytes32 assetKey)"
      ],
      note: "Returns the canonical registry record for that asset (if it exists and is not revoked)."
    },
    {
      key: "list",
      step: "3",
      title: "Get all verified assets",
      input: "block range (read logs) + assetKey",
      methods: [
        "AssetVerified(...) event logs",
        "assets(bytes32 assetKey)"
      ],
      note: "Collect asset keys from events, then load each asset record from the registry."
    }
  ] as const;

  const integrationReadProvider = assetsReadProvider;
  const integrationUserQueryValue = integrationUserQuery.trim();
  const integrationUserAddressValid =
    integrationUserQueryValue.length > 0 ? ethers.isAddress(integrationUserQueryValue) : false;

  const integrationAssetChainIdValue = integrationAssetChainId.trim();
  const integrationAssetTokenAddressValue = integrationAssetTokenAddress.trim();
  const integrationAssetTokenIdValue =
    integrationAssetTokenStandard === "ERC20" ? "0" : integrationAssetTokenId.trim() || "0";
  const integrationAssetChainIdParsed = Number(integrationAssetChainIdValue);
  const integrationAssetChainIdValid =
    Number.isInteger(integrationAssetChainIdParsed) && integrationAssetChainIdParsed > 0;
  const integrationAssetAddressValid =
    integrationAssetTokenAddressValue.length > 0 && ethers.isAddress(integrationAssetTokenAddressValue);
  const integrationAssetTokenIdValid = /^\d+$/.test(integrationAssetTokenIdValue);
  const canCheckIntegrationAsset =
    integrationAssetChainIdValid && integrationAssetAddressValid && integrationAssetTokenIdValid;

  const integrationAssetsCount =
    integrationAssetsResponse &&
    typeof integrationAssetsResponse === "object" &&
    typeof (integrationAssetsResponse as { count?: unknown }).count === "number"
      ? Number((integrationAssetsResponse as { count: number }).count)
      : 0;
  const stringifyIntegrationJson = (value: unknown): string =>
    JSON.stringify(
      value,
      (_key, rawValue) => (typeof rawValue === "bigint" ? rawValue.toString() : rawValue),
      2
    );

  const refreshAssetsGallery = (): void => {
    if (!assetsReadProvider) {
      return;
    }
    const scope = wantsMineAssets ? "owner" : "public";
    const owner = wantsMineAssets ? account : undefined;
    void refreshVerifiedAssets(owner, assetsReadProvider, scope);
  };

  const normalizeOnchainAssetRegistryRecord = (assetKey: string, record: readonly unknown[]) => {
    const sourceChainId = Number(record[1]);
    const tokenAddress = String(record[2]);
    const tokenStandard = tokenStandardFromCode(Number(record[4]));
    const tokenId = String(record[3]);
    const verifiedAt = Number(record[9]);
    const updatedAt = Number(record[10]);
    const revoked = Boolean(record[11]);
    const exists = Boolean(record[12]);

    return {
      assetKey,
      owner: String(record[0]),
      sourceChainId,
      sourceChainName: chainName(sourceChainId),
      tokenAddress,
      tokenAddressExplorerUrl: contractExplorerUrl(sourceChainId, tokenAddress) || null,
      tokenId,
      tokenStandard,
      symbolOrName: String(record[5]),
      metadataHash: String(record[6]),
      metadataUri: String(record[7]),
      kybRequestId: String(record[8]),
      verifiedAt,
      verifiedAtLabel: formatUnixTimestamp(verifiedAt),
      updatedAt,
      updatedAtLabel: formatUnixTimestamp(updatedAt),
      revoked,
      exists
    };
  };

  const checkIntegrationUserOnchain = async (): Promise<void> => {
    const lookup = (integrationUserQueryValue || account || "").trim();
    if (!lookup) {
      setIntegrationUserResponse({
        ok: false,
        error: "MISSING_ADDRESS",
        message: "Enter a wallet address."
      });
      return;
    }

    if (!ethers.isAddress(lookup)) {
      setIntegrationUserResponse({
        ok: false,
        error: "INVALID_ADDRESS",
        wallet: lookup,
        message: "Enter a valid EVM wallet address."
      });
      return;
    }

    if (!integrationReadProvider) {
      setIntegrationUserResponse({
        ok: false,
        error: "NO_READ_PROVIDER",
        message: "No public read provider is configured."
      });
      return;
    }

    setIntegrationUserChecking(true);

    try {
      const user = ethers.getAddress(lookup);
      const [network, verifyResult, attResult, verificationExpResult] = await Promise.all([
        integrationReadProvider.getNetwork(),
        makeContracts(integrationReadProvider).registry.verifyUser(user, env.policyId),
        makeContracts(integrationReadProvider).registry.attestations(user),
        makeContracts(integrationReadProvider).registry.verificationExpirations(user)
      ]);

      const flags = BigInt(attResult[0]);
      const attestationExists = Boolean(attResult[7]);
      const attestationRevoked = Boolean(attResult[6]);
      const expHuman = Number(verificationExpResult[0]);
      const expWorldId = Number(verificationExpResult[1]);
      const expKyb = Number(verificationExpResult[2]);
      const now = Math.floor(Date.now() / 1000);
      const hasHuman = (flags & 1n) === 1n;
      const hasWorldId = (flags & env.worldIdFlag) === env.worldIdFlag;
      const hasKyb = (flags & 4n) === 4n;

      const statusFromFlag = (hasFlag: boolean, expiration: number): "missing" | "expired" | "verified" => {
        if (!attestationExists || attestationRevoked || !hasFlag) {
          return "missing";
        }
        if (expiration > 0 && expiration < now) {
          return "expired";
        }
        return "verified";
      };

      setIntegrationUserResponse({
        ok: true,
        source: "onchain-read",
        wallet: user,
        registry: {
          contract: env.passRegistry,
          chainId: Number(network.chainId),
          chainName: chainName(Number(network.chainId)),
          policyId: env.policyId.toString()
        },
        verifyUser: {
          ok: Boolean(verifyResult[0]),
          reason: Number(verifyResult[1]),
          reasonLabel: reasonLabel(Number(verifyResult[1]))
        },
        verifications: {
          kyc: { status: statusFromFlag(hasHuman, expHuman), expiresAt: formatUnixTimestamp(expHuman) },
          worldId: { status: statusFromFlag(hasWorldId, expWorldId), expiresAt: formatUnixTimestamp(expWorldId) },
          kyb: { status: statusFromFlag(hasKyb, expKyb), expiresAt: formatUnixTimestamp(expKyb) }
        },
        attestation: {
          exists: attestationExists,
          revoked: attestationRevoked,
          flags: flags.toString(),
          riskScore: Number(attResult[2]),
          subjectType: Number(attResult[3]),
          refHash: String(attResult[4]),
          expiration: Number(attResult[1]),
          expirationLabel: formatUnixTimestamp(Number(attResult[1])),
          updatedAt: Number(attResult[5]),
          updatedAtLabel: formatUnixTimestamp(Number(attResult[5]))
        },
        verificationExpirations: {
          humanExpiration: expHuman,
          humanExpirationLabel: formatUnixTimestamp(expHuman),
          worldIdExpiration: expWorldId,
          worldIdExpirationLabel: formatUnixTimestamp(expWorldId),
          kybExpiration: expKyb,
          kybExpirationLabel: formatUnixTimestamp(expKyb)
        }
      });
    } catch (err) {
      setIntegrationUserResponse({
        ok: false,
        source: "onchain-read",
        error: "READ_FAILED",
        wallet: lookup,
        message: (err as Error).message
      });
    } finally {
      setIntegrationUserChecking(false);
    }
  };

  const checkIntegrationAssetOnchain = async (): Promise<void> => {
    if (!integrationReadProvider) {
      setIntegrationAssetResponse({
        ok: false,
        error: "NO_READ_PROVIDER",
        message: "No public read provider is configured."
      });
      return;
    }

    if (!canCheckIntegrationAsset) {
      setIntegrationAssetResponse({
        ok: false,
        error: "INVALID_INPUT",
        query: {
          sourceChainId: integrationAssetChainIdValue || null,
          tokenAddress: integrationAssetTokenAddressValue || null,
          tokenStandard: integrationAssetTokenStandard,
          tokenId: integrationAssetTokenIdValue || null
        },
        message: "Provide a valid source chain ID, token contract address, and tokenId (for NFT/1155)."
      });
      return;
    }

    setIntegrationAssetChecking(true);

    try {
      const sourceChainId = integrationAssetChainIdParsed;
      const tokenAddress = ethers.getAddress(integrationAssetTokenAddressValue);
      const tokenId = BigInt(integrationAssetTokenIdValue);
      const tokenStandardCode = tokenStandardToCode(integrationAssetTokenStandard);
      const { assetRegistry } = makeContracts(integrationReadProvider);
      const [network, assetKey] = await Promise.all([
        integrationReadProvider.getNetwork(),
        assetRegistry.computeAssetKey(sourceChainId, tokenAddress, tokenId, tokenStandardCode)
      ]);
      const rawRecord = (await assetRegistry.assets(assetKey)) as unknown as readonly unknown[];
      const normalized = normalizeOnchainAssetRegistryRecord(String(assetKey), rawRecord);

      if (!normalized.exists || normalized.revoked) {
        setIntegrationAssetResponse({
          ok: false,
          source: "onchain-read",
          error: normalized.revoked ? "ASSET_REVOKED" : "ASSET_NOT_FOUND",
          query: {
            sourceChainId,
            sourceChainName: chainName(sourceChainId),
            tokenAddress,
            tokenStandard: integrationAssetTokenStandard,
            tokenId: tokenId.toString()
          },
          assetKey,
          registry: {
            contract: env.assetRegistry,
            chainId: Number(network.chainId),
            chainName: chainName(Number(network.chainId))
          }
        });
      } else {
        setIntegrationAssetResponse({
          ok: true,
          source: "onchain-read",
          registry: {
            contract: env.assetRegistry,
            chainId: Number(network.chainId),
            chainName: chainName(Number(network.chainId))
          },
          query: {
            sourceChainId,
            sourceChainName: chainName(sourceChainId),
            tokenAddress,
            tokenStandard: integrationAssetTokenStandard,
            tokenId: tokenId.toString()
          },
          asset: normalized
        });
      }
    } catch (err) {
      setIntegrationAssetResponse({
        ok: false,
        source: "onchain-read",
        error: "READ_FAILED",
        query: {
          sourceChainId: integrationAssetChainIdValue || null,
          tokenAddress: integrationAssetTokenAddressValue || null,
          tokenStandard: integrationAssetTokenStandard,
          tokenId: integrationAssetTokenIdValue || null
        },
        message: (err as Error).message
      });
    } finally {
      setIntegrationAssetChecking(false);
    }
  };

  const readIntegrationPublicAssetsOnchain = async (activeProvider: AssetReadProvider): Promise<unknown> => {
    const { assetRegistry } = makeContracts(activeProvider);
    const [network, latestBlock] = await Promise.all([activeProvider.getNetwork(), activeProvider.getBlockNumber()]);
    const logs = await assetRegistry.queryFilter(assetRegistry.filters.AssetVerified(), 0, latestBlock);
    const uniqueAssetKeys = new Set<string>();
    const latestVerifyMetaByKey = new Map<string, { txHash?: string; blockNumber?: number }>();

    for (const log of logs) {
      const rawAssetKey = String((log as { args?: { assetKey?: unknown } }).args?.assetKey ?? "");
      if (!rawAssetKey) {
        continue;
      }
      uniqueAssetKeys.add(rawAssetKey);
      latestVerifyMetaByKey.set(rawAssetKey.toLowerCase(), {
        txHash: log.transactionHash,
        blockNumber: log.blockNumber
      });
    }

    const assets: Array<Record<string, unknown>> = [];
    for (const assetKey of uniqueAssetKeys) {
      const rawRecord = (await assetRegistry.assets(assetKey)) as unknown as readonly unknown[];
      const normalized = normalizeOnchainAssetRegistryRecord(assetKey, rawRecord);
      if (!normalized.exists || normalized.revoked) {
        continue;
      }
      const latestMeta = latestVerifyMetaByKey.get(assetKey.toLowerCase());
      assets.push({
        ...normalized,
        verifyTxHash: latestMeta?.txHash ?? null,
        verifyBlockNumber: latestMeta?.blockNumber ?? null
      });
    }

    assets.sort((left, right) => {
      const leftVerifiedAt = Number((left as { verifiedAt?: unknown }).verifiedAt ?? 0);
      const rightVerifiedAt = Number((right as { verifiedAt?: unknown }).verifiedAt ?? 0);
      return rightVerifiedAt - leftVerifiedAt;
    });

    return {
      ok: true,
      source: "onchain-read",
      registry: {
        contract: env.assetRegistry,
        chainId: Number(network.chainId),
        chainName: chainName(Number(network.chainId)),
        latestBlock
      },
      count: assets.length,
      assets
    };
  };

  const refreshIntegrationAssetsDirectory = (): void => {
    if (!integrationReadProvider) {
      setIntegrationAssetsRequested(true);
      setIntegrationAssetsResponse({
        ok: false,
        error: "NO_READ_PROVIDER",
        message: "No public read provider is configured."
      });
      return;
    }

    setIntegrationAssetsRequested(true);
    setIntegrationAssetsLoading(true);

    void (async () => {
      try {
        const response = await readIntegrationPublicAssetsOnchain(integrationReadProvider);
        setIntegrationAssetsResponse(response);
      } catch (err) {
        setIntegrationAssetsResponse({
          ok: false,
          source: "onchain-read",
          error: "READ_FAILED",
          message: (err as Error).message
        });
      } finally {
        setIntegrationAssetsLoading(false);
      }
    })();
  };

  return (
    <div className="flow-page">
      <header className="hero-card">
        <div className="hero-copy">
          <h1>Verified Assets Market</h1>
          <p className="hero-text">
            Chainlink CRE Hackathon 2026 demo for cross-chain assets that require KYC, World ID, or KYB verification.
          </p>
        </div>
        <div className="hero-actions">
          <button
            className={`theme-toggle-btn${isDarkTheme ? " is-dark" : ""}`}
            type="button"
            onClick={() => setUiTheme((previous) => (previous === "dark" ? "light" : "dark"))}
            aria-pressed={isDarkTheme}
            title={`Switch to ${isDarkTheme ? "light" : "dark"} theme`}
          >
            <span className="theme-toggle-track" aria-hidden="true">
              <span className="theme-toggle-thumb" />
            </span>
            <span className="theme-toggle-text">{isDarkTheme ? "Dark" : "Light"}</span>
          </button>
          <button className="btn" onClick={() => void refreshStatusWithRetry()} disabled={busy || !account || networkMismatch}>
            Check status
          </button>
          <button className="btn primary" onClick={connectWallet} disabled={busy}>
            {walletButtonLabel}
          </button>
          <div className="hero-verify-pills" aria-label="Verification summary">
            <span className={`pill hero-verify-pill ${kycQuickBadgeClass}`}>
              <span className="hero-verify-pill-label">KYC: {kycQuickLabel}</span>
              <span className="hero-verify-pill-exp">Exp: {kycQuickExpLabel}</span>
            </span>
            <span className={`pill hero-verify-pill ${worldIdQuickBadgeClass}`}>
              <span className="hero-verify-pill-label">World ID: {worldIdQuickLabel}</span>
              <span className="hero-verify-pill-exp">Exp: {worldIdQuickExpLabel}</span>
            </span>
            <span className={`pill hero-verify-pill ${kybQuickBadgeClass}`}>
              <span className="hero-verify-pill-label">KYB: {kybQuickLabel}</span>
              <span className="hero-verify-pill-exp">Exp: {kybQuickExpLabel}</span>
            </span>
          </div>
        </div>
      </header>

      <section className="card section-tabs-card" aria-label="Console sections">
        <div className="section-tabs">
          <button
            className={`section-tab ${activeTab === "assets" ? "active" : ""}`}
            onClick={() => setActiveTab("assets")}
            aria-pressed={activeTab === "assets"}
            type="button"
          >
            <span>Assets</span>
          </button>
          <button
            className={`section-tab ${activeTab === "personal" ? "active" : ""}`}
            onClick={() => setActiveTab("personal")}
            aria-pressed={activeTab === "personal"}
            type="button"
          >
            <span>Personal</span>
          </button>
          <button
            className={`section-tab ${activeTab === "business" ? "active" : ""}`}
            onClick={() => setActiveTab("business")}
            aria-pressed={activeTab === "business"}
            type="button"
          >
            <span>Business</span>
          </button>
          <button
            className={`section-tab ${activeTab === "checkers" ? "active" : ""}`}
            onClick={() => setActiveTab("checkers")}
            aria-pressed={activeTab === "checkers"}
            type="button"
          >
            <span>Checkers</span>
          </button>
          <button
            className={`section-tab ${activeTab === "integrations" ? "active" : ""}`}
            onClick={() => setActiveTab("integrations")}
            aria-pressed={activeTab === "integrations"}
            type="button"
          >
            <span>Integrations</span>
          </button>
        </div>
      </section>

      {activeTab === "integrations" || activeTab === "checkers" ? (
      <section
        className="tab-section-group integrations-wrap"
        aria-label={activeTab === "integrations" ? "Integrations" : "Checkers"}
      >
        <div className="queue-head">
          <h3>{activeTab === "integrations" ? "Integrations" : "Checkers"}</h3>
          <div className="queue-actions">
            <span className="badge neutral">No API key</span>
            {activeTab === "integrations" ? <span className="badge ok">Onchain</span> : null}
          </div>
        </div>
        {activeTab === "checkers" ? (
          <p className="card-text integrations-intro">
            Interactive on-chain checkers for user verifications, asset lookup, and verified asset directory listing.
          </p>
        ) : null}

        <div className={`integrations-grid${activeTab === "checkers" ? " checkers-grid" : ""}`}>
          {activeTab === "integrations" ? (
          <article className="card integrations-card integrations-card-wide integrations-card-plain">
            <p className="card-text integration-plain-intro">
              Simple on-chain reads for marketplaces that want to display and validate verified assets. Use these public
              reads to check a user, resolve an asset, and list verified assets.
            </p>
            <ul className="integration-quick-points" aria-label="Integration basics">
              {integrationQuickPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="integration-section-label">Read targets</div>
            <div className="integration-method-target" aria-label="Registry read target">
              <div className="integration-method-target-grid">
                <div className="integration-method-target-item">
                  <span>Network</span>
                  <code>{integrationRegistryNetworkLabel}</code>
                </div>
                <div className="integration-method-target-item">
                  <span>Verification Registry (PassRegistry)</span>
                  <code>{integrationVerificationRegistryContractLabel}</code>
                </div>
                <div className="integration-method-target-item">
                  <span>Asset Registry</span>
                  <code>{integrationAssetRegistryContractLabel}</code>
                </div>
              </div>
              <p className="hint integration-method-target-note">
                All calls below are read-only (`eth_call`) and free to execute. Your RPC provider may still apply rate
                limits.
              </p>
            </div>
            <div className="integration-section-label">Common read flows</div>
            <div className="integration-method-groups" aria-label="Integration method groups">
              {integrationMethodGuide.map((group) => (
                <section className="integration-method-group" key={group.key}>
                  <div className="integration-method-group-head">
                    <span className="integration-method-step">{group.step}</span>
                    <div>
                      <strong>{group.title}</strong>
                      <div className="integration-method-input">
                        Input: <code>{group.input}</code>
                      </div>
                    </div>
                  </div>
                  <ul className="integration-method-list integration-method-list-compact">
                    {group.methods.map((signature) => (
                      <li key={`${group.key}:${signature}`}>
                        <code>{signature}</code>
                      </li>
                    ))}
                  </ul>
                  <p className="hint integration-method-note">{group.note}</p>
                </section>
              ))}
            </div>
          </article>
          ) : null}

          {activeTab === "checkers" ? (
          <article className="card integrations-card">
            <div className="card-head">
              <h2>Check User Verifications</h2>
              <span className="badge ok">Onchain</span>
            </div>
            <p className="card-text">
              Query verification status by any wallet address using public reads from the verification registry contract.
            </p>
            <div className="integration-input-row">
              <input
                className="integration-input"
                type="text"
                value={integrationUserQuery}
                onChange={(event) => setIntegrationUserQuery(event.target.value)}
                placeholder={account ? `e.g. ${account}` : "0x... wallet address"}
              />
              <button
                className="btn"
                type="button"
                onClick={() => void checkIntegrationUserOnchain()}
                disabled={integrationUserChecking || (!integrationUserQuery.trim() && !account)}
              >
                {integrationUserChecking ? "Checking..." : "Check"}
              </button>
            </div>
            {integrationUserResponse ? (
              <pre className="integration-json">{stringifyIntegrationJson(integrationUserResponse)}</pre>
            ) : integrationUserChecking ? (
              <p className="hint">Reading verification status on-chain...</p>
            ) : (
              <p className="hint">Enter a wallet address and click `Check`.</p>
            )}
          </article>
          ) : null}

          {activeTab === "checkers" ? (
          <article className="card integrations-card">
            <div className="card-head">
              <h2>Check Asset</h2>
              <span className="badge ok">Onchain</span>
            </div>
            <p className="card-text">
              Resolve an asset in the registry using source network + token contract (+ tokenId for NFT / ERC1155).
            </p>
            <div className="integration-form-grid">
              <select
                className="integration-input"
                value={integrationAssetChainId}
                onChange={(event) => setIntegrationAssetChainId(event.target.value)}
              >
                {NETWORK_OPTIONS.map((network) => (
                  <option key={network.chainId} value={String(network.chainId)}>
                    {network.label} ({network.chainId})
                  </option>
                ))}
              </select>
              <select
                className="integration-input"
                value={integrationAssetTokenStandard}
                onChange={(event) => {
                  const value = event.target.value as TokenStandard;
                  setIntegrationAssetTokenStandard(value);
                  if (value === "ERC20") {
                    setIntegrationAssetTokenId("0");
                  } else if (!integrationAssetTokenId.trim() || integrationAssetTokenId === "0") {
                    setIntegrationAssetTokenId("1");
                  }
                }}
              >
                <option value="ERC20">ERC20</option>
                <option value="ERC721">ERC721</option>
                <option value="ERC1155">ERC1155</option>
              </select>
            </div>
            <div className="integration-input-row integration-input-row-asset">
              <input
                className="integration-input"
                type="text"
                value={integrationAssetTokenAddress}
                onChange={(event) => setIntegrationAssetTokenAddress(event.target.value)}
                placeholder="0x... token contract"
              />
              <input
                className="integration-input integration-input-token-id"
                type="text"
                value={integrationAssetTokenStandard === "ERC20" ? "0" : integrationAssetTokenId}
                onChange={(event) => setIntegrationAssetTokenId(event.target.value)}
                placeholder="tokenId"
                disabled={integrationAssetTokenStandard === "ERC20"}
              />
              <button
                className="btn"
                type="button"
                onClick={() => void checkIntegrationAssetOnchain()}
                disabled={integrationAssetChecking || !canCheckIntegrationAsset}
              >
                {integrationAssetChecking ? "Checking..." : "Check"}
              </button>
            </div>
            {integrationAssetResponse ? (
              <pre className="integration-json">{stringifyIntegrationJson(integrationAssetResponse)}</pre>
            ) : integrationAssetChecking ? (
              <p className="hint">Reading asset record on-chain...</p>
            ) : (
              <p className="hint">Select a source network and contract, then click `Check`.</p>
            )}
          </article>
          ) : null}

          {activeTab === "checkers" ? (
          <article className="card integrations-card integrations-card-wide">
            <div className="queue-head">
              <h3>All Assets</h3>
              <div className="queue-actions">
                <span className={`badge ${integrationAssetsRequested && integrationAssetsCount > 0 ? "ok" : "neutral"}`}>
                  {integrationAssetsRequested ? integrationAssetsCount : "-"}
                </span>
                <button
                  className="btn refresh-btn"
                  type="button"
                  onClick={refreshIntegrationAssetsDirectory}
                  disabled={busy || integrationAssetsLoading || !integrationReadProvider}
                  aria-busy={integrationAssetsLoading}
                >
                  <span className="refresh-btn-label" aria-live="polite">
                    <span className={`refresh-btn-state${integrationAssetsLoading ? " is-hidden" : ""}`} aria-hidden={integrationAssetsLoading}>
                      {integrationAssetsRequested ? "Refresh" : "Get all assets"}
                    </span>
                    <span className={`refresh-btn-state${integrationAssetsLoading ? "" : " is-hidden"}`} aria-hidden={!integrationAssetsLoading}>
                      <span className="btn-spinner" aria-hidden="true" />
                      {integrationAssetsRequested ? "Refreshing..." : "Loading..."}
                    </span>
                  </span>
                </button>
              </div>
            </div>
            {!integrationAssetsRequested ? (
              <p className="empty-state">Click `Get all assets` to load the verified asset directory from the public registry.</p>
            ) : integrationAssetsLoading && integrationAssetsCount === 0 ? (
              <p className="empty-state">Loading verified assets from the public registry...</p>
            ) : integrationAssetsResponse ? (
              <pre className="integration-json">{stringifyIntegrationJson(integrationAssetsResponse)}</pre>
            ) : (
              <p className="empty-state">No verified assets loaded yet. Click `Refresh` to re-query the public registry.</p>
            )}
          </article>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeTab === "personal" || activeTab === "business" ? (
      <section className="tab-section-group" aria-label={activeTab === "personal" ? "Personal verifications" : "Business verification"}>
      <div className="queue-head tab-section-head">
        <h3>{activeTab === "personal" ? "Personal Verifications" : "Business Verification"}</h3>
      </div>
      <section className="grid two">
        {activeTab === "personal" ? (
        <article className="card wallet-card">
          <div className="card-head">
            <h2>KYC</h2>
            <span className={`badge ${verify.ok ? "ok" : hasSdkToken || waitingPacket ? "neutral" : "warn"}`}>
              {verify.ok ? "Verified" : hasSdkToken || waitingPacket ? "In progress" : "Pending"}
            </span>
          </div>

          <p className="card-text">
            Complete KYC to unlock business verification and asset submissions in the marketplace flow.
          </p>

          <div className="wallet-actions">
            <button
              className="btn primary"
              onClick={() => void goToKyc()}
              disabled={busy || !account || networkMismatch || waitingPacket || verify.ok}
            >
              {verify.ok ? "Completed" : hasSdkToken ? "Restart KYC" : "Start KYC"}
            </button>
          </div>

          <dl className="kyc-kv-grid">
            <div>
              <dt>Address</dt>
              <dd>{walletLabel}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd className={networkMismatch ? "text-warn" : ""}>Chain {chainLabel}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{verify.ok ? "Pass" : `Blocked (${reasonLabel(verify.reason)})`}</dd>
            </div>
            <div>
              <dt>Encryption</dt>
              <dd>{encryptionReady ? "Ready" : "Missing"}</dd>
            </div>
            <div>
              <dt>Request ID</dt>
              <dd>{requestId}</dd>
            </div>
            <div>
              <dt>SDK packet</dt>
              <dd>{sdkPacketStageLabel}</dd>
            </div>
            <div>
              <dt>Packet exp</dt>
              <dd>{sdkPacketExpiryLabel}</dd>
            </div>
            <div>
              <dt>SDK token</dt>
              <dd className="mono">{sdkTokenPreview}</dd>
            </div>
            <div className="kyc-kv-full">
              <dt>CRE issuer</dt>
              <dd>{creIssuerAllowed === null ? "-" : creIssuerAllowed ? "allowed" : "not allowed"}</dd>
            </div>
          </dl>
        </article>
        ) : null}

        {activeTab === "personal" ? (
        <article className="card worldid-card">
          <div className="card-head">
            <h2>World ID Gate</h2>
            <span className={`badge ${worldIdVerified ? "ok" : "warn"}`}>{worldIdVerified ? "Linked" : "Not linked"}</span>
          </div>

          <p className="card-text">
            Use this as second verification provider in parallel with KYC. In staging, simulator proofs are expected.
          </p>

          {worldIdConfigured ? (
            <IDKitWidget
              app_id={env.worldIdAppId as `app_${string}`}
              action={env.worldIdAction}
              signal={account.toLowerCase()}
              verification_level={worldIdVerificationLevel}
              handleVerify={handleWorldIdVerify}
              onSuccess={onWorldIdSuccess}
              onError={onWorldIdError}
            >
              {({ open: openIdKit }: { open: () => void }) => (
                <button
                  className="btn primary"
                  onClick={openIdKit}
                  disabled={busy || !account || networkMismatch || worldIdVerified}
                >
                  {worldIdVerified ? "Completed" : "Start World ID"}
                </button>
              )}
            </IDKitWidget>
          ) : (
            <button className="btn" disabled>
              Configure World ID env first
            </button>
          )}

          {!worldIdConfigured ? (
            <p className="hint">Set `VITE_WORLD_ID_APP_ID` and `VITE_WORLD_ID_ACTION` in `frontend/.env`.</p>
          ) : null}

          <div className="worldid-meta">
            <span>Precheck mode: {worldIdPrecheckMode}</span>
            {worldIdErrorCode ? <span className="text-warn">Error code: {worldIdErrorCode}</span> : null}
          </div>
        </article>
        ) : null}

        {activeTab === "business" ? (
        <article className="card progress-card">
          <div className="card-head">
            <h2>KYB</h2>
            <div className="card-head-badges">
              <span className="card-head-note">KYC Required</span>
              <span className={`badge ${kybQuickBadgeClass}`}>{kybQuickLabel}</span>
            </div>
          </div>

          <p className="card-text">
            Required for a company that wants to list a verified asset in the marketplace.
          </p>

          <div className="business-verify-grid">
            <div className="kyb-company-box">
              <div className="kyb-company-head">
                <strong>KYB Company Profile</strong>
                {kybCompanyLinked ? <span className="badge ok">Linked</span> : null}
              </div>
              <div className="kyb-company-grid">
                <label>
                  Legal name
                  <input
                    value={kybCompanyProfileVisible ? (kybCompanyProfile?.legalName ?? "-") : ""}
                    readOnly
                  />
                </label>
                <label>
                  Company ref
                  <input
                    value={kybCompanyProfileVisible ? (kybCompanyProfile?.companyRef ?? "-") : ""}
                    readOnly
                  />
                </label>
                <label>
                  Jurisdiction
                  <input
                    value={kybCompanyProfileVisible ? (kybCompanyProfile?.jurisdiction ?? "-") : ""}
                    readOnly
                  />
                </label>
                <label>
                  Registration country
                  <input
                    value={kybCompanyProfileVisible ? (kybCompanyProfile?.registrationCountry || "-") : ""}
                    readOnly
                  />
                </label>
                <label className="full-width">
                  Website
                  <input
                    value={kybCompanyProfileVisible ? (kybCompanyProfile?.website || "-") : ""}
                    readOnly
                  />
                </label>
              </div>
              <p className="hint">
                {kybCompanyProfileVisible
                  ? "Stub mode: company profile is auto-generated from wallet and is not editable."
                  : "Company profile fields will appear after KYB is completed."}
              </p>
            </div>

            <div className="kyb-provider-stack">
              <div className="kyb-company-box kyb-provider-box">
                <div className="kyb-company-head">
                  <strong>KYB Provider Slot</strong>
                </div>
                <p className="card-text">
                  This area can be connected to any KYB provider integration and mapped to the same KYB flow.
                </p>
                <div className="kyb-provider-tags">
                  <span className="pill">Persona</span>
                  <span className="pill">Sumsub KYB</span>
                  <span className="pill">Middesk</span>
                  <span className="pill">Alloy</span>
                  <span className="pill">Custom API</span>
                </div>
                <p className="hint">Replace the current stub with provider SDK/webhooks + review status sync.</p>
              </div>

              <div className="kyb-provider-controls">
                <div className="kyb-actions">
                  <button className="btn primary" onClick={runKybAction} disabled={kybActionDisabled}>
                    {kybActionLabel}
                  </button>
                  <button className="btn danger" onClick={resetKybStub} disabled={busy || !account || kybStubStatus === "not_started"}>
                    Reset
                  </button>
                </div>

                <p className="hint">
                  Onchain KYB request: {hasKybRequest && latestKybRequestId !== "-" ? `#${latestKybRequestId}` : "not created"}.
                </p>
              </div>
            </div>
          </div>
        </article>
        ) : null}
      </section>
      </section>
      ) : null}

      {activeTab === "assets" || activeTab === "business" ? (
      <section className={`card registry-card${activeTab === "assets" ? " registry-card-assets" : ""}`}>
        {activeTab === "business" ? (
          <>
          <div className="card-head">
            <h2>Asset Registry Intake</h2>
            <span className={`badge ${verify.ok && hasActiveKybFlag ? "ok" : "warn"}`}>
              {verify.ok && hasActiveKybFlag ? "Ready" : "Locked"}
            </span>
          </div>
          <p className="card-text">
            Add only real assets here. Issuer company is pulled from KYB and submissions are queued before onchain send.
          </p>
          </>
        ) : null}

        {activeTab === "business" ? (
        <>
        {assetRegistryIntakeLocked ? <p className="registry-lock-note">{assetRegistryIntakeLockReason}</p> : null}
        <form className={`registry-form${assetRegistryIntakeLocked ? " registry-intake-disabled" : ""}`} onSubmit={addAssetToQueue}>
          <div className="registry-top-grid full-width">
            <div className="registry-block">
              <div className="registry-block-head">
                <h3>Asset Details</h3>
              </div>
              <div className="registry-details-grid">
                <label>
                  Asset name
                  <input
                    value={assetDraft.name}
                    onChange={(event) => updateDraft("name", event.target.value)}
                    placeholder="Example: Stadium Ticket Pass"
                  />
                </label>

                <label>
                  Metadata URI
                  <input
                    value={assetDraft.metadataUri}
                    onChange={(event) => updateDraft("metadataUri", event.target.value)}
                    placeholder="ipfs://... or https://..."
                  />
                </label>

                <label>
                  Metadata hash
                  <input
                    value={assetDraft.metadataHash}
                    onChange={(event) => updateDraft("metadataHash", event.target.value)}
                    placeholder="0x..."
                  />
                </label>

                <label>
                  Buyer verification
                  <select
                    value={assetDraft.buyerVerificationRequirement}
                    onChange={(event) =>
                      updateDraft("buyerVerificationRequirement", event.target.value as BuyerVerificationRequirement)
                    }
                  >
                    <option value="open">Open (no verification)</option>
                    <option value="kyc">KYC</option>
                    <option value="worldid">World ID</option>
                    <option value="kyc_worldid">KYC + World ID</option>
                  </select>
                </label>

                <label className="full-width">
                  Notes
                  <textarea
                    value={assetDraft.notes}
                    onChange={(event) => updateDraft("notes", event.target.value)}
                    placeholder="Issuer notes, legal context, ownership model"
                    rows={3}
                  />
                </label>
              </div>
            </div>

            <div className="registry-block">
              <div className="deployments-head">
                <h3>Network Contracts</h3>
                <button className="btn" type="button" onClick={addDeploymentRow} disabled={busy || !account}>
                  + Add network
                </button>
              </div>

              <div className="deployments-list">
                {assetDraft.deployments.map((deployment, index) => (
                  <div className="deployment-row" key={deployment.id}>
                    <label>
                      Network
                      <select
                        value={deployment.chainId}
                        onChange={(event) => updateDeploymentDraft(deployment.id, "chainId", event.target.value)}
                      >
                        {NETWORK_OPTIONS.map((option) => (
                          <option key={option.chainId} value={option.chainId}>
                            {option.label} ({option.chainId})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Contract address
                      <input
                        value={deployment.tokenAddress}
                        onChange={(event) => updateDeploymentDraft(deployment.id, "tokenAddress", event.target.value)}
                        placeholder="0x..."
                      />
                    </label>

                    <label>
                      Token type
                      <select
                        value={deployment.tokenStandard}
                        onChange={(event) => updateDeploymentDraft(deployment.id, "tokenStandard", event.target.value as TokenStandard)}
                      >
                        <option value="ERC20">ERC20</option>
                        <option value="ERC721">ERC721 (NFT)</option>
                        <option value="ERC1155">ERC1155</option>
                      </select>
                    </label>

                    <label>
                      Token ID
                      <input
                        value={deployment.tokenId}
                        onChange={(event) => updateDeploymentDraft(deployment.id, "tokenId", event.target.value)}
                        placeholder={deployment.tokenStandard === "ERC20" ? "Fixed: 0" : "Token ID"}
                        inputMode="numeric"
                        disabled={deployment.tokenStandard === "ERC20"}
                      />
                    </label>

                    <button
                      className="deployment-remove"
                      type="button"
                      onClick={() => removeDeploymentRow(deployment.id)}
                      disabled={assetDraft.deployments.length <= 1}
                      title={`Remove deployment #${index + 1}`}
                      aria-label={`Remove deployment #${index + 1}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6v8h2V9h-2Zm4 0v8h2V9h-2ZM7 9v10c0 1.1.9 2 2 2h6a2 2 0 0 0 2-2V9H7Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <p className="hint">Use one row per network contract where this asset is listed. Metadata fields above are shared for all rows.</p>
              <div className="form-actions">
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={createRealIpfsData}
                    onChange={(event) => setCreateRealIpfsData(event.target.checked)}
                    disabled={busy || generatingAsset}
                  />
                  <span>Create real IPFS data</span>
                </label>
                <button className="btn" type="button" onClick={generateAssetDraftFromPreset} disabled={busy || generatingAsset}>
                  {generatingAsset ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Generating...
                    </>
                  ) : (
                    "Gen Asset"
                  )}
                </button>
                <span className="form-actions-break" aria-hidden="true" />
                <button className="btn primary" type="submit" disabled={busy || generatingAsset || !account || !verify.ok || !hasActiveKybFlag}>
                  Add to queue
                </button>
                <span className="hint">
                  Queue is wallet-scoped local draft. Use submit actions below to send onchain requests. Next preset: {nextGeneratedPresetName}
                  {createRealIpfsData ? " · Gen Asset uploads SVG + metadata to Pinata" : ""}
                </span>
              </div>
            </div>
          </div>
        </form>
        </>
        ) : null}

        {activeTab === "business" ? (
        <div className={`queue-wrap registry-block${assetRegistryIntakeLocked ? " registry-intake-disabled" : ""}`}>
          <div className="queue-head">
            <h3>Queue</h3>
            <span className={`badge ${registryQueue.length > 0 ? "neutral" : "warn"}`}>{registryQueue.length}</span>
          </div>
          {registryQueue.length === 0 ? (
            <p className="empty-state">No assets queued yet. Submit your first real asset above.</p>
          ) : (
            <div className="queue-table-wrap">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Deployments</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {registryQueue.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="table-sub">{new Date(item.createdAt).toLocaleString()}</div>
                      </td>
                      <td>
                        <strong>{item.companyLegalName ?? "-"}</strong>
                        <div className="table-sub">
                          {(item.companyRef ?? "-") + " · " + (item.companyJurisdiction ?? "-")}
                        </div>
                      </td>
                      <td>
                        <div className="queue-deployments">
                          {item.deployments.map((deployment, deploymentIndex) => (
                            <div key={`${item.id}-${deploymentIndex}`} className="queue-deployment-item">
                              <span>{chainName(deployment.chainId)} ({deployment.chainId})</span>
                              <span>{deployment.tokenStandard}</span>
                              <span className="mono">{shortAddress(deployment.tokenAddress)}</span>
                              {deployment.tokenStandard !== "ERC20" ? <span>ID {deployment.tokenId}</span> : null}
                              {deployment.assetRequestId ? <span>Req #{deployment.assetRequestId}</span> : null}
                              {deployment.requestTxHash ? <span className="mono">reqTx {shortAddress(deployment.requestTxHash)}</span> : null}
                              {deployment.verifyTxHash ? <span className="mono">verifyTx {shortAddress(deployment.verifyTxHash)}</span> : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${queueStatusBadgeClass(item.status)}`}>{item.status}</span>
                        {item.lastError ? <div className="table-sub text-warn">{item.lastError}</div> : null}
                      </td>
                      <td>
                        <div className="queue-row-actions">
                          <button
                            className="table-action"
                            onClick={() => void submitQueuedAsset(item.id)}
                            disabled={
                              busy ||
                              !account ||
                              item.status === "submitting" ||
                              item.status === "submitted" ||
                              item.status === "verified"
                            }
                          >
                            {item.status === "failed" ? "Retry submit" : "Submit"}
                          </button>
                          <button className="table-action" onClick={() => removeQueuedAsset(item.id)} disabled={busy || item.status === "submitting"}>
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="queue-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => void submitAllQueuedAssets()}
              disabled={busy || !account || !hasActiveKybFlag || !hasKybRequest || latestKybRequestId === "-"}
            >
              Submit all to CRE
            </button>
            <button
              className="btn refresh-btn"
              type="button"
              onClick={() => void refreshVerifiedAssets()}
              disabled={busy || refreshingAssets || !account || assetRegistryIntakeLocked}
              aria-busy={refreshingAssets}
            >
              <span className="refresh-btn-label" aria-live="polite">
                <span className={`refresh-btn-state${refreshingAssets ? " is-hidden" : ""}`} aria-hidden={refreshingAssets}>
                  Refresh verified
                </span>
                <span className={`refresh-btn-state${refreshingAssets ? "" : " is-hidden"}`} aria-hidden={!refreshingAssets}>
                  <span className="btn-spinner" aria-hidden="true" />
                  Refreshing...
                </span>
              </span>
            </button>
          </div>
        </div>
        ) : null}

        {activeTab === "assets" ? (
        <div className="verified-wrap verified-wrap-assets">
          <div className="queue-head">
            <h3>Verified Assets</h3>
            <div className="queue-actions">
              <div className="assets-scope-toggle" role="group" aria-label="Asset list scope">
                <button
                  className={`assets-scope-btn${assetsViewMode === "all" ? " active" : ""}`}
                  type="button"
                  onClick={() => setAssetsViewMode("all")}
                >
                  All assets
                </button>
                <button
                  className={`assets-scope-btn${assetsViewMode === "mine" ? " active" : ""}`}
                  type="button"
                  onClick={() => setAssetsViewMode("mine")}
                  disabled={!account}
                  title={!account ? "Connect wallet to view your assets" : "Show assets where you are the owner"}
                >
                  Published by me
                </button>
              </div>
              <span className={`badge ${verifiedAssets.length > 0 ? "ok" : "neutral"}`}>{verifiedAssets.length}</span>
              <button
                className="btn refresh-btn"
                type="button"
                onClick={() => {
                  setResolvedAssetMetadataByUri({});
                  refreshAssetsGallery();
                }}
                disabled={busy || refreshingAssets || !canReadCurrentAssetsView}
                aria-busy={refreshingAssets}
              >
                <span className="refresh-btn-label" aria-live="polite">
                  <span className={`refresh-btn-state${refreshingAssets ? " is-hidden" : ""}`} aria-hidden={refreshingAssets}>
                    Refresh
                  </span>
                  <span className={`refresh-btn-state${refreshingAssets ? "" : " is-hidden"}`} aria-hidden={!refreshingAssets}>
                    <span className="btn-spinner" aria-hidden="true" />
                    Refreshing...
                  </span>
                </span>
              </button>
            </div>
          </div>

          {verifiedAssets.length === 0 ? (
            <p className="empty-state">
              {wantsMineAssets
                ? "No verified assets found for your wallet yet."
                : "No verified assets yet. Submit queued assets and wait for CRE to attest them in `AssetRegistry`."}
            </p>
          ) : (
            <div className="verified-grid">
              {verifiedAssets.map((asset) => {
                const metadataPreview = resolvedAssetMetadataByUri[asset.metadataUri];
                const imageHttpUrl = metadataPreview?.imageHttpUrl || "";
                const inlineImageDataUrl = metadataPreview?.inlineImageDataUrl || "";
                const previewImageUrl = inlineImageDataUrl || imageHttpUrl;
                const imageHttpFallbackUrls = inlineImageDataUrl
                  ? []
                  : metadataPreview?.imageHttpFallbackUrls ?? (imageHttpUrl ? [imageHttpUrl] : []);
                const cardTitle = metadataPreview?.name || asset.name;
                const cardDescription = metadataPreview?.description || "";
                const buyerRequirement =
                  metadataPreview?.buyerVerificationRequirement || asset.buyerVerificationRequirement || "open";
                const buyerRequirementLabel = buyerVerificationRequirementLabel(buyerRequirement);
                const canBuyByVerification = buyerVerificationRequirementSatisfied(buyerRequirement, verify.ok, hasActiveWorldIdFlag);
                const canBuy = Boolean(account) && canBuyByVerification;
                const buyButtonTitle = !account
                  ? "Connect wallet to buy"
                  : canBuy
                    ? `Buy access: ${buyerRequirementLabel}`
                    : buyerVerificationRequirementHelpText(buyerRequirement);
                const cardCompanyProfileFallback =
                  account && asset.owner.toLowerCase() === account.toLowerCase() ? kybCompanyProfile : null;
                const metadataCompanyLegalName = metadataPreview?.companyLegalName?.trim();
                const metadataCompanyRef = metadataPreview?.companyRef?.trim();
                const metadataCompanyWebsite = metadataPreview?.companyWebsite?.trim();
                const metadataCompanyJurisdiction = metadataPreview?.companyJurisdiction?.trim();
                const companyName =
                  metadataCompanyLegalName ||
                  asset.companyLegalName?.trim() ||
                  cardCompanyProfileFallback?.legalName?.trim() ||
                  "Company unavailable";
                const companySiteUrl = externalHttpUrl(
                  metadataCompanyWebsite || asset.companyWebsite || cardCompanyProfileFallback?.website || ""
                );
                const showVerifiedCardLinks =
                  Boolean(companySiteUrl) ||
                  metadataPreview?.status === "loading" ||
                  metadataPreview?.status === "error";
                const companyMeta = [
                  metadataCompanyRef || asset.companyRef || cardCompanyProfileFallback?.companyRef,
                  metadataCompanyJurisdiction || asset.companyJurisdiction || cardCompanyProfileFallback?.jurisdiction
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                <article className="verified-card" key={asset.groupId}>
                  <div className="verified-card-media">
                    {previewImageUrl ? (
                      <img
                        src={previewImageUrl}
                        alt={cardTitle || "Asset preview"}
                        loading="lazy"
                        data-fallback-urls={imageHttpFallbackUrls.join("\n")}
                        data-fallback-index="0"
                        onError={handleVerifiedAssetImageError}
                      />
                    ) : (
                      <div className="verified-card-media-placeholder">No preview</div>
                    )}
                    <span className="badge ok verified-card-media-badge">Verified</span>
                  </div>

                  <div className="verified-card-body">
                  <div className="verified-card-head">
                    <div className="verified-card-head-copy">
                      <strong>{cardTitle}</strong>
                      {cardDescription ? <p className="verified-card-subtitle">{cardDescription}</p> : null}
                    </div>
                  </div>

                  <div className="verified-chip-row">
                    {asset.deployments.map((deployment) => {
                      const chainLabel = chainName(deployment.chainId);
                      const explorerUrl = contractExplorerUrl(deployment.chainId, deployment.tokenAddress);
                      const key = `${asset.groupId}-${deployment.chainId}-${deployment.assetKey}`;
                      const tooltipContent = (
                        <span className="verified-network-tooltip" role="tooltip">
                          <span className="verified-network-tooltip-title">{chainLabel} ({deployment.chainId})</span>
                          <span className="verified-network-tooltip-grid">
                            <span>Type</span>
                            <strong>{deployment.tokenStandard}</strong>
                            <span>Contract</span>
                            <strong className="mono" title={deployment.tokenAddress}>{deployment.tokenAddress}</strong>
                            <span>Token ID</span>
                            <strong>{deployment.tokenId}</strong>
                            <span>KYB Req</span>
                            <strong>#{deployment.kybRequestId}</strong>
                            <span>Verified</span>
                            <strong>{formatUnixTimestamp(deployment.verifiedAt)}</strong>
                          </span>
                        </span>
                      );

                      if (explorerUrl) {
                        return (
                          <span className="verified-network-pill-wrap" key={key}>
                            <a
                              className="pill ok verified-network-pill"
                              href={explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`${chainLabel} contract`}
                            >
                              {chainLabel}
                            </a>
                            {tooltipContent}
                          </span>
                        );
                      }

                      return (
                        <span className="verified-network-pill-wrap" key={key}>
                          <span className="pill ok verified-network-pill" tabIndex={0}>
                            {chainLabel}
                          </span>
                          {tooltipContent}
                        </span>
                      );
                    })}
                  </div>

                  <div className="verified-card-stats">
                    <div className="verified-card-stat">
                      <span>Publisher</span>
                      <strong className="mono" title={asset.owner}>{shortAddress(asset.owner)}</strong>
                    </div>
                    <div className="verified-card-stat">
                      <span>Company</span>
                      <strong title={companyMeta ? `${companyName} · ${companyMeta}` : companyName}>{companyName}</strong>
                    </div>
                    <div className="verified-card-stat">
                      <span>Last verified</span>
                      <strong>{formatUnixTimestamp(asset.latestVerifiedAt)}</strong>
                    </div>
                  </div>

                  {companyMeta ? <div className="verified-card-submeta">{companyMeta}</div> : null}

                  {showVerifiedCardLinks ? (
                    <div className="verified-card-links">
                      {companySiteUrl ? (
                        <a className="verified-card-link" href={companySiteUrl} target="_blank" rel="noreferrer">
                          Company Site
                        </a>
                      ) : null}
                      {metadataPreview?.status === "loading" ? <span className="verified-card-meta-status">Loading IPFS metadata…</span> : null}
                      {metadataPreview?.status === "error" ? <span className="verified-card-meta-status">Metadata unavailable</span> : null}
                    </div>
                  ) : null}

                  <div className="verified-card-actions">
                    <span className={`pill ${buyerVerificationRequirementBadgeClass(buyerRequirement)} verified-buy-pill`}>
                      Buy access: {buyerRequirementLabel}
                    </span>
                    <button
                      className="btn primary verified-buy-btn"
                      type="button"
                      disabled={busy || !canBuy}
                      title={buyButtonTitle}
                      onClick={() => setStatus(`Buy flow stub for "${cardTitle || asset.name}" is not implemented yet.`)}
                    >
                      Buy
                    </button>
                  </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
        ) : null}
      </section>
      ) : null}

      <section className="status-log card" aria-label="Status log">
        <div className="status-log-head">
          <span className="status-label">Status Log</span>
          <span className="status-value">{status}</span>
        </div>
        <div
          ref={statusLogRef}
          className="status-log-list"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {statusHistory.map((entry) => (
            <div key={entry.id} className={`status-log-entry ${entry.level === "error" ? "error" : ""}`}>
              <span className="status-log-time">[{entry.timestamp}]</span>
              <span className="status-log-message">{entry.message}</span>
            </div>
          ))}
        </div>
      </section>

      {globalBusy ? (
        <div className="loading-backdrop">
          <div className="loading-card">
            <div className="spinner" />
            <h3>{progressCopy.title}</h3>
            <p>{progressCopy.message}</p>
            <span>{status}</span>
          </div>
        </div>
      ) : null}

      {sumsubModalOpen ? (
        <div className="modal-backdrop" onClick={() => setSumsubModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Sumsub Verification</h3>
              <button className="btn" onClick={() => setSumsubModalOpen(false)}>
                Close
              </button>
            </div>
            <div id="sumsub-modal-container" className="sumsub modal-sumsub" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
