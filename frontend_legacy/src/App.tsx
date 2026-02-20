import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, Interface, ethers } from "ethers";
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

type PendingDecryptPacket = {
  requestId: string;
  ciphertextHex: string;
  expiresAt: number;
  owner: string;
};

type OnchainSnapshot = {
  verify: VerifySnapshot;
  worldIdVerified: boolean;
  hasKybRequest: boolean;
  latestKybRequestId: string;
};

type WalletProviderLike = unknown;

type SumsubStatusSnapshot = {
  reviewStatus: string;
  reviewAnswer: string;
};

type SdkPacketStage = "idle" | "requested" | "token_ready" | "consumed";

type KybStubStatus = "not_started" | "in_review" | "verified";

type TokenStandard = "ERC20" | "ERC721" | "ERC1155";

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
  sourceRecordId?: string;
};

const SESSION_SECRET_STORAGE_PREFIX = "passstore:session-secret:";
const KYB_STUB_STORAGE_PREFIX = "passstore:kyb-stub:";
const KYB_COMPANY_PROFILE_STORAGE_PREFIX = "passstore:kyb-company-profile:";
const REGISTRY_QUEUE_STORAGE_PREFIX = "passstore:registry-queue:";
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
  const [error, setError] = useState<string>("");
  const [requestId, setRequestId] = useState<string>("-");
  const [sdkTokenPreview, setSdkTokenPreview] = useState<string>("-");
  const [sdkPacketStage, setSdkPacketStage] = useState<SdkPacketStage>("idle");
  const [sdkPacketExpiresAt, setSdkPacketExpiresAt] = useState<number>(0);
  const [verify, setVerify] = useState<VerifySnapshot>({ ok: false, reason: 1 });
  const [attestation, setAttestation] = useState<AttestationSnapshot | null>(null);
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
  const [assetDraft, setAssetDraft] = useState<AssetDraft>(defaultAssetDraft(env.chainId));
  const [registryQueue, setRegistryQueue] = useState<RegistryRecord[]>([]);
  const [verifiedAssets, setVerifiedAssets] = useState<VerifiedAssetCard[]>([]);
  const [refreshingAssets, setRefreshingAssets] = useState<boolean>(false);

  const { open } = useAppKit();
  const { address: appKitAddress, isConnected: isAppKitConnected } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider<WalletProviderLike>("eip155");

  const sessionSecretKeyRef = useRef<string>("");
  const worldIdPollNonceRef = useRef<number>(0);
  const worldIdPendingAddressRef = useRef<string>("");
  const sumsubAutoSyncInFlightRef = useRef<boolean>(false);
  const sumsubAutoSyncCooldownUntilRef = useRef<number>(0);

  const provider = useMemo(() => {
    if (!walletProvider) {
      return null;
    }
    return new BrowserProvider(walletProvider as ethers.Eip1193Provider);
  }, [walletProvider]);

  useEffect(() => {
    sessionSecretKeyRef.current = sessionSecretKeyHex;
  }, [sessionSecretKeyHex]);

  useEffect(() => {
    const lightClass = "page-theme-light";
    document.body.classList.add(lightClass);

    return () => {
      document.body.classList.remove(lightClass);
    };
  }, []);

  useEffect(() => {
    if (!appKitAddress || !isAppKitConnected) {
      if (account) {
        worldIdPollNonceRef.current += 1;
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
    if (!account || !provider) {
      return;
    }

    void refreshVerifiedAssets(account, provider);
    const intervalId = window.setInterval(() => {
      void refreshVerifiedAssets(account, provider);
    }, 9000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [account, provider]);

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
      pubKeyHex,
      hasKybRequestOnchain,
      latestKybRequestIdOnchain,
      hasKycRequestOnchain,
      latestKycRequestIdOnchain
    ] = await Promise.all([
      registry.verifyUser(user, env.policyId),
      registry.attestations(user),
      broker.encryptionPubKey(user),
      broker.hasKybRequest(user),
      broker.latestKybRequestId(user),
      broker.hasKycRequest(user),
      broker.latestKycRequestId(user)
    ]);

    const verifySnapshot = { ok: Boolean(verifyResult[0]), reason: Number(verifyResult[1]) };
    const attFlags = BigInt(attResult[0]);
    const isWorldIdLinked = (attFlags & env.worldIdFlag) === env.worldIdFlag && Boolean(attResult[7]) && !Boolean(attResult[6]);

    setVerify(verifySnapshot);
    setAttestation({
      flags: attFlags.toString(),
      expiration: Number(attResult[1]),
      riskScore: Number(attResult[2]),
      subjectType: Number(attResult[3]),
      revoked: Boolean(attResult[6]),
      exists: Boolean(attResult[7])
    });
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
      hasKybRequest: Boolean(hasKybRequestOnchain),
      latestKybRequestId: Boolean(hasKybRequestOnchain) ? (latestKybRequestIdOnchain as bigint).toString() : "-"
    };
  }

  async function refreshVerifiedAssets(forAccount?: string, providerOverride?: BrowserProvider): Promise<void> {
    const activeProvider = providerOverride ?? provider;
    if (!activeProvider) {
      return;
    }

    const user = (forAccount ?? account).toLowerCase();
    if (!user) {
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
      const ownerKeys = (await assetRegistry.getOwnerAssetKeys(user)) as string[];
      const latestBlock = await activeProvider.getBlockNumber();
      const verifyMetaByKey = new Map<string, { txHash?: string; blockNumber?: number }>();

      for (const key of ownerKeys) {
        const filter = assetRegistry.filters.AssetVerified(key, user);
        const logs = await assetRegistry.queryFilter(filter, 0, latestBlock);
        const latestLog = logs.length > 0 ? logs[logs.length - 1] : undefined;

        if (latestLog) {
          verifyMetaByKey.set(key.toLowerCase(), {
            txHash: latestLog.transactionHash,
            blockNumber: latestLog.blockNumber
          });
        }
      }

      type VerifiedDeploymentRow = VerifiedAssetDeployment & {
        owner: string;
        name: string;
        metadataUri: string;
        metadataHash: string;
        sourceRecordId?: string;
      };

      const verifiedRows: VerifiedDeploymentRow[] = [];
      for (const key of ownerKeys) {
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
          owner: user,
          chainId: chainIdValue,
          tokenAddress: tokenAddressValue,
          tokenStandard: tokenStandardValue,
          tokenId: tokenIdValue,
          name: linkedQueueRecord?.name || symbolOrNameValue,
          metadataUri: linkedQueueRecord?.metadataUri || metadataUriValue,
          metadataHash: linkedQueueRecord?.metadataHash || metadataHashValue,
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

  async function pollEncryptedPacket(reqId: bigint): Promise<{ ciphertextHex: string; expiresAt: number }> {
    if (!provider) {
      throw new Error("Provider unavailable");
    }

    const { broker } = makeContracts(provider);
    const started = Date.now();

    while (Date.now() - started < 180_000) {
      const packet = await broker.getPacket(reqId);
      const ciphertextHex = packet[1] as string;
      const expiresAt = Number(packet[2]);

      if (ciphertextHex !== "0x") {
        return { ciphertextHex, expiresAt };
      }

      setStatus(`Waiting encrypted SDK token for request ${reqId.toString()}...`);
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
        const packet = await pollEncryptedPacket(newRequestId);
        const pendingPacket = {
          requestId: newRequestId.toString(),
          ciphertextHex: packet.ciphertextHex,
          expiresAt: packet.expiresAt,
          owner: address
        };

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

  function generateAssetDraftFromPreset() {
    if (GENERATED_ASSET_PRESETS.length === 0) {
      setError("No asset presets configured");
      return;
    }

    const presetIndex = generatedPresetCursor % GENERATED_ASSET_PRESETS.length;
    const preset = GENERATED_ASSET_PRESETS[presetIndex];
    const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(`${preset.name}|${preset.metadataUri}`));

    setError("");
    setAssetDraft({
      name: preset.name,
      metadataUri: preset.metadataUri,
      metadataHash,
      notes: preset.notes,
      deployments: preset.deployments.map((deployment) => deploymentDraftFromPresetRow(deployment))
    });
    setGeneratedPresetCursor((previous) => (previous + 1) % GENERATED_ASSET_PRESETS.length);
    setStatus(`Generated asset preset: ${preset.name}`);
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

    if (!hasKybFlag) {
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
      deployments: normalizedDeployments,
      companyLegalName: kybCompanyProfile.legalName,
      companyRef: kybCompanyProfile.companyRef,
      companyJurisdiction: kybCompanyProfile.jurisdiction,
      kybVerifiedAt: kybCompanyProfile.verifiedAt,
      kybRequestId: hasKybRequest ? latestKybRequestId : undefined,
      status: "queued"
    };

    setRegistryQueue((previous) => [record, ...previous]);
    setAssetDraft(defaultAssetDraft(chainId || env.chainId));
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
  const chainLabel = chainId || expectedChainId || "-";

  const attestationFlags = attestation ? BigInt(attestation.flags) : 0n;
  const hasKycFlag = (attestationFlags & 1n) === 1n;
  const hasWorldIdFlag = (attestationFlags & env.worldIdFlag) === env.worldIdFlag;
  const hasKybFlag = (attestationFlags & 4n) === 4n;

  const kybStatusLabel =
    kybStubStatus === "verified" ? "Verified" : kybStubStatus === "in_review" ? "In review" : "Not started";
  const kybCompanyLinked = hasKybFlag && Boolean(kybCompanyProfile);
  const nextGeneratedPresetName =
    GENERATED_ASSET_PRESETS.length > 0
      ? GENERATED_ASSET_PRESETS[generatedPresetCursor % GENERATED_ASSET_PRESETS.length].name
      : "Preset";

  const verificationDoneCount = [verify.ok, worldIdVerified, hasKybFlag].filter(Boolean).length;
  const verificationPercent = Math.round((verificationDoneCount / 3) * 100);

  const globalBusy = busy || waitingPacket || refreshingStatus || syncWaiting;
  const progressCopy = getProgressCopy(status, waitingPacket, refreshingStatus, syncWaiting);

  return (
    <div className="flow-page">
      <header className="hero-card card">
        <div>
          <p className="eyebrow">PassStore CRE Flow</p>
          <h1>Verification + Registry Console</h1>
          <p className="hero-text">
            One interface for wallet session encryption, KYC, World ID, KYB gating and asset registry intake.
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn primary" onClick={connectWallet} disabled={busy}>
            {isAppKitConnected ? "Wallet" : "Connect wallet"}
          </button>
          <button className="btn" onClick={() => void refreshStatusWithRetry()} disabled={busy || !account || networkMismatch}>
            Check status
          </button>
        </div>
      </header>

      <section className="grid two">
        <article className="card wallet-card">
          <div className="card-head">
            <h2>Wallet Session</h2>
            <span className={`badge ${isAppKitConnected ? "ok" : "warn"}`}>{isAppKitConnected ? "Connected" : "Disconnected"}</span>
          </div>

          <dl className="facts">
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
          </dl>

          <div className="wallet-actions">
            <button className="btn" onClick={enableEncryption} disabled={busy || !account || networkMismatch}>
              Enable encryption
            </button>
            <button className="btn" onClick={() => void goToKyc()} disabled={busy || !account || networkMismatch || waitingPacket}>
              {hasSdkToken ? "Restart KYC" : "Start KYC"}
            </button>
            <button className="btn" onClick={() => void refreshStatusWithRetry()} disabled={busy || !account || networkMismatch}>
              Sync + refresh
            </button>
          </div>

          <div className="meta-row">
            <span>Request ID: {requestId}</span>
            <span>SDK packet: {sdkPacketStageLabel}</span>
            <span>Packet exp: {sdkPacketExpiryLabel}</span>
            <span>SDK token: {sdkTokenPreview}</span>
            <span>
              CRE issuer: {creIssuerAllowed === null ? "-" : creIssuerAllowed ? "allowed" : "not allowed"}
            </span>
          </div>
        </article>

        <article className="card progress-card">
          <div className="card-head">
            <h2>Verification Pipeline</h2>
            <span className="badge neutral">{verificationPercent}% complete</span>
          </div>

          <div className="step-list">
            <div className="step-item">
              <div>
                <strong>1. KYC (Sumsub)</strong>
                <p>Required for compliance pass and KYB start.</p>
              </div>
              <span className={`badge ${verify.ok ? "ok" : "warn"}`}>{verify.ok ? "Verified" : hasSdkToken ? "In progress" : "Pending"}</span>
            </div>

            <div className="step-item">
              <div>
                <strong>2. World ID</strong>
                <p>Optional second identity signal for your policy model.</p>
              </div>
              <span className={`badge ${worldIdVerified ? "ok" : "warn"}`}>{worldIdVerified ? "Verified" : "Pending"}</span>
            </div>

            <div className="step-item">
              <div>
                <strong>3. KYB (stub)</strong>
                <p>Dev placeholder. Asset issuer company is sourced from this profile.</p>
              </div>
              <span className={`badge ${hasKybFlag ? "ok" : kybStubStatus === "in_review" ? "neutral" : "warn"}`}>
                {hasKybFlag ? "Verified" : kybStatusLabel}
              </span>
            </div>
          </div>

          <div className="kyb-company-box">
            <div className="kyb-company-head">
              <strong>KYB Company Profile</strong>
              <span className={`badge ${kybCompanyLinked ? "ok" : "warn"}`}>{kybCompanyLinked ? "Linked" : "Not linked"}</span>
            </div>
            <div className="kyb-company-grid">
              <label>
                Legal name
                <input
                  value={kybCompanyProfile?.legalName ?? "-"}
                  readOnly
                />
              </label>
              <label>
                Company ref
                <input
                  value={kybCompanyProfile?.companyRef ?? "-"}
                  readOnly
                />
              </label>
              <label>
                Jurisdiction
                <input
                  value={kybCompanyProfile?.jurisdiction ?? "-"}
                  readOnly
                />
              </label>
              <label>
                Registration country
                <input
                  value={kybCompanyProfile?.registrationCountry || "-"}
                  readOnly
                />
              </label>
              <label className="full-width">
                Website
                <input
                  value={kybCompanyProfile?.website || "-"}
                  readOnly
                />
              </label>
            </div>
            <p className="hint">Stub mode: company profile is auto-generated from wallet and is not editable.</p>
          </div>

          <div className="kyb-actions">
            <button className="btn" onClick={() => void startKybStub()} disabled={busy || !account || !verify.ok || kybStubStatus !== "not_started"}>
              Start KYB stub
            </button>
            <button className="btn" onClick={approveKybStub} disabled={busy || !account || !verify.ok || kybStubStatus !== "in_review"}>
              Approve KYB stub
            </button>
            <button className="btn ghost" onClick={resetKybStub} disabled={busy || !account || kybStubStatus === "not_started"}>
              Reset
            </button>
          </div>
          <p className="hint">
            Onchain KYB request: {hasKybRequest && latestKybRequestId !== "-" ? `#${latestKybRequestId}` : "not created"}.
          </p>
        </article>
      </section>

      <section className="grid two">
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
                <button className="btn primary" onClick={openIdKit} disabled={busy || !account || networkMismatch}>
                  Start World ID
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

        <article className="card snapshot-card">
          <div className="card-head">
            <h2>Onchain Snapshot</h2>
            <span className={`badge ${verify.ok ? "ok" : "warn"}`}>{reasonLabel(verify.reason)}</span>
          </div>

          <dl className="facts compact">
            <div>
              <dt>Attestation exists</dt>
              <dd>{attestation?.exists ? "yes" : "no"}</dd>
            </div>
            <div>
              <dt>Revoked</dt>
              <dd>{attestation?.revoked ? "yes" : "no"}</dd>
            </div>
            <div>
              <dt>Expiration</dt>
              <dd>{formatUnixTimestamp(attestation?.expiration ?? 0)}</dd>
            </div>
            <div>
              <dt>Risk score</dt>
              <dd>{attestation?.riskScore ?? "-"}</dd>
            </div>
          </dl>

          <div className="flag-row">
            <span className={`pill ${hasKycFlag ? "ok" : "warn"}`}>KYC flag</span>
            <span className={`pill ${hasWorldIdFlag ? "ok" : "warn"}`}>World ID flag</span>
            <span className={`pill ${hasKybFlag ? "ok" : "warn"}`}>KYB flag</span>
          </div>

          <p className="hint">
            Current KYB is a frontend stub. Once CRE KYB provider is wired, this card will show real onchain KYB attestation.
          </p>
          <p className="hint">Broker KYB request: {hasKybRequest && latestKybRequestId !== "-" ? `#${latestKybRequestId}` : "none"}</p>
        </article>
      </section>

      <section className="card registry-card">
        <div className="card-head">
          <h2>Asset Registry Intake</h2>
          <span className={`badge ${verify.ok && hasKybFlag ? "ok" : "warn"}`}>
            {verify.ok && hasKybFlag ? "Ready" : "Locked"}
          </span>
        </div>

        <p className="card-text">
          This replaces demo asset cards. Add only real assets here. Issuer company is pulled from KYB.
        </p>

        <form className="registry-form" onSubmit={addAssetToQueue}>
          <div className="kyb-linked-company full-width">
            <div className="kyb-linked-head">
              <strong>Company from KYB</strong>
              <span className={`badge ${kybCompanyLinked ? "ok" : "warn"}`}>{kybCompanyLinked ? "Ready" : "Missing"}</span>
            </div>
            {kybCompanyProfile ? (
              <div className="kyb-linked-grid">
                <label>
                  Legal name
                  <input value={kybCompanyProfile.legalName} readOnly />
                </label>
                <label>
                  Company ref
                  <input value={kybCompanyProfile.companyRef} readOnly />
                </label>
                <label>
                  Jurisdiction
                  <input value={kybCompanyProfile.jurisdiction} readOnly />
                </label>
                <label>
                  Registration country
                  <input value={kybCompanyProfile.registrationCountry || "-"} readOnly />
                </label>
                <label className="full-width">
                  Website
                  <input value={kybCompanyProfile.website || "-"} readOnly />
                </label>
              </div>
            ) : (
              <p className="empty-state">No verified KYB company profile yet. Complete KYB step first.</p>
            )}
          </div>

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

          <label className="full-width">
            Notes
            <textarea
              value={assetDraft.notes}
              onChange={(event) => updateDraft("notes", event.target.value)}
              placeholder="Issuer notes, legal context, ownership model"
              rows={3}
            />
          </label>

          <div className="deployments-box full-width">
            <div className="deployments-head">
              <strong>Network deployments</strong>
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
                  >
                    Remove #{index + 1}
                  </button>
                </div>
              ))}
            </div>
            <p className="hint">Use one row per network where this asset is deployed. Metadata fields above are shared for all rows.</p>
          </div>

          <div className="form-actions full-width">
            <button className="btn" type="button" onClick={generateAssetDraftFromPreset} disabled={busy}>
              Gen Asset
            </button>
            <button className="btn primary" type="submit" disabled={busy || !account || !verify.ok || !hasKybFlag}>
              Add to queue
            </button>
            <span className="hint">Queue is wallet-scoped local draft. Use submit actions below to send onchain requests. Next preset: {nextGeneratedPresetName}</span>
          </div>
        </form>

        <div className="queue-wrap">
          <div className="queue-head">
            <h3>Queued Assets</h3>
            <div className="queue-actions">
              <button
                className="btn"
                type="button"
                onClick={() => void submitAllQueuedAssets()}
                disabled={busy || !account || !hasKybRequest || latestKybRequestId === "-"}
              >
                Submit all to CRE
              </button>
              <button className="btn" type="button" onClick={() => void refreshVerifiedAssets()} disabled={busy || !account}>
                {refreshingAssets ? "Refreshing..." : "Refresh verified"}
              </button>
            </div>
          </div>
          <p className="hint">
            KYB request ID: {hasKybRequest && latestKybRequestId !== "-" ? `#${latestKybRequestId}` : "missing"}.
            Asset submissions use this ID in onchain broker events.
          </p>
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
        </div>

        <div className="verified-wrap">
          <div className="queue-head">
            <h3>Verified Assets</h3>
            <span className={`badge ${verifiedAssets.length > 0 ? "ok" : "neutral"}`}>{verifiedAssets.length}</span>
          </div>

          {verifiedAssets.length === 0 ? (
            <p className="empty-state">
              No verified assets yet. Submit queued assets and wait for CRE to attest them in `AssetRegistry`.
            </p>
          ) : (
            <div className="verified-grid">
              {verifiedAssets.map((asset) => (
                <article className="verified-card" key={asset.groupId}>
                  <div className="verified-card-head">
                    <strong>{asset.name}</strong>
                    <span className="badge ok">{asset.deployments.length} network{asset.deployments.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="verified-chip-row">
                    {asset.deployments.map((deployment) => (
                      <span className="pill ok" key={`${asset.groupId}-${deployment.chainId}-${deployment.assetKey}`}>
                        {chainName(deployment.chainId)}
                      </span>
                    ))}
                  </div>
                  <dl className="verified-meta">
                    <div>
                      <dt>Owner</dt>
                      <dd className="mono">{asset.owner}</dd>
                    </div>
                    <div>
                      <dt>Latest verified at</dt>
                      <dd>{formatUnixTimestamp(asset.latestVerifiedAt)}</dd>
                    </div>
                    <div>
                      <dt>Deployments</dt>
                      <dd>{asset.deployments.length}</dd>
                    </div>
                    <div>
                      <dt>Metadata URI</dt>
                      <dd className="mono">{asset.metadataUri || "-"}</dd>
                    </div>
                    <div>
                      <dt>Metadata hash</dt>
                      <dd className="mono">{asset.metadataHash || "-"}</dd>
                    </div>
                  </dl>

                  <div className="verified-deployments">
                    {asset.deployments.map((deployment) => (
                      <div className="verified-deployment-item" key={`${deployment.assetKey}-${deployment.chainId}`}>
                        <div className="verified-deployment-top">
                          <strong>{chainName(deployment.chainId)} ({deployment.chainId})</strong>
                          <span className="badge neutral">{deployment.tokenStandard}</span>
                        </div>
                        <div className="verified-deployment-grid">
                          <span className="mono">contract: {deployment.tokenAddress}</span>
                          <span>tokenId: {deployment.tokenId}</span>
                          <span>kybReq: #{deployment.kybRequestId}</span>
                          <span>verified: {formatUnixTimestamp(deployment.verifiedAt)}</span>
                          <span className="mono">assetKey: {deployment.assetKey}</span>
                          <span className="mono">verifyTx: {deployment.verifyTxHash || "-"}</span>
                          <span>block: {deployment.verifyBlockNumber ?? "-"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="status-bar card">
        <span className="status-label">Status</span>
        <span className="status-value">{status}</span>
      </footer>

      {error ? (
        <div className="toast toast-error" role="alert">
          {error}
        </div>
      ) : null}

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
