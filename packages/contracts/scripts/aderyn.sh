#!/usr/bin/env bash
# Static analysis with Aderyn (plan §16.1). Writes the report to reports/aderyn.md.
# Triage of every finding: docs/security/phase-2-static-analysis.md.
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'rm -f remappings.txt' EXIT
cat > remappings.txt <<'MAP'
@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/
@openzeppelin/contracts-upgradeable/=node_modules/@openzeppelin/contracts-upgradeable/
forge-std/=node_modules/forge-std/src/
MAP
mkdir -p reports
npx -y @cyfrin/aderyn@0.6.8 . --src contracts --path-excludes contracts/legacy,contracts/mocks -o reports/aderyn.md
