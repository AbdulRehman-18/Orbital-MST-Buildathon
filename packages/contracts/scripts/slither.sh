#!/usr/bin/env bash
# Static analysis with Slither (plan §16.1). Runs in an isolated uv environment; needs `uv`.
# `timestamp` is excluded on purpose: tender commit/reveal windows and the grievance SLA are
# multi-day deadlines where a validator's few seconds of timestamp drift are irrelevant.
set -euo pipefail
cd "$(dirname "$0")/.."
uv tool run --from solc-select solc-select install 0.8.24 >/dev/null
SOLC="$HOME/.solc-select/artifacts/solc-0.8.24/solc-0.8.24"
OZ=$(cd node_modules/@openzeppelin/contracts && pwd -P)
OZU=$(cd node_modules/@openzeppelin/contracts-upgradeable && pwd -P)
status=0
for c in NammaSevaAccess ProjectRegistry MilestoneEscrow GrievanceRegistry TenderRegistry governance/NammaSevaMultisig governance/Imports; do
  echo "── $c"
  set +e
  out=$(uv tool run --from slither-analyzer slither "contracts/$c.sol" \
    --config-file slither.config.json --solc "$SOLC" \
    --solc-remaps "@openzeppelin/contracts/=$OZ/ @openzeppelin/contracts-upgradeable/=$OZU/" \
    --solc-args "--via-ir --optimize --evm-version shanghai --allow-paths $OZ,$OZU,$(pwd)" \
    --fail-medium 2>&1)
  code=$?
  set -e
  echo "$out" | grep -vE "running$|Multiple frameworks|^\s*$" || true
  [ "$code" -ne 0 ] && status=$code
done
exit $status
