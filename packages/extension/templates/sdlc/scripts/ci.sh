#!/usr/bin/env bash
# .edlc/scripts/ci.sh
# Auto-review runner for the Implement step.
# EDLC calls this script after the developer agent finishes; if it exits
# non-zero the step is marked as failing auto-review.
#
# Customize the commands below to match your project's toolchain.

set -euo pipefail

echo "[edlc-ci] Running lint…"
# npm run lint
# pnpm lint
# yarn lint

echo "[edlc-ci] Running type-check…"
# npm run typecheck
# pnpm typecheck

echo "[edlc-ci] Running tests…"
# npm test
# pnpm test
# pytest

echo "[edlc-ci] All checks passed."
