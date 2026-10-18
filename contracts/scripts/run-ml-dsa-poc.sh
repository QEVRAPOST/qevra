#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
verifier_commit="cca262b537a5ac2ee55efb427e5c61de0308e566"
work="$(mktemp -d "${TMPDIR:-/tmp}/qevra-ml-dsa-phase0.XXXXXX")"
trap 'rm -rf "$work"' EXIT

python_bin="${PYTHON310:-python3.10}"
if ! command -v "$python_bin" >/dev/null 2>&1; then
  printf 'Python 3.10 is required by the pinned verifier test fixtures. Set PYTHON310 to its executable.\n' >&2
  exit 2
fi

git clone --no-checkout https://github.com/fireblocks-labs/evm-ml-dsa-verifier.git "$work/verifier"
git -C "$work/verifier" checkout --detach "$verifier_commit"
test "$(git -C "$work/verifier" rev-parse HEAD)" = "$verifier_commit"

mkdir -p "$work/verifier/src/phase0"
cp "$root/contracts/src/phase0/QevraAuthorizationHarness.sol" "$work/verifier/src/phase0/"
cp "$root/contracts/phase0-tests/QevraAuthorizationHarness.t.sol" "$work/verifier/test/"

"$python_bin" -m venv "$work/verifier/pythonref/myenv"
"$work/verifier/pythonref/myenv/bin/python" -m pip install -r "$work/verifier/pythonref/requirements.txt"

FOUNDRY_PROFILE=default forge test \
  --root "$work/verifier" \
  --match-path test/QevraAuthorizationHarness.t.sol \
  --gas-report \
  -vv

if [[ "${RUN_FULL_VERIFIER_SUITE:-0}" == "1" ]]; then
  FOUNDRY_PROFILE=default forge test --root "$work/verifier"
fi
