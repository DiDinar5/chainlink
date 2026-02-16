#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-staging-settings}"
WORKFLOWS=(
  "issue-sdk-token"
  "sync-kyc-status"
  "verify-world-id"
  "sync-kyb-status"
  "verify-asset"
)

echo "Target: $TARGET"

for workflow in "${WORKFLOWS[@]}"; do
  path="./workflows/$workflow"
  if [[ ! -d "$path" ]]; then
    echo "Missing workflow folder: $path"
    exit 1
  fi

  echo "==> Simulate $workflow"
  cre workflow simulate "$path" --target "$TARGET"
done

echo "Done"
