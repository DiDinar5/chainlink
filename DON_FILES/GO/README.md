# DON_FILES/GO (Backup Worker)

Go fallback implementation for local/backup operation.

## Current Coverage

- `IssueSdkToken` pass:
  - listens `KycRequested`
  - generates Sumsub SDK token
  - encrypts for wallet session key
  - stores packet in `KycSessionBroker`

- `SyncKycStatus` pass:
  - checks Sumsub review status
  - writes `PassRegistry.attest` / `PassRegistry.revoke`

## Not Yet Implemented Here

- World ID verification pass
- KYB sync pass
- Asset verification pass (`AssetRegistry`)

For full latest feature coverage use `cre/` (TypeScript worker) or DON TS workflows under `DON_FILES/TS`.

## Setup

1. Copy env:

```bash
cp .env.example .env
```

2. Fill required values:

- `RPC_URL`
- `CRE_SIGNER_PK`
- `KYC_BROKER_ADDRESS`
- `PASS_REGISTRY_ADDRESS`
- `SUMSUB_APP_TOKEN`
- `SUMSUB_SECRET_KEY`

3. Tune loop intervals if needed:

- `POLL_INTERVAL_MS` (request pickup)
- `SYNC_POLL_INTERVAL_MS` (status sync cadence)

## Run

Single run:

```bash
go run ./cmd/worker
```

Loop mode:

```bash
go run ./cmd/worker --loop
```

## Notes

- This implementation is intentionally conservative and focused on KYC baseline.
- Keep secrets only in env/secret manager.
- `KYC_LEVEL_NAME` is controlled by env, not UI input.
