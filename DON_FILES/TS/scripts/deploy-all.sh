#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-production-settings}"
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

  echo "==> Deploy $workflow"
  cre workflow deploy "$path" --target "$TARGET"
  cre workflow activate "$path" --target "$TARGET"
done

echo "Done"
