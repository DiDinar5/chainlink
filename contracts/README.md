# Contracts Package

Contains MVP smart contracts for no-backend PassStore architecture.

## Contracts

- `PassRegistry.sol` - attestations, issuer allowlist, policies, and `verifyUser`.
- `KycSessionBroker.sol` - stores encryption keys, KYC requests, encrypted SDK token packets, and user-triggered sync requests (`requestKycSync`).
- `AssetRegistry.sol` - issuer-managed onchain registry of verified assets (ERC20/721/1155/other), gated by KYB policy in `PassRegistry`.
- `AccessPass.sol` - demo mint gated by `verifyUser`.
- `ClaimDrop.sol` - demo claim gated by `verifyUser`.

## Usage

1. Copy `.env.example` to `.env`.
2. Start local node (`npx hardhat node`) or configure Sepolia RPC.
3. Compile/deploy:

```bash
npm run compile
npm run deploy:local
```

If Hardhat cannot download the compiler in restricted environments, run:

```bash
npm run check:solcjs
```

## Key Events

- `PassRegistry.Attested`, `PassRegistry.Revoked`
- `KycSessionBroker.KycRequested`, `KycSessionBroker.KycSyncRequested`, `KycSessionBroker.KybRequested`, `KycSessionBroker.AssetVerificationRequested`, `KycSessionBroker.TokenStored`
- `AssetRegistry.AssetVerified`, `AssetRegistry.AssetRevoked`
