# Trace2Green

B2B platform for collecting, verifying, scoring and monitoring environmental
activity data from SME/UMKM suppliers. Competition MVP (The 21st Management
E[X]POSED BPC 2026). All seeded data is **simulated**.

Architecture, schema, import mapping, page map and free-tier limits:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local development (no Firebase project needed)

Requires Node 20+ and Java 11+ (for the Firebase emulators).

```bash
npm install
npm run emulators            # terminal 1: Auth + Firestore emulators
npm run dev                  # terminal 2: http://localhost:3000 (uses .env.local)
```

Create a company admin on the emulator:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  npm run provision -- company CMP-A "Perusahaan Mitra A" admin@mitra-a.test rahasia123 demo
```

## Tests

```bash
npm test          # security rules + identity integration tests (emulator)
npm run test:e2e  # production build + browser test of the auth flows (emulator)
npm run typecheck
npm run lint
```

## Status

| Phase | State |
|---|---|
| 1 Foundation (auth, roles, rules, identity) | Done, tested on emulator |
| 2 Supplier portal | Not started |
| 3 Seed, emissions, scoring, verification | Not started |
| 4 Company dashboard | Not started |
| 5 Sheets / Looker Studio | Not started — needs Google credentials |
| 6 QA + Vercel deploy | Not started — needs Firebase + Vercel projects |
