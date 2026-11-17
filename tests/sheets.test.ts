// Phase 5: Firestore → Google Sheets sync — accuracy, company isolation, idempotency,
// consent revocation, failure logging and authorization. Uses an in-memory Sheets client.
import { beforeAll, describe, expect, it } from "vitest";
import { kpisFor, type StatsRow } from "@/lib/kpi";
import { referenceDate } from "@/lib/period";
import { submitReport } from "@/server/reports";
import { seedWorkbook } from "@/server/seed";
import { connectWithInvite, setConsent } from "@/server/sharing";
import { runSheetsSync, spreadsheetMap, syncCompany, TABS, type Cell, type SheetsClient } from "@/server/sheets";
import { createInvite, registerSupplier } from "@/server/suppliers";
import { reviewReport } from "@/server/verification";
import { readWorkbook } from "@/server/workbook";
import { auth, companyCaller, db, resetEmulators, supplierCaller, writeDraft } from "./helpers";

class FakeSheets implements SheetsClient {
  data = new Map<string, Map<string, Cell[][]>>();
  writes = 0;
  failOn: string | null = null;
  async writeTab(spreadsheetId: string, tab: string, values: Cell[][]) {
    if (this.failOn === tab) throw new Error(`simulated Sheets failure on ${tab}`);
    this.writes++;
    if (!this.data.has(spreadsheetId)) this.data.set(spreadsheetId, new Map());
    this.data.get(spreadsheetId)!.set(tab, values.map((r) => [...r]));
  }
  table(id: string, tab: string) {
    const [header, ...rows] = this.data.get(id)?.get(tab) ?? [[]];
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]]))) as Record<string, Cell>[];
  }
}

const wb = readWorkbook();
const REF = referenceDate("2027-04-05");
const SHEET_A = "sheetA_0123456789abcdefghij";
const SHEET_B = "sheetB_0123456789abcdefghij";
const MAP = { "CMP-A": SHEET_A, "CMP-B": SHEET_B };
const aIds = new Set(wb.suppliers.filter((s) => s.buyer === "Perusahaan Mitra A").map((s) => s.supplierId));
const reviewerA = { uid: "revA", email: null, claims: { role: "company_admin", companyId: "CMP-A", canVerify: true } };
let fake: FakeSheets;
let trial: { s: ReturnType<typeof supplierCaller>; supplierId: string };

beforeAll(async () => {
  await resetEmulators();
  await seedWorkbook(db, wb);
  const u = await auth.createUser({ email: "rina@umkm.test", password: "rahasia123" });
  const { supplierId } = await registerSupplier(db, auth, { uid: u.uid, email: "rina@umkm.test", claims: {} }, { picName: "Rina", businessName: "Roti Rina", whatsapp: "081377788899", privacyConsent: true });
  const s = supplierCaller(u.uid, supplierId);
  const { code } = await createInvite(db, companyCaller("CMP-A"), null);
  await connectWithInvite(db, s, { inviteCode: code, shareData: true });
  await writeDraft(supplierId, "2027-03", {
    profile: { businessName: "Roti Rina", sector: "Roti & kue", mainProduct: "Roti", productionVolume: 2000, productionUnit: "pcs", employees: 3 },
    activity: { electricityKwh: 400, packagingKg: 20, wasteKg: null, rawMaterialOrigin: "Lokal", transportMode: "Motor", transportKm: 300, efficiencyPractice: "Sebagian", notApplicable: ["bbm"] },
  });
  await submitReport(db, s, "2027-03", REF);
  await reviewReport(db, reviewerA, { reportId: `${supplierId}_2027-03`, action: "approve", checkedKwh: 390, checkSource: "dokumen_asli" });
  trial = { s, supplierId };
  fake = new FakeSheets();
  await syncCompany(db, fake, "CMP-A", SHEET_A);
  await syncCompany(db, fake, "CMP-B", SHEET_B);
});

describe("company isolation", () => {
  it("each company's spreadsheet holds only its own suppliers, reports and reviews", () => {
    const aSup = fake.table(SHEET_A, "pemasok").map((r) => r.id_pemasok);
    const bSup = fake.table(SHEET_B, "pemasok").map((r) => r.id_pemasok);
    expect(aSup).toHaveLength(51);
    expect(aSup).toContain(trial.supplierId);
    expect(bSup).toHaveLength(50);
    expect(bSup.some((id) => aIds.has(String(id)) || id === trial.supplierId)).toBe(false);
    for (const tab of ["laporan_bulanan", "hasil_emisi_skor"]) {
      expect(fake.table(SHEET_B, tab).some((r) => aIds.has(String(r.id_pemasok)) || r.id_pemasok === trial.supplierId)).toBe(false);
      expect(fake.table(SHEET_A, tab).every((r) => aIds.has(String(r.id_pemasok)) || r.id_pemasok === trial.supplierId)).toBe(true);
    }
    expect(fake.table(SHEET_A, "verifikasi_perusahaan").map((r) => r.id_perusahaan)).toEqual(["CMP-A"]);
    expect(fake.table(SHEET_B, "verifikasi_perusahaan")).toHaveLength(0);
  });

  it("never exports personal contact data", () => {
    const header = (fake.data.get(SHEET_A)!.get("pemasok")![0] as string[]).join(" ");
    expect(header).not.toMatch(/whatsapp|email|pic|owner/i);
  });
});

