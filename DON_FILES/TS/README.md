# DON_FILES/TS

TypeScript workflow package for Chainlink CRE/DON deployment.

## Included Workflows

- `workflows/issue-sdk-token`  
  Trigger: `KycRequested`  
  Action: fetch Sumsub SDK token, encrypt for wallet session key, store packet onchain.

- `workflows/sync-kyc-status`  
  Trigger: `KycSyncRequested`  
  Action: sync Sumsub decision -> `PassRegistry.attest/revoke`.

- `workflows/verify-world-id`  
  Trigger: `WorldIdVerificationRequested`  
  Action: verify proof with World ID API and attest World ID flag in registry.

- `workflows/sync-kyb-status`  
  Trigger: `KybRequested`  
  Action: run KYB provider logic (or policy stub) and set KYB flag.

- `workflows/verify-asset`  
  Trigger: `AssetVerificationRequested`  
  Action: call `AssetRegistry.verifyAsset(...)` after KYB gating checks.

## Files

- `project.yaml` - targets (`staging-settings`, `production-settings`).
- `.env.example` - minimal env for CLI + secrets upload.
- `secrets.production.yaml` - DON Vault mapping for secrets.
- `scripts/simulate-all.sh` - simulate all workflows.
- `scripts/deploy-all.sh` - deploy + activate all workflows.

## Important

- These are deployment templates.  
  `main.ts` files intentionally keep TODO placeholders to be wired against your exact `cre init workflow typescript` scaffold.
- Keep field names aligned with CLI scaffold generated in your environment.
- Contract addresses and flags in `config.*.json` must match your latest deploy.

## Quick Start

1. Enter folder:

```bash
cd DON_FILES/TS
```

2. Prepare env:

```bash
cp .env.example .env
```

3. Fill/update:

- `project.yaml` RPC endpoints
- `workflows/*/config.staging.json`
- `workflows/*/config.production.json`

4. Upload secrets:

```bash
cre secrets create ./secrets.production.yaml --target production-settings
```

5. Simulate all:

```bash
./scripts/simulate-all.sh staging-settings
```

6. Deploy all:

```bash
./scripts/deploy-all.sh production-settings
```
