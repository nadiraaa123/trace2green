# Trace2Green — Architecture & Implementation Plan

Status: Phases 1–3 (Foundation, Supplier Portal, Data Processing) implemented and tested against the Firebase Emulator Suite.
No real Firebase project is connected yet (see "Credentials needed").

---

## 1. Proposed architecture

```
 Supplier (phone)                 Company admin (laptop)
 Next.js client pages             Next.js client pages
   │  Firebase Auth (email/pw)      │  Firebase Auth (provisioned accounts)
   │  Firestore listeners (read)    │  Firestore listeners (read, real-time)
   │  Draft writes (rules-guarded)  │
   ▼                                ▼
 ┌──────────────────── Cloud Firestore (source of truth) ────────────────────┐
 │ Security rules enforce role + companyId + supplierId via custom claims    │
 └───────────────────────────────────▲───────────────────────────────────────┘
                                     │ firebase-admin (bypasses rules,
                                     │ so every route re-checks auth)
                      Next.js Route Handlers on Vercel (/api/*)
                      - register supplier, claim profile (invite code)
                      - submit report  → emissions + score + sharedWith
                      - verify report  → verification record + rescore
                      - Sheets sync    → Google Sheets API (service account)
                                     │
                                     ▼
                      Google Sheets (analytics copy) → Looker Studio (historical)
```

Why route handlers instead of Cloud Functions: Cloud Functions require the Blaze
plan. Vercel route handlers running `firebase-admin` cost nothing and keep
privileged logic (scoring, status changes, sharing) off the client.

Rule of thumb:
- **Reads** go straight from client to Firestore (real-time), restricted by rules.
- **Privileged writes** (submission, verification, scoring, sharing, claims, roles)
  only go through `/api/*` with a verified ID token.
- **Supplier drafts** are the only direct client writes to report data, and rules
  pin them to the supplier's own ID, `status == "draft"` and an allow-list of fields.

Roles live in **custom claims** (`role`, `companyId`, `supplierId`) set by the
server, so rules can check them without extra reads. Claims are mirrored in
`users/{uid}` for display only; rules never trust the `users` doc for authorization.

## 2. Database schema (Firestore)

Every business document carries `dataSource: "demo" | "trial" | "production"`,
`createdAt`, `updatedAt`. Seeded workbook rows are `dataSource: "demo"`,
`isSimulated: true`.

| Collection | Doc ID | Key fields | Who writes |
|---|---|---|---|
| `users` | uid | role, companyId?, supplierId?, displayName, email | server |
| `companies` | companyId (`CMP-A`) | name, plan | server/seed |
| `suppliers` | supplierId (`SUP-001`) | businessName, picName, sector, region, whatsapp, ownerUid (null until claimed), claimStatus | server; owner may edit profile fields only |
| `company_supplier_relationships` | `{companyId}_{supplierId}` | companyId, supplierId, isCritical, status | server/seed |
| `supplier_data_sharing_consents` | `{companyId}_{supplierId}` | granted, grantedAt, grantedByUid, method (`seed_simulated` / `supplier_in_app`) | server |
| `supplier_invites` | sha256(code) | supplierId, companyId, expiresAt, usedByUid | server |
| `monthly_reports` | `{supplierId}_{YYYY-MM}` | supplierId, period, status, profile{}, activity{} (nullable values + `notApplicable[]`, `fuelQuantity`+`fuelUnit`), sharedWith[], version, submittedAt, missingFields[] | owner (draft/revision only) + server |
| `monthly_reports/{id}/versions` | `v{n}` | immutable snapshot of each submission | server |
| `activity_records` | `{reportId}_{category}` | category, quantity, unit, missing flag, sharedWith[] | server |
| `emission_factors` | `{category}_{validFrom}` | category, unit, kgCO2ePerUnit, status (`simulated`/`verified`), source, validFrom, validTo | server/seed |
| `benchmarks` | sector slug | avgIntensity, basis (`simulated_sample_average`), status | seed |
| `emission_results` | reportId | lines[{category, qty, unit, factorId, kgCO2e}], totalKgCO2e, missing[], calcSource, sharedWith[] | server/seed |
| `supplier_scores` | reportId | completeness, evidence, intensity, final, color, scoreType (`simulated`/`provisional`/`verified`), benchmarkSnapshot, sharedWith[] | server/seed |
| `evidence_metadata` | auto | reportId, supplierId, kind, fileName, sizeBytes, storageMode, declaredKwh | owner create + server |
| `verification_records` | auto | reportId, action, reviewerUid, note, auditedKwh, sharedWith[] — append-only | server/seed |
| `recommendations` | reportId | items[{code, text, severity}] (rule-based) | server/seed |
| `notifications` | auto | recipientUid, title, body, read | server; recipient may mark read |
| `audit_logs` | auto | actorUid, action, target, before/after summary — append-only, admin read | server |
| `meta` | `counters` | nextSupplierNumber | server (transaction) |
| `sync_logs` | auto | Sheets sync runs, failures | server |