describe("data accuracy", () => {
  it("simulated results equal the original workbook values", () => {
    const rows = fake.table(SHEET_A, "hasil_emisi_skor").filter((r) => r.sumber_data === "demo");
    const src = wb.scores.filter((s) => aIds.has(s.supplierId));
    expect(rows).toHaveLength(src.length);
    for (const s of src) {
      const r = rows.find((x) => x.id_laporan === `${s.supplierId}_${s.period}`)!;
      expect(r.skor_akhir).toBe(s.final);
      expect(r.status_skor).toBe(s.color);
      expect(r.total_emisi_kgco2e as number).toBeCloseTo(s.emis.total, 9);
      expect(r.status_verifikasi_perusahaan).toBe("tidak berlaku");
    }
  });

  it("monthly recap equals the dashboard KPIs and, for both companies together, the Rekap tab", async () => {
    for (const rk of wb.rekap) {
      const a = fake.table(SHEET_A, "rekap_bulanan").find((r) => r.periode === `${rk.period}-01` && r.sumber_data === "demo")!;
      const b = fake.table(SHEET_B, "rekap_bulanan").find((r) => r.periode === `${rk.period}-01` && r.sumber_data === "demo")!;
      expect((a.laporan_masuk as number) + (b.laporan_masuk as number)).toBe(rk.submitted);
      expect((a.hijau as number) + (b.hijau as number)).toBe(rk.hijau);
      expect((a.total_emisi_kgco2e as number) + (b.total_emisi_kgco2e as number)).toBeCloseTo(rk.totalEmission, 6);
      const stats = (await db.doc(`company_period_stats/CMP-A_${rk.period}`).get()).data()!.rows as StatsRow[];
      expect(a.rata_rata_skor_akhir).toBe(kpisFor(stats, "demo").avgScore);
    }
    const trialRecap = fake.table(SHEET_A, "rekap_bulanan").filter((r) => r.sumber_data === "trial");
    expect(trialRecap.find((r) => r.periode === "2027-03-01")).toMatchObject({ laporan_masuk: 1, terverifikasi_perusahaan: 1 });
  });

  it("labels every row demo or trial and keeps missing values blank, 'tidak memakai' as 0", () => {
    for (const tab of ["pemasok", "laporan_bulanan", "hasil_emisi_skor", "rekap_bulanan"]) {
      expect(fake.table(SHEET_A, tab).every((r) => r.sumber_data === "demo" || r.sumber_data === "trial")).toBe(true);
    }
    const lap = fake.table(SHEET_A, "laporan_bulanan");
    expect(lap.find((r) => r.id_laporan === "SUP-001_2027-01")).toMatchObject({ bbm_jumlah: null, sumber_data: "demo", status_bukti_workbook: "Belum ada bukti" });
    expect(lap.find((r) => r.id_laporan === `${trial.supplierId}_2027-03`)).toMatchObject({ bbm_jumlah: 0, limbah_kg: null, kategori_tidak_memakai: "bbm", sumber_data: "trial" });
    const v = fake.table(SHEET_A, "verifikasi_perusahaan")[0];
    expect(v).toMatchObject({ status_verifikasi: "verified", kwh_dilaporkan: 400, kwh_diperiksa: 390, hasil_bukti: "match" });
    expect(fake.table(SHEET_A, "audit_sampel").every((r) => r.sumber_data === "demo")).toBe(true);
    expect(fake.table(SHEET_A, "faktor_emisi").every((r) => r.status === "simulated")).toBe(true);
  });
});

