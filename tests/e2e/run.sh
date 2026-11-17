#!/usr/bin/env bash
# Runs inside `firebase emulators:exec`. Fixtures → Next server → browser tests (Phase 1 + 2).
set -euo pipefail
export FIREBASE_PROJECT_ID=demo-trace2green
npx tsx scripts/provision.ts company CMP-A "Perusahaan Mitra A" admin@mitra-a.test rahasia123 demo
OUT=$(npx tsx tests/e2e/fixtures.ts)
INVITE=$(echo "$OUT" | sed -n 's/^INVITE=//p')
CONNECT=$(echo "$OUT" | sed -n 's/^CONNECT=//p')
npx next start -p 3000 > /tmp/t2g-next.log 2>&1 &
NEXT_PID=$!
trap 'kill $NEXT_PID 2>/dev/null; pkill -f "next start -p 3000" 2>/dev/null; pkill -f next-server 2>/dev/null; true' EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000 >/dev/null && break; sleep 1; done
node tests/e2e/phase1.e2e.cjs "$INVITE"
node tests/e2e/phase2.e2e.cjs "$CONNECT"
npx tsx tests/e2e/verify-db.ts
