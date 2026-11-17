#!/usr/bin/env bash
# Phase 4 e2e: seeded dashboard + phone-to-laptop flow with the labeled demo benchmark enabled.
set -euo pipefail
export FIREBASE_PROJECT_ID=demo-trace2green
export NEXT_PUBLIC_REPORTING_REFERENCE_DATE=2027-04-05 # same demo clock as the build
npx tsx scripts/provision.ts company CMP-A "Perusahaan Mitra A" reviewer@mitra-a.test rahasia123 demo
npx tsx scripts/provision.ts company CMP-B "Perusahaan Mitra B" reviewer@mitra-b.test rahasia123 demo
EXPECTED=$(npx tsx tests/e2e/fixtures-phase4.ts | sed -n 's/^EXPECTED=//p')
DEMO_SIMULATED_BENCHMARK=true npx next start -p 3000 > /tmp/t2g-next4.log 2>&1 &
NEXT_PID=$!
cleanup() { kill $NEXT_PID 2>/dev/null || true; pkill -f next-server 2>/dev/null || true; for i in $(seq 1 20); do curl -sf http://127.0.0.1:3000 >/dev/null || break; sleep 0.5; done; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000 >/dev/null && break; sleep 1; done
node tests/e2e/phase4.e2e.cjs "$EXPECTED"
