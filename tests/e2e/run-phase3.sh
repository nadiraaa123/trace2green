#!/usr/bin/env bash
# Phase 3 e2e: seeded workbook + live submission + reviewer decision (inside emulators:exec).
set -euo pipefail
export FIREBASE_PROJECT_ID=demo-trace2green
npx tsx scripts/provision.ts company CMP-A "Perusahaan Mitra A" reviewer@mitra-a.test rahasia123 demo
npx tsx scripts/provision.ts company CMP-B "Perusahaan Mitra B" reviewer@mitra-b.test rahasia123 demo
OUT=$(npx tsx tests/e2e/fixtures-phase3.ts)
CONNECT=$(echo "$OUT" | sed -n 's/^CONNECT=//p')
CLAIM=$(echo "$OUT" | sed -n 's/^CLAIM=//p')
npx next start -p 3000 > /tmp/t2g-next3.log 2>&1 &
NEXT_PID=$!
cleanup() { kill $NEXT_PID 2>/dev/null || true; pkill -f next-server 2>/dev/null || true; for i in $(seq 1 20); do curl -sf http://127.0.0.1:3000 >/dev/null || break; sleep 0.5; done; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000 >/dev/null && break; sleep 1; done
node tests/e2e/phase3.e2e.cjs "$CONNECT" "$CLAIM"
