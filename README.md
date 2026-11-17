# Trace2Green

B2B platform for collecting, verifying, scoring and monitoring environmental
activity data from SME/UMKM suppliers. Competition MVP (The 21st Management
E[X]POSED BPC 2026). **All seeded data is simulated.** Emission estimates are
not certified carbon accounting and not a guarantee of PSPK compliance.

- Architecture, schema, import mapping, page map, free-tier limits: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Firebase Auth · Cloud Firestore · Recharts · Lucide

## Status

| Phase | State |
|---|---|
| 1 Foundation (auth, roles, rules, supplier identity) | ✅ tested on emulator |
| 2 Supplier portal (home, profile, wizard, drafts, submission, history, consent) | ✅ tested on emulator |
| 3 Workbook seed, emissions, scoring, verification | ✅ tested on emulator |
| 4 Company dashboard (8 menus, filters Semua/Simulasi/Trial, company-scoped verification) | ✅ tested on emulator |
| 5 Google Sheets sync, Looker datasets, deployment config | ✅ code + tests; needs your credentials ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/LOOKER_STUDIO.md`](docs/LOOKER_STUDIO.md)) |

Scores: live reports show each component's status; a final score appears only when completeness, evidence and intensity are all available. No industry benchmark exists yet, so live reports have no final score (see ARCHITECTURE §7).

Evidence files are **not stored**: the wizard shows a demo-only preview and
records metadata (name, type, size). See ARCHITECTURE §5.

## Prerequisites

- Node.js 24 (see `.nvmrc`; `engines.node` is 24.x) and npm
- Java 11+ (Firebase emulators)
- Chromium for browser tests (`npx playwright install chromium` if you don't have one)

## Local development (no Firebase project needed)

```bash
npm install
cp .env.example .env.local
```

Set these values in `.env.local` for emulator mode:

```
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-trace2green
FIREBASE_PROJECT_ID=demo-trace2green
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_REPORTING_REFERENCE_DATE=2027-04-05
```

Then, in two terminals:

```bash
npm run emulators
```

```bash
npm run dev
```

Create a company admin and a connect code on the emulator (company accounts are never self-registered):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run provision -- company CMP-A "Perusahaan Mitra A" admin@mitra-a.test rahasia123 demo
```

Import the simulated workbook (100 suppliers, 277 reports, 12 audits; idempotent, safe to re-run):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed
```

`npm run seed -- --dry-run` shows what would change. Seeding a real project requires `--confirm-production`.

Demo scoring (optional): set `DEMO_SIMULATED_BENCHMARK=true` (server env) to let live reports use the simulated group average as a **labeled demo** benchmark. Leave it unset in production.

Suppliers register at `/daftar`. A self-registered supplier links to a buyer in
**Perusahaan Terhubung** using a code from `POST /api/companies/invites` (called
by the company admin; the dashboard UI for it comes in Phase 4).

## Connecting a real Firebase project (Spark plan)

1. Create a Firebase project; enable **Authentication → Email/Password** and **Cloud Firestore**.
2. Copy the web app config into `NEXT_PUBLIC_FIREBASE_*` in `.env.local` and set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false`; remove the `*_EMULATOR_HOST` lines.
3. Create a service account key (Project settings → Service accounts), then put its base64 in `FIREBASE_SERVICE_ACCOUNT_KEY`. Never commit the JSON file.

```bash
base64 -w0 path/to/service-account.json
```

4. Deploy rules and indexes:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes --project <your-project-id>
```

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run typecheck && npm run lint
```

- `npm test`: unit tests, Firestore security-rules tests and server workflow tests on the emulator.
- `npm run test:e2e`: production build, then browser tests of the Phase 1 auth flows and the full Phase 2 supplier workflow (with a live company view) plus database assertions, then the Phase 3 flow on a fully seeded database, then the Phase 4 phone-to-laptop demo (seeded dashboard, invitation from Settings, live KPI updates, Trial filter, company-scoped review, CSV export).

## Repository hygiene

- `.env*` files are ignored except `.env.example`; service-account JSON patterns are ignored.
- Privileged writes (submission, consent, claims) only run in `/api/*` with the Admin SDK; Firestore rules deny them to clients.