Integrity guarantees:
- **One report per supplier per month** by construction: doc ID `{supplierId}_{period}`.
  Server `create()` fails if it exists, so duplicates are impossible, not just filtered.
- **Supplier identity**: new IDs come from a transactional counter (`SUP-101`, …).
  Registration is idempotent per uid: calling it twice returns the same supplier.
- **History**: each submission writes `versions/v{n}`; verification is append-only.
- **Company isolation**: report-family docs carry `sharedWith: [companyId]`, written
  only by the server from consent docs. Rules require
  `request.auth.token.companyId in resource.data.sharedWith`, and client queries
  must filter `array-contains` on it (Firestore rules are not filters).

## 3. Workbook import mapping (verified against the file)

Verified totals: **100 suppliers, 2 buyers (50/50), 277 report rows
(Jan 90, Feb 94, Mar 93), 12 audit rows, 7 emission factors, 5 sectors × 20.**

| Sheet / column | Firestore target |
|---|---|
| Daftar pemasok: ID Pemasok | `suppliers/{id}` doc ID (kept as-is) |
| Nama Pemasok, Jenis Usaha, Wilayah | businessName, sector, region |
| Perusahaan Pembeli | `companies` (`Perusahaan Mitra A` → `CMP-A`, `B` → `CMP-B`) + relationship + simulated consent |
| Pemasok Kritis (Ya/Tidak) | relationship.isCritical |
| Isian pemasok: ID + Bulan | `monthly_reports/{id}_{YYYY-MM}` |
| Q1 Jenis usaha | profile.sector |
| Q2 Jumlah karyawan | profile.employees |
| Q3 Listrik (kWh) | activity.electricityKwh |
| Bukti: kWh pada foto tagihan | evidence: `evidence_metadata` (storageMode `workbook_value`, declaredKwh) |
| Q4 BBM (liter/bulan) | activity.fuelLiters (fuel type not in workbook → null) |
| Q5 Volume produksi (unit/bulan) | profile.productionVolume, unit "unit" |
| Q6 Berat kemasan (kg) | activity.packagingKg |
| Q7 Limbah (kg) | activity.wasteKg |
| Q8 Asal bahan baku | activity.rawMaterialOrigin |
| Q9 Moda + Jarak (km) | activity.transportMode, activity.transportKm |
| Q10 Upaya hemat energi | activity.efficiencyPractice |
| Faktor emisi rows 4–10 | `emission_factors` status `simulated`, note copied verbatim |
| Faktor emisi parameters | `meta/scoring_params` (weights .3/.3/.4, tolerance .10, min completeness .60, ratio ≤1.00 green, >1.15 red) |
| Hasil skor H–M | `emission_results` (calcSource `workbook_simulated`) |
| Hasil skor N–P | intensity, group average, ratio → `supplier_scores` |
| Hasil skor Q–V | evidence status, component scores, final, color (`scoreType: simulated`) |
| Hasil skor X, Y | priority flag, recommendation text → `recommendations` |
| Hasil audit | `verification_records` (action `sample_audit`, auditedKwh, result, note) |
| Rekap | not imported (derived; used only as a checksum test of the import) |

Blank cells stay `null`. Nothing is back-filled.

### Import as implemented (Phase 3)
`npm run seed` (`scripts/seed.ts` → `src/server/seed.ts`, parser `src/server/workbook.ts`).
The workbook is versioned at `data/Dummy Data Analisis.xlsx` (fictional data); its
SHA-256 is recorded in `meta/seed_import`.

