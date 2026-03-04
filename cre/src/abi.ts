export const BROKER_ABI = [
  "event KycRequested(uint256 indexed requestId, address indexed user, string levelName)",
  "event KycSyncRequested(uint256 indexed syncRequestId, address indexed user, uint256 indexed requestId)",
  "event WorldIdVerificationRequested(uint256 indexed worldIdRequestId, address indexed user, string nullifierHash, string verificationLevel)",
  "event KybRequested(uint256 indexed kybRequestId, address indexed user, string companyRef, string jurisdiction)",
  "event AssetVerificationRequested(uint256 indexed assetRequestId, uint256 indexed kybRequestId, address indexed user, uint256 chainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard, string symbolOrName, bytes32 metadataHash, string metadataURI)",
  "function encryptionPubKey(address user) view returns (bytes)",
  "function getPacket(uint256 requestId) view returns (address user, bytes ciphertext, uint64 expiresAt, bool consumed, bool exists)",
  "function storeEncryptedToken(uint256 requestId, bytes ciphertext, uint64 expiresAt)",
  "function requestWorldIdVerification(string proof, string merkleRoot, string nullifierHash, string verificationLevel) returns (uint256 worldIdRequestId)"
] as const;

export const REGISTRY_ABI = [
  "function attest(address user, (uint256 flags, uint64 expiration, uint32 riskScore, uint8 subjectType, bytes32 refHash) data)",
  "function attestV2(address user, (uint256 flags, uint64 humanExpiration, uint64 worldIdExpiration, uint64 kybExpiration, uint32 riskScore, uint8 subjectType, bytes32 refHash) data)",
  "function revoke(address user)",
  "function verifyUser(address user, uint256 policyId) view returns (bool ok, uint8 reason)",
  "function attestations(address user) view returns (uint256 flags, uint64 expiration, uint32 riskScore, uint8 subjectType, bytes32 refHash, uint64 updatedAt, bool revoked, bool exists)",
  "function verificationExpirations(address user) view returns (uint64 humanExpiration, uint64 worldIdExpiration, uint64 kybExpiration)"
] as const;

export const ASSET_REGISTRY_ABI = [
  "function computeAssetKey(uint256 sourceChainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard) view returns (bytes32 assetKey)",
  "function verifyAsset(address owner, uint256 sourceChainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard, string symbolOrName, bytes32 metadataHash, string metadataURI, uint256 kybRequestId) returns (bytes32 assetKey)",
  "function assets(bytes32 assetKey) view returns (address owner, uint256 sourceChainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard, string symbolOrName, bytes32 metadataHash, string metadataURI, uint256 kybRequestId, uint64 verifiedAt, uint64 updatedAt, bool revoked, bool exists)"
] as const;
