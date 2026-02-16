# PassStore: CRE-Driven Verification + Onchain Asset Registry

No-backend monorepo where verification is orchestrated by onchain events + CRE worker.

## What Is Implemented

- KYC via Sumsub with encrypted SDK token delivery onchain.
- World ID request flow with CRE-side proof verification and onchain flag attestation.
- KYB gate (currently stub UX in frontend, real onchain request + flag update through CRE).
- Onchain `AssetRegistry` gated by KYB policy.
- Frontend queue + submit-to-CRE + verified asset cards with tx/block metadata.

## Repository Structure

- `contracts/` - smart contracts and deployment scripts.
- `cre/` - unified TypeScript worker (local CRE role).
- `frontend/` - React app for wallet, KYC, World ID, KYB, and asset intake.
- `DON_FILES/` - templates/runbook for production DON packaging:
  - `DON_FILES/TS/` - TypeScript workflow templates for `cre workflow deploy`.
  - `DON_FILES/GO/` - backup local Go worker implementation (KYC-focused baseline).

## Local Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start local chain (terminal #1):

```bash
npm run node:local -w contracts
```

3. Prepare env files:

- `contracts/.env.example` -> `contracts/.env`
- `cre/.env.example` -> `cre/.env`
- `frontend/.env.example` -> `frontend/.env`

4. Deploy contracts:

```bash
npm run deploy:local -w contracts
```

5. Copy fresh addresses from deploy output:

- to `frontend/.env`:
  - `VITE_PASS_REGISTRY`
  - `VITE_KYC_BROKER`
  - `VITE_ASSET_REGISTRY`
  - `VITE_ACCESS_PASS`
  - `VITE_CLAIM_DROP`
- to `cre/.env`:
  - `PASS_REGISTRY_ADDRESS`
  - `KYC_BROKER_ADDRESS`
  - `ASSET_REGISTRY_ADDRESS`

6. Fill runtime credentials:

- `cre/.env`: `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `CRE_SIGNER_PK`
- `frontend/.env`: `VITE_WC_PROJECT_ID`
- World ID values (staging):
  - `VITE_WORLD_ID_APP_ID`, `VITE_WORLD_ID_ACTION`
  - `WORLD_ID_APP_ID`, `WORLD_ID_ACTION`

7. Start CRE worker (terminal #2):

```bash
npm run dev:worker -w cre
```

8. Start frontend (terminal #3):

```bash
npm run dev -w frontend
```

## E2E Test Flow

1. Connect wallet.
2. Enable encryption.
3. Start KYC and finish Sumsub flow.
4. Click `Sync + refresh` until KYC flag is green.
5. Start World ID (in staging use simulator flow if account is not Orb-verified).
6. Start KYB stub and confirm onchain KYB request is created.
7. Wait for KYB flag to become green.
8. Add asset to queue and click submit.
9. After CRE processes `AssetVerificationRequested`, the item appears in `Verified Assets` with tx hash/block.

## Important Notes

- Frontend queue accepts draft-like values, but onchain submit requires valid non-zero EVM token addresses.
- World ID modal can show success before CRE final attestation; source of truth is onchain flags and worker logs.
- If contracts are redeployed, restart worker and frontend so both use fresh addresses.
- No plaintext Sumsub token is stored onchain; only encrypted packet.

## Useful Commands

```bash
# Contracts tests
npm run test -w contracts

# Build checks
npm run build -w contracts
npm run build -w cre
npm run build -w frontend
```

## DON Packaging

For production DON-style workflow packaging and deploy scripts, see:

- `DON_FILES/README.md`
- `DON_FILES/TS/README.md`
- `DON_FILES/GO/README.md`