| Result | Value |
|---|---|
| Documents planned / written on first run | 2,820 / 2,820 |
| Written on second run | 0 (all skipped by `_seedHash`) |
| suppliers · relationships · consents | 100 · 100 · 100 |
| monthly_reports · activity_records | 277 · 1,385 |
| emission_results · supplier_scores · recommendations | 277 each (`calcSource: workbook_simulated`) |
| verification_records (sample audits) | 12 |
| emission_factors · benchmarks · companies | 7 · 5 · 2 |

Rules:
1. Everything is `dataSource: "demo"`, `isSimulated: true`. Column headers are
   matched by name; a missing column aborts the import.
2. Seeded reports get `status: "imported_simulated"` ("Data Simulasi"), outside
   the verification workflow. The workbook evidence result is stored separately in
   `workbook.evidenceStatus` (`Cocok` 210 / `Belum ada bukti` 56 / `Tidak cocok` 11).
   No seeded report is ever `verified`, and reviewers cannot act on it.
3. Audit rows are `verification_records` with `action: "sample_audit"`,
   `simulatedEvent: true`, `toStatus: null` (no status change).
4. Workbook emissions and scores are kept unchanged. Blank cells that the workbook
   multiplied as 0 are listed in `emission_results.workbookBlankAsZero` (27 cells).
5. The per-sector "Rata-rata Kelompok" values are stored as benchmarks with
   `status: "simulated_sample_average"`, `usableForLiveScoring: false`.
6. Never overwrites live data: a non-demo document at a seeded ID is kept and
   reported as a conflict; claimed suppliers keep owner/contact/profile edits;
   consents changed in-app are kept, and seeded `sharedWith` follows current consent.
7. The supplier counter is raised to at least `SUP-101`.
8. Q4 BBM (liter) → `fuelQuantity` + `fuelUnit: "liter"`, `fuelType: null`
   (not recorded). Q5 unit → `"unit"` (from the column header).

## 4. Screen / page map

Supplier (mobile-first) — `/s/...`
- `/masuk`, `/daftar`, `/lupa-sandi` (shared auth)
- `/s` home: hero, 4 status cards, feature grid
- `/s/laporan/baru` 4-step wizard (draft autosave), `/s/laporan/[period]` detail + status timeline
- `/s/riwayat`, `/s/hasil`, `/s/rekomendasi`, `/s/profil`, `/s/hubungkan` (claim with invite code + consent), `/s/bantuan`

Company (desktop-first) — `/c/...`
- `/c` Overview (6 KPIs, trend, score donut, emissions by category, verification status, recent activity, alerts)
- `/c/pemasok`, `/c/pemasok/[id]`
- `/c/pengumpulan` Data Collection, `/c/verifikasi` + `/c/verifikasi/[reportId]` (built in Phase 3 with interim navigation)
- `/c/emisi-skor`, `/c/laporan` (CSV + print view), `/c/insight`, `/c/pengaturan` (invites, Sheets resync)

Platform admin — `/admin` (provisioning status, seed status, sync logs)

## 5. Firebase free-tier (Spark) limitations

| Limit | Impact | Mitigation |
|---|---|---|
| No Cloud Functions | No triggers | Privileged logic in Vercel route handlers |
| Cloud Storage needs Blaze for new default buckets (since Oct 2024) | No file upload | See decision below |
| 50k reads / 20k writes / day | A dashboard opening listeners over ~400 docs costs ~400 reads per load → ~100 loads/day before throttling | Listen only to the selected period; aggregate KPI doc per company/period maintained server-side; avoid hot-reload loops against prod |
| Seed = ~2,000 writes | Fine once; re-seeding daily is not | Seed is idempotent and skips unchanged docs |
| 1 MiB per document | Constrains inline evidence | Compress images client-side to ≤ 500 KB |
| Rules can't join | Isolation needs denormalized `sharedWith` | Server maintains it on consent change |

**Evidence storage (decided):** Firestore holds metadata only
(`evidence_metadata`). File bytes go through the `EvidenceStorage` interface in
`src/lib/evidence/storage.ts`. The only implementation today is
`DemoPreviewStorage`: the file is previewed in the browser and never uploaded.
Rules allow clients to write `storageMode: "demo_preview"` only; the UI labels
every item "Pratinjau demo · tidak tersimpan". A future private bucket would add
an implementation returning `storageMode: "object_storage"` via a server-issued
signed upload, without changing the wizard.

## 6. Step-by-step plan

