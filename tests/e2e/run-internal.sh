#!/usr/bin/env bash
# Internal workspaces e2e (Platform Admin + Customer Success), inside emulators:exec.
set -euo pipefail
export FIREBASE_PROJECT_ID=demo-trace2green
export NEXT_PUBLIC_REPORTING_REFERENCE_DATE=2027-04-05 # same demo clock as the build
npx tsx scripts/provision.ts company CMP-A "Perusahaan Mitra A" reviewer@mitra-a.test rahasia123 demo
npx tsx scripts/provision.ts platform-admin admin@trace2green.test rahasia123
npx tsx scripts/provision.ts customer-success CS-001 "Sari CS" sari@trace2green.test rahasia123
npx tsx scripts/provision.ts customer-success CS-002 "Bima CS" bima@trace2green.test rahasia123
IDS=$(npx tsx tests/e2e/fixtures-internal.ts | sed -n 's/^IDS=//p')
NODE_OPTIONS=--no-experimental-require-module npx next start -p 3000 > /tmp/t2g-next-int.log 2>&1 &
NEXT_PID=$!
cleanup() { kill $NEXT_PID 2>/dev/null || true; pkill -f next-server 2>/dev/null || true; for i in $(seq 1 20); do curl -sf http://127.0.0.1:3000 >/dev/null || break; sleep 0.5; done; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000 >/dev/null && break; sleep 1; done
node tests/e2e/internal.e2e.cjs "$IDS"
