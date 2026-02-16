export type ReviewDecision = "GREEN" | "RED" | "PENDING";

export interface KycRequestEventData {
  requestId: bigint;
  user: string;
  levelName: string;
  blockNumber: number;
}

export interface KycSyncRequestEventData {
  syncRequestId: bigint;
  user: string;
  requestId: bigint;
  blockNumber: number;
}

export interface WorldIdVerificationRequestEventData {
  worldIdRequestId: bigint;
  user: string;
  nullifierHash: string;
  verificationLevel: string;
  txHash: string;
  blockNumber: number;
}

export interface KybRequestEventData {
  kybRequestId: bigint;
  user: string;
  companyRef: string;
  jurisdiction: string;
  txHash: string;
  blockNumber: number;
}

export interface AssetVerificationRequestEventData {
  assetRequestId: bigint;
  kybRequestId: bigint;
  user: string;
  chainId: bigint;
  tokenAddress: string;
  tokenId: bigint;
  tokenStandard: number;
  symbolOrName: string;
  metadataHash: string;
  metadataURI: string;
  txHash: string;
  blockNumber: number;
}

export interface SumsubTokenResponse {
  token: string;
  userId: string;
  levelName: string;
  ttlInSecs: number;
  raw: unknown;
}

export interface SumsubReviewStatus {
  userId: string;
  applicantId?: string;
  decision: ReviewDecision;
  raw: unknown;
}

export interface UserSyncState {
  userId?: string;
  lastSeenRequestId?: string;
  lastReviewDecision?: ReviewDecision;
  lastSyncAt?: string;
}

export type SumsubUserIdMap = Record<string, string>;

export interface WorkflowState {
  lastIssueTokenBlock: number;
  lastSyncBlock: number;
  lastWorldIdBlock: number;
  lastKybBlock: number;
  lastAssetBlock: number;
  users: Record<string, UserSyncState>;
  sumsubUserIds: SumsubUserIdMap;
}
