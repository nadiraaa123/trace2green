// Firestore → Google Sheets analytics sync (server-only).
//
// Design:
// - ONE spreadsheet PER COMPANY (SHEETS_SPREADSHEET_IDS). A company's sheet only ever
//   contains data that company may already read in Firestore: summaries of its related
//   suppliers, reports shared with it, its OWN reviews, audits shared with it.
// - Each tab is rewritten completely from Firestore on every sync (no row-level upsert),
//   so duplicates are impossible and rows a supplier stopped sharing disappear.
//   Unchanged tabs are skipped by content hash (idempotent, cheap re-runs).
// - Firestore stays the source of truth; Sheets/Looker Studio may lag.
// - Every run is logged in sync_logs; failures never touch Firestore business data.
import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { CATEGORIES, kpisFor, type StatsRow } from "@/lib/kpi";
import type { EmissionFactor } from "@/lib/emissions";
import type { ActivityData, MonthlyReportDoc } from "@/lib/types";
import { AppError } from "./suppliers";

export type Cell = string | number | null;
export interface Table { header: string[]; rows: Cell[][] }
export type Datasets = Record<TabName, Table>;

export const TABS = ["pemasok", "laporan_bulanan", "hasil_emisi_skor", "verifikasi_perusahaan", "audit_sampel", "rekap_bulanan", "faktor_emisi"] as const;
export type TabName = (typeof TABS)[number];

export interface SheetsClient {
  /** Replace the whole tab (creating it if needed) with header + rows. */
  writeTab(spreadsheetId: string, tab: string, values: Cell[][]): Promise<void>;
}

/** "2027-03" → "2027-03-01" (Looker Studio reads it as a Date). */
const periodDate = (p: string) => `${p}-01`;
const yn = (b: boolean) => (b ? "ya" : "tidak");
const src = (isSimulated: boolean | undefined) => (isSimulated ? "demo" : "trial");

