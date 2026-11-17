#!/usr/bin/env bash
# Runs inside `firebase emulators:exec`. Fixtures → Next server → browser tests (Phase 1 + 2).
set -euo pipefail
export FIREBASE_PROJECT_ID=demo-trace2green
export NEXT_PUBLIC_REPORTING_REFERENCE_DATE=2027-04-05 # same demo clock as the build
npx tsx scripts/provision.ts company CMP-A "Perusahaan Mitra A" admin@mitra-a.test rahasia123 demo
OUT=$(npx tsx tests/e2e/fixtures.ts)
INVITE=$(echo "$OUT" | sed -n 's/^INVITE=//p')
CONNECT=$(echo "$OUT" | sed -n 's/^CONNECT=//p')
NODE_OPTIONS=--no-experimental-require-module npx next start -p 3000 > /tmp/t2g-next.log 2>&1 &
NEXT_PID=$!
cleanup() { kill $NEXT_PID 2>/dev/null || true; pkill -f next-server 2>/dev/null || true; for i in $(seq 1 20); do curl -sf http://127.0.0.1:3000 >/dev/null || break; sleep 0.5; done; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000 >/dev/null && break; sleep 1; done
node tests/e2e/phase1.e2e.cjs "$INVITE"
node tests/e2e/phase2.e2e.cjs "$CONNECT"
npx tsx tests/e2e/verify-db.ts
