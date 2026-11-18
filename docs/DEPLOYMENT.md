# Deployment (Firebase Spark + Vercel Hobby + Google Sheets)

No paid service is required. Do not enable Firebase Blaze, Cloud Functions or
Cloud Storage. Never commit keys; set them only as environment variables.

## 1. Firebase (Spark)
1. Create a project in the Firebase console (Spark plan).
2. **Authentication → Sign-in method:** enable *Email/Password*.
   **Authentication → Settings → Authorized domains:** add your Vercel domain(s),
   e.g. `trace2green.vercel.app`.
3. **Firestore Database:** create it in production mode (region e.g. `asia-southeast2`).
4. **Project settings → General → Your apps → Web app:** copy `apiKey`, `authDomain`,
   `projectId`, `appId` → the `NEXT_PUBLIC_FIREBASE_*` variables.
5. **Project settings → Service accounts → Generate new private key.** Keep the JSON
   file outside the repo; encode it:
   ```bash
   base64 -w0 service-account.json
   ```
6. Deploy rules and indexes (Spark-compatible):
   ```bash
   cp .firebaserc.example .firebaserc   # set your project id
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```
7. **One command for steps 6–7 (recommended):** `bash scripts/setup-production.sh /path/to/service-account.json <project-id> <admin-email-A> <admin-email-B>`
   — checks the key belongs to `<project-id>`, asks before each write, dry-runs the
   import, generates admin passwords locally, then runs a read-only verification
   (`scripts/verify-production.ts`). Manual equivalent:
   ```bash
   export FIREBASE_SERVICE_ACCOUNT_KEY=$(base64 -w0 service-account.json)
   npm run seed -- --confirm-production
   npm run provision -- company CMP-A "Perusahaan Mitra A" admin-a@example.com '<password>' demo
   npm run provision -- company CMP-B "Perusahaan Mitra B" admin-b@example.com '<password>' demo
   ```

## 2. Vercel (Hobby)
Node.js version comes from `package.json` (`engines.node: 24.x`), which overrides
the project setting. Set **Settings → General → Node.js Version** to 24.x as well
to avoid the override warning.

**Settings → Environment Variables** (Production + Preview):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | from step 1.4 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | base64 from step 1.5 (server-only) |
| `NEXT_PUBLIC_REPORTING_REFERENCE_DATE` | `2027-04-05` for the competition demo only; leave unset for real dates |
| `DEMO_SIMULATED_BENCHMARK` | `true` only for the demo (labeled simulated benchmark) |
| `SHEETS_SPREADSHEET_IDS`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY` (optional), `CRON_SECRET` | see §3 |

Do **not** set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` or `*_EMULATOR_HOST` on Vercel.
`NEXT_PUBLIC_*` values are build-time: **redeploy after changing them.**

**Deployment protection:** the project currently has *Vercel Authentication*
enabled. If visitors (suppliers on phones, judges) are asked to log in to Vercel,
open **Settings → Deployment Protection** and disable Vercel Authentication for
production (or add a custom domain).

The cron in `vercel.json` (daily 01:17 UTC) is within Hobby limits.

## 3. Google Sheets
1. In Google Cloud (same project as Firebase is fine) enable the **Google Sheets API** (free).
2. Use the Firebase service account or create a dedicated one; note its
   `client_email`.
3. Create one spreadsheet per company and **share each with the service account
   email as Editor** (and with that company's own users only).
4. Set `SHEETS_SPREADSHEET_IDS={"CMP-A":"<id-from-sheet-url>","CMP-B":"<id>"}`;
   set `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY` only if you use a separate account.
5. Set `CRON_SECRET` to a long random string.
6. In the app: **Pengaturan → Sinkronkan sekarang**. Then build Looker Studio
   reports as described in `docs/LOOKER_STUDIO.md`.

## Free-tier notes
- Spark: 50k reads / 20k writes per day. Seeding writes ~2.8k docs once; each
  dashboard summary rebuild reads ~300 docs; a full Sheets sync reads ~700 docs
  per company.
- Sheets API free quota (300 requests/min per project) is far above one sync
  (~4 requests per changed tab).

## Runtime compatibility note
The Vercel function runtime does not allow `require()` of ES modules. firebase-admin
14 loads `jwks-rsa`, which `require()`s `jose`; jose 6 is ESM-only. `package.json`
therefore overrides **only** `jwks-rsa`'s jose to 5.10.0 (CommonJS build, same
`importJWK`/`exportSPKI` API). `tests/runtime-compat.test.ts` and the e2e servers run
with `--no-experimental-require-module` to catch regressions. Remove the override once
jwks-rsa ships an ESM-safe release.