/** Builds every tab for one company from data that company is authorized to see. */
export async function buildCompanyDatasets(db: Firestore, companyId: string): Promise<Datasets> {
  const [stats, reports, reviews, audits, factors] = await Promise.all([
    db.collection("company_period_stats").where("companyId", "==", companyId).get(),
    db.collection("monthly_reports").where("sharedWith", "array-contains", companyId).get(),
    db.collection("company_reviews").where("companyId", "==", companyId).where("sharedWith", "array-contains", companyId).get(),
    db.collection("verification_records").where("sharedWith", "array-contains", companyId).where("action", "==", "sample_audit").get(),
    db.collection("emission_factors").get(),
  ]);
  const periods = stats.docs.map((d) => d.data() as { period: string; rows: StatsRow[] }).sort((a, b) => a.period.localeCompare(b.period));
  const latestRow = new Map<string, StatsRow>();
  for (const p of periods) for (const r of p.rows) latestRow.set(r.supplierId, r);

  const pemasok: Table = {
    header: ["id_pemasok", "nama_pemasok", "sektor", "wilayah", "sumber_data", "pemasok_kritis", "izin_berbagi_data"],
    rows: [...latestRow.values()].sort((a, b) => a.supplierId.localeCompare(b.supplierId))
      .map((r) => [r.supplierId, r.name, r.sector, r.region, r.source, yn(r.critical), yn(r.consent)]),
  };

  const reportRows = reports.docs.map((d) => d.data() as MonthlyReportDoc).sort((a, b) => a.reportId.localeCompare(b.reportId));
  const na = (a: ActivityData, c: string) => (a.notApplicable ?? []).includes(c as never);
  const laporan: Table = {
    header: ["id_laporan", "id_pemasok", "periode", "sumber_data", "status_laporan", "versi", "jenis_usaha", "jumlah_karyawan",
      "listrik_kwh", "bbm_jumlah", "bbm_satuan", "bbm_jenis", "volume_produksi", "satuan_produksi", "kemasan_kg", "limbah_kg",
      "asal_bahan_baku", "moda_pengiriman", "jarak_pengiriman_km", "upaya_hemat_energi", "kategori_tidak_memakai", "bukti_kwh_workbook", "status_bukti_workbook"],
    rows: reportRows.map((r) => {
      const a = r.activity;
      const wb = (r as MonthlyReportDoc & { workbook?: { billKwh: number | null; evidenceStatus: string } }).workbook;
      // Blank = not answered. "Tidak memakai" categories are exported as 0 and listed explicitly.
      return [r.reportId, r.supplierId, periodDate(r.period), src(r.isSimulated), r.status, r.version, r.profile.sector, r.profile.employees,
        na(a, "listrik") ? 0 : a.electricityKwh, na(a, "bbm") ? 0 : a.fuelQuantity, a.fuelUnit, a.fuelType, r.profile.productionVolume, r.profile.productionUnit,
        na(a, "kemasan") ? 0 : a.packagingKg, na(a, "limbah") ? 0 : a.wasteKg, a.rawMaterialOrigin, a.transportMode,
        na(a, "transportasi") ? 0 : a.transportKm, a.efficiencyPractice, (a.notApplicable ?? []).join(" "), wb?.billKwh ?? null, wb?.evidenceStatus ?? null];
    }),
  };

  const received = (r: StatsRow) => ["submitted", "revision_requested", "imported_simulated"].includes(r.reportStatus);
  const hasil: Table = {
    header: ["id_laporan", "id_pemasok", "nama_pemasok", "sektor", "wilayah", "periode", "sumber_data", "status_laporan", "status_verifikasi_perusahaan",
      "kelengkapan_data", ...CATEGORIES.map((c) => `emisi_${c}_kgco2e`), "total_emisi_kgco2e", "status_total_emisi", "intensitas_kgco2e_per_unit",
      "rasio_intensitas", "basis_pembanding", "status_bukti", "skor_akhir", "status_skor", "basis_skor", "sel_kosong_dihitung_nol_workbook"],
    rows: periods.flatMap((p) => p.rows.filter((r) => r.consent && received(r)).map((r) => [
      `${r.supplierId}_${p.period}`, r.supplierId, r.name, r.sector, r.region, periodDate(p.period), r.source, r.reportStatus,
      r.source === "demo" ? "tidak berlaku" : r.reviewStatus, r.completeness, ...CATEGORIES.map((c) => r.byCategory?.[c] ?? null),
      r.totalKg, r.totalStatus, r.intensity, r.intensityRatio, r.benchmarkBasis, r.evidence, r.final, r.color ?? "belum dinilai", r.scoreBasis, r.blankAsZero.join(" "),
    ])).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };

  const verif: Table = {
    header: ["id_perusahaan", "id_laporan", "id_pemasok", "periode", "versi_laporan", "status_verifikasi", "kwh_dilaporkan", "kwh_diperiksa",
      "sumber_pemeriksaan", "hasil_bukti", "selisih_relatif", "skor_perusahaan", "status_skor_perusahaan", "tanggal_keputusan", "catatan"],
    rows: reviews.docs.map((d) => d.data()).sort((a, b) => String(a.reportId).localeCompare(String(b.reportId))).map((v) => [
      v.companyId, v.reportId, v.supplierId, periodDate(v.period), v.reportVersion, v.status, v.evidence?.reportedKwh ?? null, v.evidence?.checkedKwh ?? null,
      v.evidence?.checkSourceLabel ?? null, v.evidence?.outcome?.status ?? null, v.evidence?.outcome?.diffRatio ?? null, v.score?.final ?? null,
      v.score?.color ?? null, v.decidedAt?.toDate ? v.decidedAt.toDate().toISOString() : null, v.note ?? null,
    ]),
  };

  const audit: Table = {
    header: ["id_laporan", "id_pemasok", "periode_audit", "sumber_data", "kwh_dilaporkan", "kwh_hasil_audit", "selisih", "hasil", "catatan_auditor"],
    rows: audits.docs.map((d) => d.data()).sort((a, b) => String(a.reportId).localeCompare(String(b.reportId))).map((a) => [
      a.reportId, a.supplierId, periodDate(String(a.reportId).split("_")[1]), src(a.isSimulated), a.audit?.reportedKwh ?? null, a.audit?.auditedKwh ?? null,
      a.audit?.diff ?? null, a.audit?.result ?? null, a.note ?? null,
    ]),
  };

  // Same KPI functions as the dashboard; one row per period and source (never blended).
  const rekap: Table = {
    header: ["periode", "sumber_data", "pemasok_terhubung", "pemasok_izin_data", "laporan_masuk", "tingkat_pelaporan", "hijau", "kuning", "merah",
      "belum_dinilai", "rata_rata_skor_akhir", "n_skor", "total_emisi_kgco2e", "bukti_cocok", "bukti_tidak_cocok", "bukti_belum_terverifikasi", "terverifikasi_perusahaan"],
    rows: periods.flatMap((p) => (["demo", "trial"] as const).map((s) => {
      const k = kpisFor(p.rows, s);
      return [periodDate(p.period), s, k.related, k.consented, k.received, k.completionRate, k.colors.HIJAU, k.colors.KUNING, k.colors.MERAH, k.colors.none,
        k.avgScore, k.scored, k.received ? k.emissions.totalKg : null, k.evidence.match, k.evidence.mismatch, k.evidence.unverifiable,
        s === "demo" ? null : k.review.verified];
    }).filter((row) => (row[2] as number) > 0)),
  };

  const faktor: Table = {
    header: ["id_faktor", "kategori", "satuan_aktivitas", "kgco2e_per_satuan", "berlaku_untuk", "status", "sumber", "catatan", "tahun_faktor"],
    rows: factors.docs.map((d) => d.data() as EmissionFactor).sort((a, b) => a.factorId.localeCompare(b.factorId)).map((f) => [
      f.factorId, f.category, f.activityUnit, f.kgCO2ePerUnit, f.appliesToTransportMode ?? (f.appliesToFuelTypes ?? []).join(" "), f.status, f.source, f.sourceNote, f.factorYear,
    ]),
  };

  return { pemasok, laporan_bulanan: laporan, hasil_emisi_skor: hasil, verifikasi_perusahaan: verif, audit_sampel: audit, rekap_bulanan: rekap, faktor_emisi: faktor };
}

