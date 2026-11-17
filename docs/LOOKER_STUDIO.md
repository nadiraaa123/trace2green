# Looker Studio datasets (Google Sheets)

Firestore is the source of truth and the native company dashboard is real-time.
Google Sheets is an analytics copy for Looker Studio, synced **once a day**
(Vercel Cron) and on demand (**Pengaturan → Sinkronkan sekarang**). Looker Studio
caches Sheets data (default data freshness ≈ 15 minutes; set it under
*Resource → Manage added data sources → Data freshness*), so Looker reports can
lag behind the app. Use **Refresh data** in Looker after a manual sync.

## One spreadsheet per company
Each company gets its own spreadsheet, configured in `SHEETS_SPREADSHEET_IDS`.
It contains only what that company may see in the app: its related suppliers,
reports suppliers shared with it, **its own** verification decisions, and audits
shared with it. Do not combine companies in one spreadsheet. Share each
spreadsheet only with that company's people.

Each tab is fully rewritten on sync (no duplicates; rows of suppliers who stop
sharing disappear). Blank cells mean *not available* — never zero.

## Tabs and mapping to the original workbook

| Tab | Workbook equivalent | Key | Notes |
|---|---|---|---|
| `pemasok` | Daftar pemasok | `id_pemasok` | no contact data exported |
| `laporan_bulanan` | Isian pemasok | `id_laporan` | Q1–Q10 answers; "tidak memakai" = 0 and listed in `kategori_tidak_memakai`; `bukti_kwh_workbook` / `status_bukti_workbook` only for simulated rows |
| `hasil_emisi_skor` | Hasil skor | `id_laporan` | emissions per category, intensity, evidence, score; trial rows use this company's own review score |
| `verifikasi_perusahaan` | — (new) | `id_perusahaan`+`id_laporan` | this company's decisions only; checked kWh + source |
| `audit_sampel` | Hasil audit | `id_laporan` | simulated sample audits |
| `rekap_bulanan` | Rekap | `periode`+`sumber_data` | same KPI functions as the app; simulated and trial on separate rows |
| `faktor_emisi` | Faktor emisi | `id_faktor` | simulation factors, labeled `simulated` |

## Field types in Looker Studio
- `periode`, `periode_audit`: **Date** (values are `YYYY-MM-01`).
- `tanggal_keputusan`: **Date & Time** (ISO 8601).
- All `*_kwh`, `*_kg*`, `*_kgco2e*`, `skor_*`, `rasio_*`, counts: **Number**.
- `tingkat_pelaporan`, `kelengkapan_data`, `selisih_relatif`: **Percent** (stored as 0–1).
- Everything else: **Text**.

## Report setup (recommended)
1. Create a data source per tab (Google Sheets connector, "Use first row as headers").
2. Add a report-level filter control on `sumber_data` (demo / trial). Never average
   across both: use `rekap_bulanan` rows per source, or filter first.
3. Charts that mirror the app: `rekap_bulanan` → time series of `tingkat_pelaporan`
   by `sumber_data`; `hasil_emisi_skor` → pie of `status_skor`; bar of
   `emisi_*_kgco2e` (sum); table of `verifikasi_perusahaan`.
4. Add a text box: "Data simulasi (demo) bersifat fiktif. Estimasi emisi memakai
   faktor ilustrasi; bukan sertifikasi karbon atau laporan resmi PSPK."
