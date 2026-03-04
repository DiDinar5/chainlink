// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PassRegistry {
    uint256 public constant FLAG_HUMAN = 1 << 0;
    uint256 public constant FLAG_WORLD_ID = 1 << 1;
    uint256 public constant FLAG_KYB = 1 << 2;

    uint8 public constant REASON_OK = 0;
    uint8 public constant REASON_NO_ATTESTATION = 1;
    uint8 public constant REASON_REVOKED = 2;
    uint8 public constant REASON_EXPIRED = 3;
    uint8 public constant REASON_FLAGS_MISSING = 4;
    uint8 public constant REASON_RISK_TOO_HIGH = 5;
    uint8 public constant REASON_SUBJECT_TYPE_MISMATCH = 6;
    uint8 public constant REASON_POLICY_DISABLED = 7;

    struct Attestation {
        uint256 flags;
        uint64 expiration;
        uint32 riskScore;
        uint8 subjectType;
        bytes32 refHash;
        uint64 updatedAt;
        bool revoked;
        bool exists;
    }

    struct AttestationData {
        uint256 flags;
        uint64 expiration;
        uint32 riskScore;
        uint8 subjectType;
        bytes32 refHash;
    }

    struct AttestationDataV2 {
        uint256 flags;
        uint64 humanExpiration;
        uint64 worldIdExpiration;
        uint64 kybExpiration;
        uint32 riskScore;
        uint8 subjectType;
        bytes32 refHash;
    }

    struct VerificationExpirations {
        uint64 humanExpiration;
        uint64 worldIdExpiration;
        uint64 kybExpiration;
    }

    struct Policy {
        uint256 requiredFlags;
        uint32 maxRiskScore;
        uint8 allowedSubjectType; // 0 = any
        bool requireUnexpired;
        bool enabled;
    }

    address public admin;
    uint256 public nextPolicyId;

    mapping(address => Attestation) public attestations;
    mapping(address => VerificationExpirations) public verificationExpirations;
    mapping(uint256 => Policy) public policies;
    mapping(address => bool) public isIssuer;

    event IssuerSet(address indexed issuer, bool allowed);
    event Attested(
        address indexed user,
        uint256 flags,
        uint64 expiration,
        uint32 riskScore,
        uint8 subjectType,
        bytes32 refHash,
        address indexed issuer
    );
    event Revoked(address indexed user, address indexed issuer);
    event PolicyCreated(
        uint256 indexed policyId,
        uint256 requiredFlags,
        uint32 maxRiskScore,
        uint8 allowedSubjectType,
        bool requireUnexpired,
        bool enabled
    );
    event PolicyUpdated(
        uint256 indexed policyId,
        uint256 requiredFlags,
        uint32 maxRiskScore,
        uint8 allowedSubjectType,
        bool requireUnexpired,
        bool enabled
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "PassRegistry: not admin");
        _;
    }

    modifier onlyIssuer() {
        require(isIssuer[msg.sender], "PassRegistry: not issuer");
        _;
    }

    modifier onlyIssuerOrAdmin() {
        require(msg.sender == admin || isIssuer[msg.sender], "PassRegistry: forbidden");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setIssuer(address issuer, bool allowed) external onlyAdmin {
        isIssuer[issuer] = allowed;
        emit IssuerSet(issuer, allowed);
    }

    function createPolicy(
        uint256 requiredFlags,
        uint32 maxRiskScore,
        uint8 allowedSubjectType,
        bool requireUnexpired,
        bool enabled
    ) external onlyAdmin returns (uint256 policyId) {
        policyId = nextPolicyId;
        nextPolicyId = policyId + 1;

        policies[policyId] = Policy({
            requiredFlags: requiredFlags,
            maxRiskScore: maxRiskScore,
            allowedSubjectType: allowedSubjectType,
            requireUnexpired: requireUnexpired,
            enabled: enabled
        });

        emit PolicyCreated(
            policyId,
            requiredFlags,
            maxRiskScore,
            allowedSubjectType,
            requireUnexpired,
            enabled
        );
    }

    function updatePolicy(
        uint256 policyId,
        uint256 requiredFlags,
        uint32 maxRiskScore,
        uint8 allowedSubjectType,
        bool requireUnexpired,
        bool enabled
    ) external onlyAdmin {
        require(policyId < nextPolicyId, "PassRegistry: policy missing");

        policies[policyId] = Policy({
            requiredFlags: requiredFlags,
            maxRiskScore: maxRiskScore,
            allowedSubjectType: allowedSubjectType,
            requireUnexpired: requireUnexpired,
            enabled: enabled
        });

        emit PolicyUpdated(
            policyId,
            requiredFlags,
            maxRiskScore,
            allowedSubjectType,
            requireUnexpired,
            enabled
        );
    }

    function attest(address user, AttestationData calldata data) external onlyIssuer {
        AttestationDataV2 memory normalized = AttestationDataV2({
            flags: data.flags,
            humanExpiration: (data.flags & FLAG_HUMAN) == FLAG_HUMAN ? data.expiration : 0,
            worldIdExpiration: (data.flags & FLAG_WORLD_ID) == FLAG_WORLD_ID ? data.expiration : 0,
            kybExpiration: (data.flags & FLAG_KYB) == FLAG_KYB ? data.expiration : 0,
            riskScore: data.riskScore,
            subjectType: data.subjectType,
            refHash: data.refHash
        });
        _attestV2(user, normalized);
    }

    function attestV2(address user, AttestationDataV2 calldata data) external onlyIssuer {
        _attestV2(user, data);
    }

    function revoke(address user) external onlyIssuerOrAdmin {
        Attestation storage current = attestations[user];
        require(current.exists, "PassRegistry: no attestation");

        current.revoked = true;
        current.updatedAt = uint64(block.timestamp);

        emit Revoked(user, msg.sender);
    }

    function verifyUser(address user, uint256 policyId) external view returns (bool ok, uint8 reason) {
        Policy memory policy = policies[policyId];
        if (!policy.enabled) {
            return (false, REASON_POLICY_DISABLED);
        }

        Attestation memory a = attestations[user];
        if (!a.exists) {
            return (false, REASON_NO_ATTESTATION);
        }

        if (a.revoked) {
            return (false, REASON_REVOKED);
        }

        if ((a.flags & policy.requiredFlags) != policy.requiredFlags) {
            return (false, REASON_FLAGS_MISSING);
        }

        if (policy.requireUnexpired) {
            VerificationExpirations memory exps = verificationExpirations[user];
            if (_hasExpiredRequiredFlag(a, exps, policy.requiredFlags)) {
                return (false, REASON_EXPIRED);
            }
        }

        if (policy.maxRiskScore > 0 && a.riskScore > policy.maxRiskScore) {
            return (false, REASON_RISK_TOO_HIGH);
        }

        if (policy.allowedSubjectType != 0 && a.subjectType != policy.allowedSubjectType) {
            return (false, REASON_SUBJECT_TYPE_MISMATCH);
        }

        return (true, REASON_OK);
    }

    function _attestV2(address user, AttestationDataV2 memory data) internal {
        if ((data.flags & FLAG_KYB) == FLAG_KYB) {
            Attestation memory current = attestations[user];
            VerificationExpirations memory currentExps = verificationExpirations[user];
            bool hasActiveKyc = _isFlagActive(current, currentExps, FLAG_HUMAN);
            require(hasActiveKyc, "PassRegistry: kyb requires active kyc");
        }

        VerificationExpirations memory nextExps = VerificationExpirations({
            humanExpiration: (data.flags & FLAG_HUMAN) == FLAG_HUMAN ? data.humanExpiration : 0,
            worldIdExpiration: (data.flags & FLAG_WORLD_ID) == FLAG_WORLD_ID ? data.worldIdExpiration : 0,
            kybExpiration: (data.flags & FLAG_KYB) == FLAG_KYB ? data.kybExpiration : 0
        });

        verificationExpirations[user] = nextExps;

        uint64 aggregateExpiration = _aggregateExpiration(data.flags, nextExps);
        attestations[user] = Attestation({
            flags: data.flags,
            expiration: aggregateExpiration,
            riskScore: data.riskScore,
            subjectType: data.subjectType,
            refHash: data.refHash,
            updatedAt: uint64(block.timestamp),
            revoked: false,
            exists: true
        });

        emit Attested(
            user,
            data.flags,
            aggregateExpiration,
            data.riskScore,
            data.subjectType,
            data.refHash,
            msg.sender
        );
    }

    function _isFlagActive(
        Attestation memory att,
        VerificationExpirations memory exps,
        uint256 flag
    ) internal view returns (bool) {
        if (!att.exists || att.revoked || (att.flags & flag) != flag) {
            return false;
        }

        uint64 expiration = _flagExpiration(exps, flag);
        return expiration == 0 || expiration >= block.timestamp;
    }

    function _hasExpiredRequiredFlag(
        Attestation memory att,
        VerificationExpirations memory exps,
        uint256 requiredFlags
    ) internal view returns (bool) {
        if ((requiredFlags & FLAG_HUMAN) == FLAG_HUMAN && !_isFlagUnexpired(att, exps, FLAG_HUMAN)) {
            return true;
        }

        if ((requiredFlags & FLAG_WORLD_ID) == FLAG_WORLD_ID && !_isFlagUnexpired(att, exps, FLAG_WORLD_ID)) {
            return true;
        }

        if ((requiredFlags & FLAG_KYB) == FLAG_KYB && !_isFlagUnexpired(att, exps, FLAG_KYB)) {
            return true;
        }

        // Fallback for custom/unknown flags that still rely on the legacy aggregate expiration.
        uint256 knownFlags = FLAG_HUMAN | FLAG_WORLD_ID | FLAG_KYB;
        if ((requiredFlags & ~knownFlags) != 0) {
            return att.expiration != 0 && att.expiration < block.timestamp;
        }

        return false;
    }

    function _isFlagUnexpired(
        Attestation memory att,
        VerificationExpirations memory exps,
        uint256 flag
    ) internal view returns (bool) {
        if ((att.flags & flag) != flag) {
            return false;
        }
        uint64 expiration = _flagExpiration(exps, flag);
        return expiration == 0 || expiration >= block.timestamp;
    }

    function _flagExpiration(VerificationExpirations memory exps, uint256 flag) internal pure returns (uint64) {
        if (flag == FLAG_HUMAN) {
            return exps.humanExpiration;
        }
        if (flag == FLAG_WORLD_ID) {
            return exps.worldIdExpiration;
        }
        if (flag == FLAG_KYB) {
            return exps.kybExpiration;
        }
        return 0;
    }

    function _aggregateExpiration(uint256 flags, VerificationExpirations memory exps) internal pure returns (uint64) {
        uint64 result = 0;
        if ((flags & FLAG_HUMAN) == FLAG_HUMAN && exps.humanExpiration > result) {
            result = exps.humanExpiration;
        }
        if ((flags & FLAG_WORLD_ID) == FLAG_WORLD_ID && exps.worldIdExpiration > result) {
            result = exps.worldIdExpiration;
        }
        if ((flags & FLAG_KYB) == FLAG_KYB && exps.kybExpiration > result) {
            result = exps.kybExpiration;
        }
        return result;
    }
}