const hash = (t: Table) => createHash("sha256").update(JSON.stringify(t)).digest("hex").slice(0, 32);

export interface SyncResult { companyId: string; status: "ok" | "error"; tabsWritten: string[]; tabsUnchanged: string[]; rows: Record<string, number>; error?: string }

/** Syncs one company. Unchanged tabs are not rewritten unless force=true. Always logs. */
export async function syncCompany(db: Firestore, client: SheetsClient, companyId: string, spreadsheetId: string, opts: { force?: boolean; trigger?: string; actorUid?: string | null } = {}): Promise<SyncResult> {
  const stateRef = db.doc(`sheets_sync/${companyId}`);
  const result: SyncResult = { companyId, status: "ok", tabsWritten: [], tabsUnchanged: [], rows: {} };
  try {
    const data = await buildCompanyDatasets(db, companyId);
    const prev = ((await stateRef.get()).data()?.tabHashes ?? {}) as Record<string, string>;
    const hashes: Record<string, string> = {};
    for (const tab of TABS) {
      const t = data[tab];
      hashes[tab] = hash(t);
      result.rows[tab] = t.rows.length;
      if (!opts.force && prev[tab] === hashes[tab]) { result.tabsUnchanged.push(tab); continue; }
      await client.writeTab(spreadsheetId, tab, [t.header, ...t.rows]);
      result.tabsWritten.push(tab);
      // Record progress per tab so a partial failure resumes correctly next time.
      prev[tab] = hashes[tab];
      await stateRef.set({ companyId, tabHashes: prev }, { merge: true });
    }
    await stateRef.set({ companyId, tabHashes: hashes, rows: result.rows, lastStatus: "ok", lastError: null, lastSyncAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (e) {
    result.status = "error";
    result.error = e instanceof Error ? e.message.slice(0, 500) : String(e);
    await stateRef.set({ companyId, lastStatus: "error", lastError: result.error, lastAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await db.collection("sync_logs").add({
    target: "google_sheets", companyId, status: result.status, tabsWritten: result.tabsWritten, tabsUnchanged: result.tabsUnchanged,
    rows: result.rows, error: result.error ?? null, trigger: opts.trigger ?? "manual", actorUid: opts.actorUid ?? null, createdAt: FieldValue.serverTimestamp(),
  });
  return result;
}

// ---------- configuration & real client ----------

/** companyId → spreadsheetId from SHEETS_SPREADSHEET_IDS (JSON). Empty when not configured. */
export function spreadsheetMap(env = process.env.SHEETS_SPREADSHEET_IDS): Record<string, string> {
  if (!env) return {};
  try {
    const m = JSON.parse(env) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(m).filter(([k, v]) => /^CMP-[A-Z0-9]+$/.test(k) && typeof v === "string" && /^[A-Za-z0-9_-]{20,}$/.test(v as string)) as [string, string][]);
  } catch {
    return {};
  }
}

/** Google Sheets REST client using a service account (JWT). Credentials never leave the server. */
export class GoogleSheetsClient implements SheetsClient {
  private token: { value: string; exp: number } | null = null;
  constructor(private readonly credentials: { client_email: string; private_key: string }) {}

  private async accessToken() {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const { JWT } = await import("google-auth-library");
    const jwt = new JWT({ email: this.credentials.client_email, key: this.credentials.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const t = await jwt.authorize();
    if (!t.access_token) throw new Error("Tidak mendapat token Google");
    this.token = { value: t.access_token, exp: t.expiry_date ?? Date.now() + 3_000_000 };
    return this.token.value;
  }

  private async call(path: string, init: RequestInit = {}) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
      ...init, headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  async writeTab(spreadsheetId: string, tab: string, values: Cell[][]) {
    const meta = await this.call(`${spreadsheetId}?fields=sheets.properties.title`);
    const exists = (meta.sheets ?? []).some((s: { properties: { title: string } }) => s.properties.title === tab);
    if (!exists) await this.call(`${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
    await this.call(`${spreadsheetId}/values/${encodeURIComponent(tab)}:clear`, { method: "POST", body: "{}" });
    await this.call(`${spreadsheetId}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ values: values.map((r) => r.map((c) => (c == null ? "" : c))) }),
    });
  }
}

/** The configured client, or null when Sheets is not set up (sync then reports "not configured"). */
export function sheetsClientFromEnv(): SheetsClient | null {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  return new GoogleSheetsClient({ client_email: json.client_email, private_key: json.private_key });
}

// ---------- authorization ----------

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }

/**
 * Manual resync. Company admins may only sync their own company; platform admins any
 * configured company (or all). Spreadsheet IDs come from server config, never the client.
 */
export async function runSheetsSync(db: Firestore, caller: Caller, input: { companyId?: string; force?: boolean }, client = sheetsClientFromEnv(), map = spreadsheetMap()) {
  const role = caller.claims.role;
  let targets: string[];
  if (role === "company_admin" && typeof caller.claims.companyId === "string") {
    if (input.companyId && input.companyId !== caller.claims.companyId) throw new AppError("forbidden", "Tidak dapat menyinkronkan data perusahaan lain.", 403);
    targets = [caller.claims.companyId];
  } else if (role === "platform_admin") {
    targets = input.companyId ? [input.companyId] : Object.keys(map);
  } else {
    throw new AppError("forbidden", "Hanya admin yang dapat menyinkronkan Google Sheets.", 403);
  }
  if (!client) throw new AppError("sheets_not_configured", "Google Sheets belum dikonfigurasi di server.", 503);
  const missing = targets.filter((t) => !map[t]);
  if (missing.length) throw new AppError("sheets_not_configured", `Spreadsheet untuk ${missing.join(", ")} belum diatur.`, 503);
  const results: SyncResult[] = [];
  for (const cid of targets) results.push(await syncCompany(db, client, cid, map[cid], { force: input.force, trigger: "manual", actorUid: caller.uid }));
  return { results };
}

/** Scheduled sync of every configured company (Vercel Cron). */
export async function runScheduledSync(db: Firestore, client = sheetsClientFromEnv(), map = spreadsheetMap()) {
  if (!client) return { skipped: "not_configured" as const, results: [] as SyncResult[] };
  const results: SyncResult[] = [];
  for (const [cid, sheet] of Object.entries(map)) results.push(await syncCompany(db, client, cid, sheet, { trigger: "cron" }));
  return { results };
}
