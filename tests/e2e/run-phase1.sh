#!/usr/bin/env bash
# Runs inside `firebase emulators:exec`. Builds fixtures, starts Next, runs the browser test.
set -euo pipefail
export FIREBASE_PROJECT_ID=demo-trace2green
npx tsx scripts/provision.ts company CMP-A "Perusahaan Mitra A" admin@mitra-a.test rahasia123 demo
INVITE=$(npx tsx tests/e2e/fixtures-phase1.ts | sed -n 's/^INVITE=//p')
npx next start -p 3000 > /tmp/t2g-next.log 2>&1 &
NEXT_PID=$!
trap 'kill $NEXT_PID 2>/dev/null; pkill -f "next start -p 3000" 2>/dev/null; pkill -f next-server 2>/dev/null; true' EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000 >/dev/null && break; sleep 1; done
node tests/e2e/phase1.e2e.cjs "$INVITE"