describe("idempotency and duplicates", () => {
  it("keys are unique in every tab", () => {
    const keyOf: Record<string, (r: Record<string, Cell>) => string> = {
      pemasok: (r) => String(r.id_pemasok), laporan_bulanan: (r) => String(r.id_laporan), hasil_emisi_skor: (r) => String(r.id_laporan),
      verifikasi_perusahaan: (r) => `${r.id_perusahaan}_${r.id_laporan}`, audit_sampel: (r) => String(r.id_laporan),
      rekap_bulanan: (r) => `${r.periode}_${r.sumber_data}`, faktor_emisi: (r) => String(r.id_faktor),
    };
    for (const tab of TABS) {
      const keys = fake.table(SHEET_A, tab).map(keyOf[tab]);
      expect(new Set(keys).size, tab).toBe(keys.length);
    }
  });
  it("re-running writes nothing when data is unchanged; force rewrites without duplicating", async () => {
    const before = fake.writes;
    const again = await syncCompany(db, fake, "CMP-A", SHEET_A);
    expect(again).toMatchObject({ status: "ok", tabsWritten: [] });
    expect(fake.writes).toBe(before);
    const rows = fake.table(SHEET_A, "laporan_bulanan").length;
    const forced = await syncCompany(db, fake, "CMP-A", SHEET_A, { force: true });
    expect(forced.tabsWritten).toHaveLength(TABS.length);
    expect(fake.table(SHEET_A, "laporan_bulanan")).toHaveLength(rows);
  });
});

describe("consent revocation", () => {
  it("rows disappear from the company sheet once the supplier stops sharing", async () => {
    await setConsent(db, trial.s, { companyId: "CMP-A", granted: false });
    const r = await syncCompany(db, fake, "CMP-A", SHEET_A);
    expect(r.tabsWritten).toEqual(expect.arrayContaining(["laporan_bulanan", "verifikasi_perusahaan"]));
    expect(fake.table(SHEET_A, "laporan_bulanan").some((x) => x.id_pemasok === trial.supplierId)).toBe(false);
    expect(fake.table(SHEET_A, "hasil_emisi_skor").some((x) => x.id_pemasok === trial.supplierId)).toBe(false);
    expect(fake.table(SHEET_A, "verifikasi_perusahaan")).toHaveLength(0);
    expect(fake.table(SHEET_A, "pemasok").find((x) => x.id_pemasok === trial.supplierId)).toMatchObject({ izin_berbagi_data: "tidak" });
    await setConsent(db, trial.s, { companyId: "CMP-A", granted: true });
  });
});

describe("failures and authorization", () => {
  it("a Sheets failure is logged and leaves Firestore business data untouched", async () => {
    const reports = (await db.collection("monthly_reports").count().get()).data().count;
    const broken = new FakeSheets();
    broken.failOn = "laporan_bulanan";
    const r = await syncCompany(db, broken, "CMP-B", "sheetX_0123456789abcdefghij", { force: true });
    expect(r.status).toBe("error");
    expect(r.error).toContain("simulated Sheets failure");
    const state = (await db.doc("sheets_sync/CMP-B").get()).data()!;
    expect(state).toMatchObject({ lastStatus: "error" });
    const logs = await db.collection("sync_logs").where("companyId", "==", "CMP-B").where("status", "==", "error").get();
    expect(logs.size).toBe(1);
    expect((await db.collection("monthly_reports").count().get()).data().count).toBe(reports);
  });

  it("only admins sync, company admins only their own company, and missing config is explicit", async () => {
    const f = new FakeSheets();
    await expect(runSheetsSync(db, trial.s, {}, f, MAP)).rejects.toMatchObject({ code: "forbidden" });
    await expect(runSheetsSync(db, reviewerA, { companyId: "CMP-B" }, f, MAP)).rejects.toMatchObject({ code: "forbidden" });
    await expect(runSheetsSync(db, reviewerA, {}, null, MAP)).rejects.toMatchObject({ code: "sheets_not_configured" });
    await expect(runSheetsSync(db, reviewerA, {}, f, { "CMP-B": SHEET_B })).rejects.toMatchObject({ code: "sheets_not_configured" });
    const ok = await runSheetsSync(db, reviewerA, {}, f, MAP);
    expect(ok.results.map((x) => x.companyId)).toEqual(["CMP-A"]);
    expect([...f.data.keys()]).toEqual([SHEET_A]); // never touched company B's spreadsheet
    const platform = { uid: "p", email: null, claims: { role: "platform_admin" } };
    expect((await runSheetsSync(db, platform, {}, new FakeSheets(), MAP)).results.map((x) => x.companyId)).toEqual(["CMP-A", "CMP-B"]);
  });

  it("spreadsheet configuration rejects malformed entries", () => {
    expect(spreadsheetMap('{"CMP-A":"sheetA_0123456789abcdefghij","evil":"x","CMP-B":"short"}')).toEqual({ "CMP-A": SHEET_A });
    expect(spreadsheetMap("not json")).toEqual({});
    expect(spreadsheetMap(undefined)).toEqual({});
  });
});
