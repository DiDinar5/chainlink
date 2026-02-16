// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPassRegistryVerifier {
    function verifyUser(address user, uint256 policyId) external view returns (bool ok, uint8 reason);
}

contract AssetRegistry {
    uint8 public constant TOKEN_STANDARD_ERC20 = 1;
    uint8 public constant TOKEN_STANDARD_ERC721 = 2;
    uint8 public constant TOKEN_STANDARD_ERC1155 = 3;
    uint8 public constant TOKEN_STANDARD_OTHER = 4;

    struct AssetRecord {
        address owner;
        uint256 sourceChainId;
        address tokenAddress;
        uint256 tokenId;
        uint8 tokenStandard;
        string symbolOrName;
        bytes32 metadataHash;
        string metadataURI;
        uint256 kybRequestId;
        uint64 verifiedAt;
        uint64 updatedAt;
        bool revoked;
        bool exists;
    }

    address public admin;
    IPassRegistryVerifier public immutable passRegistry;
    uint256 public immutable kybPolicyId;

    mapping(address => bool) public isIssuer;
    mapping(bytes32 => AssetRecord) public assets;
    mapping(address => bytes32[]) private ownerAssetKeys;

    event IssuerSet(address indexed issuer, bool allowed);
    event AssetVerified(
        bytes32 indexed assetKey,
        address indexed owner,
        uint256 indexed kybRequestId,
        uint256 sourceChainId,
        address tokenAddress,
        uint256 tokenId,
        uint8 tokenStandard,
        address issuer
    );
    event AssetRevoked(bytes32 indexed assetKey, address indexed owner, string reasonURI, address issuer);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AssetRegistry: not admin");
        _;
    }

    modifier onlyIssuer() {
        require(isIssuer[msg.sender], "AssetRegistry: not issuer");
        _;
    }

    modifier onlyIssuerOrAdmin() {
        require(msg.sender == admin || isIssuer[msg.sender], "AssetRegistry: forbidden");
        _;
    }

    constructor(address passRegistryAddress, uint256 kybPolicyId_) {
        require(passRegistryAddress != address(0), "AssetRegistry: pass registry required");
        admin = msg.sender;
        passRegistry = IPassRegistryVerifier(passRegistryAddress);
        kybPolicyId = kybPolicyId_;
    }

    function setIssuer(address issuer, bool allowed) external onlyAdmin {
        isIssuer[issuer] = allowed;
        emit IssuerSet(issuer, allowed);
    }

    function computeAssetKey(
        uint256 sourceChainId,
        address tokenAddress,
        uint256 tokenId,
        uint8 tokenStandard
    ) public pure returns (bytes32 assetKey) {
        return keccak256(abi.encodePacked(sourceChainId, tokenAddress, tokenId, tokenStandard));
    }

    function verifyAsset(
        address owner,
        uint256 sourceChainId,
        address tokenAddress,
        uint256 tokenId,
        uint8 tokenStandard,
        string calldata symbolOrName,
        bytes32 metadataHash,
        string calldata metadataURI,
        uint256 kybRequestId
    ) external onlyIssuer returns (bytes32 assetKey) {
        _validateAssetInput(
            owner,
            sourceChainId,
            tokenAddress,
            tokenId,
            tokenStandard,
            symbolOrName,
            metadataHash,
            metadataURI
        );
        _requireKybVerified(owner);

        assetKey = computeAssetKey(sourceChainId, tokenAddress, tokenId, tokenStandard);
        AssetRecord storage record = assets[assetKey];
        require(!record.exists || record.owner == owner, "AssetRegistry: owner mismatch");

        if (!record.exists || record.revoked) {
            ownerAssetKeys[owner].push(assetKey);
            record.verifiedAt = uint64(block.timestamp);
        }

        record.owner = owner;
        record.sourceChainId = sourceChainId;
        record.tokenAddress = tokenAddress;
        record.tokenId = tokenId;
        record.tokenStandard = tokenStandard;
        record.symbolOrName = symbolOrName;
        record.metadataHash = metadataHash;
        record.metadataURI = metadataURI;
        record.kybRequestId = kybRequestId;
        record.updatedAt = uint64(block.timestamp);
        record.revoked = false;
        record.exists = true;

        emit AssetVerified(
            assetKey,
            owner,
            kybRequestId,
            sourceChainId,
            tokenAddress,
            tokenId,
            tokenStandard,
            msg.sender
        );
    }

    function revokeAsset(bytes32 assetKey, string calldata reasonURI) external onlyIssuerOrAdmin {
        AssetRecord storage record = assets[assetKey];
        require(record.exists, "AssetRegistry: asset missing");
        require(!record.revoked, "AssetRegistry: already revoked");

        record.revoked = true;
        record.updatedAt = uint64(block.timestamp);

        emit AssetRevoked(assetKey, record.owner, reasonURI, msg.sender);
    }

    function getOwnerAssetKeys(address owner) external view returns (bytes32[] memory) {
        return ownerAssetKeys[owner];
    }

    function isAssetVerified(bytes32 assetKey) external view returns (bool) {
        AssetRecord memory record = assets[assetKey];
        return record.exists && !record.revoked;
    }

    function _requireKybVerified(address owner) private view {
        (bool ok, ) = passRegistry.verifyUser(owner, kybPolicyId);
        require(ok, "AssetRegistry: owner not KYB-verified");
    }

    function _validateAssetInput(
        address owner,
        uint256 sourceChainId,
        address tokenAddress,
        uint256 tokenId,
        uint8 tokenStandard,
        string calldata symbolOrName,
        bytes32 metadataHash,
        string calldata metadataURI
    ) private pure {
        require(owner != address(0), "AssetRegistry: owner required");
        require(sourceChainId > 0, "AssetRegistry: invalid chain");
        require(tokenStandard > 0 && tokenStandard <= TOKEN_STANDARD_OTHER, "AssetRegistry: invalid token standard");
        require(bytes(symbolOrName).length > 0, "AssetRegistry: empty symbol/name");
        require(metadataHash != bytes32(0) || bytes(metadataURI).length > 0, "AssetRegistry: metadata required");

        if (tokenStandard <= TOKEN_STANDARD_ERC1155) {
            require(tokenAddress != address(0), "AssetRegistry: token address required");
        }

        // ERC20 assets are represented by token contract address only.
        if (tokenStandard == TOKEN_STANDARD_ERC20) {
            require(tokenId == 0, "AssetRegistry: tokenId must be zero for ERC20");
        }
    }
}
