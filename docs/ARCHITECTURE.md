# Trace2Green — Architecture & Implementation Plan

Status: Phases 1–2 (Foundation, Supplier Portal) implemented and tested against the Firebase Emulator Suite.
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

### Confirmed import decisions (applied in Phase 3)
1. All 100 suppliers, 277 report rows and 12 audit rows are imported unchanged as
   `dataSource: "demo"`, `isSimulated: true`.
2. The workbook's evidence result ("Cocok" / "Tidak cocok" / "Belum ada bukti")
   is stored in a separate `workbook.evidenceStatus` field. It is **not** a
   verification status. Seeded reports never get `status: "verified"`
   automatically; the audit rows become `verification_records` with
   `action: "sample_audit"` and `isSimulated: true`.
3. Workbook emissions/scores are kept as `calcSource: "workbook_simulated"` for
   reference. New reports use the corrected engine: missing stays missing,
   no invented factors or benchmarks; scores without a valid benchmark are
   `provisional` or not scored.
4. Workbook "Q4 BBM (liter/bulan)" maps to `fuelQuantity` + `fuelUnit: "liter"`,
   `fuelType: null` (the workbook does not record the fuel type).

Open question for Phase 3: which workflow status seeded rows get (proposal:
`submitted` with a dashboard filter so 277 demo rows don't flood the live
verification queue).

## 4. Screen / page map

Supplier (mobile-first) — `/s/...`
- `/masuk`, `/daftar`, `/lupa-sandi` (shared auth)
- `/s` home: hero, 4 status cards, feature grid
- `/s/laporan/baru` 4-step wizard (draft autosave), `/s/laporan/[period]` detail + status timeline
- `/s/riwayat`, `/s/hasil`, `/s/rekomendasi`, `/s/profil`, `/s/hubungkan` (claim with invite code + consent), `/s/bantuan`

Company (desktop-first) — `/c/...`
- `/c` Overview (6 KPIs, trend, score donut, emissions by category, verification status, recent activity, alerts)
- `/c/pemasok`, `/c/pemasok/[id]`
- `/c/pengumpulan` Data Collection, `/c/verifikasi` + `/c/verifikasi/[reportId]`
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
| 3 Data processing | Idempotent seed, emission engine, scoring engine, verification workflow | Seed checksum vs Rekap; engine unit tests reproduce workbook scores |
| 4 Company dashboard | All 8 menus on real listeners, CSV export | Real-time test: submit on one browser, appears in another |
| 5 Analytics | Sheets upsert sync + logs + manual resync, Looker docs | Needs Google credentials |
| 6 QA | Tests A–F, responsive, security, deploy to Vercel | Full suite green |

## Credentials needed (not available in this session)
- Firebase project (Spark): web config + a service account key for `firebase-admin`.
- Google service account with access to one target spreadsheet (Phase 5).
- Vercel project (Phase 6).
