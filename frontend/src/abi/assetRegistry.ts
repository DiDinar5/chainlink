export const assetRegistryAbi = [
  "event AssetVerified(bytes32 indexed assetKey, address indexed owner, uint256 indexed kybRequestId, uint256 sourceChainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard, address issuer)",
  "function computeAssetKey(uint256 sourceChainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard) view returns (bytes32 assetKey)",
  "function getOwnerAssetKeys(address owner) view returns (bytes32[])",
  "function assets(bytes32 assetKey) view returns (address owner, uint256 sourceChainId, address tokenAddress, uint256 tokenId, uint8 tokenStandard, string symbolOrName, bytes32 metadataHash, string metadataURI, uint256 kybRequestId, uint64 verifiedAt, uint64 updatedAt, bool revoked, bool exists)"
] as const;