| Phase | Deliverable | Test gate |
|---|---|---|
| 1 Foundation ✅ | Project, design tokens, Firebase client/admin, schema types, rules, indexes, supplier registration (idempotent), company provisioning script, claim-by-invite, login + role routing | Rules unit tests + registration/claim integration tests on emulator |
| 2 Supplier portal ✅ | Home, profile, 4-step wizard, autosave drafts, submit/correction routes, history, consent + connect code | 76 unit/rules/server tests + 26-step browser e2e + DB assertions |
| 3 Data processing ✅ | Idempotent seed, emission engine, scoring engine, verification workflow, reviewer queue/review pages | Seed run twice (0 writes), Rekap checksums, row-by-row workbook reproduction, role tests, Phase 3 browser e2e |
| 4 Company dashboard | All 8 menus on real listeners, CSV export | Real-time test: submit on one browser, appears in another |
| 5 Analytics | Sheets upsert sync + logs + manual resync, Looker docs | Needs Google credentials |
| 6 QA | Tests A–F, responsive, security, deploy to Vercel | Full suite green |

## 7. Emissions, verification and scoring (Phase 3)

**Engine** (`src/lib/emissions.ts`): `kg CO2e = activity quantity × factor`, per
category. Line statuses: `calculated`, `not_used` (supplier ticked "Tidak memakai"
→ genuine 0), `missing_activity` (blank → no value), `missing_factor`,
`unit_unknown`. Factors apply only on an exact unit match (kWh / liter / kg / km).
The workbook BBM factor ("setara bensin", per liter) covers Bensin and rows with
no recorded fuel type, not Solar, LPG (kg) or Lainnya. Total = `complete`,
`partial` or `unavailable`; intensity only for complete totals with volume > 0.
Each line stores quantity, unit, factor ID, value, status (`simulated`), source,
and year (`null`: the workbook gives none, so none is invented).

Consistency check (tests/engine.test.ts): for all 277 rows, every reported
category reproduces the workbook value; the only differences are the 27 blank
cells. Completeness and "Status Bukti" are reproduced for every row, and the
12 audit results too.

**Verification** (`src/server/verification.ts`, `POST /api/reports/review`):
- Who: `company_admin` with custom claim `canVerify: true` whose company is in
  the report's `sharedWith`, or `platform_admin`. Provisioning grants
  `canVerify` by default; `--no-verify` creates view-only admins.
- What: only `submitted`, non-simulated reports. Actions: approve → `verified`,
  request_revision → `revision_requested`, reject → `rejected`. Reasons are
  required for reject/revision.
- Evidence: an optional checked kWh must name its source (original document,
  copy received outside the app, field visit). In-app metadata is never a source;
  every record stores `inAppDocumentInspected: false`. Without a checked value the
  outcome is "Bukti Belum Dapat Diverifikasi".
- History: append-only `verification_records`, report `versions/v{n}`, and
  immutable `supplier_scores/{id}/versions` for every calculation (submission,
  resubmission, each review).
- Multi-buyer note: one decision applies to the report for every company it is
  shared with, and is attributed to the reviewer's company.

**Scoring** (`src/lib/scoring.ts`): weights 30/30/40 and thresholds read from
the workbook (`meta/scoring_params`).

| Component | Live rule | Workbook rule (kept for simulated rows) |
|---|---|---|
| Completeness | 10 questions; "tidak memakai" = answered | same |
| Evidence | match ≤ 10% → 100, mismatch → 0, **no check → unavailable** | no bill → 0 |
| Intensity | needs an `industry_verified` benchmark; **none exists → unavailable** | vs simulated group average; blank → 0 |
| Final | **only if all three are available** | always |
| Colour | MERAH on any red trigger (data < 60%, mismatch, ratio > 1.15); HIJAU/KUNING only with all components; else "Belum dapat ditentukan" | same thresholds |

Consequence: until a real industry benchmark is added to `benchmarks`, live
reports never get a final score. The UI shows each component's status, the
available weight, and the method (`MethodNote`). `scoreType` is `provisional`
before approval and `verified` after; a verified report can still lack a final
score.

**Reporting dates:** `NEXT_PUBLIC_REPORTING_REFERENCE_DATE` (build-time, unset
by default → real date). When set, a visible banner says so on supplier and
company pages. The system clock is never changed.

## Credentials needed (not available in this session)
- Firebase project (Spark): web config + a service account key for `firebase-admin`.
- Google service account with access to one target spreadsheet (Phase 5).
- Vercel project (Phase 6).
