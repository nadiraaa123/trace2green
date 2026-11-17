// Builds company_period_stats/{companyId}_{period}: one row per related supplier.
// The dashboard listens to these few summary docs instead of hundreds of raw docs.
// Recomputed by the server after every event that can change them (submission,
// correction, review, consent/connect, draft create/delete, seed). Unchanged
// summaries are not rewritten.
import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { EvidenceState, RowReportStatus, StatsRow } from "@/lib/kpi";
import { CATEGORIES } from "@/lib/kpi";
import { defaultPeriod } from "@/lib/period";
import type { ActivityCategory } from "@/lib/types";

const WORKBOOK_EVIDENCE: Record<string, EvidenceState> = { Cocok: "match", "Tidak cocok": "mismatch", "Belum ada bukti": "unverifiable" };

export async function buildCompanyPeriodRows(db: Firestore, companyId: string, period: string): Promise<StatsRow[]> {
  const [rels, consents, reports, drafts, scores, emissions, reviews] = await Promise.all([
    db.collection("company_supplier_relationships").where("companyId", "==", companyId).get(),
    db.collection("supplier_data_sharing_consents").where("companyId", "==", companyId).get(),
    db.collection("monthly_reports").where("sharedWith", "array-contains", companyId).where("period", "==", period).get(),
    db.collection("monthly_reports").where("period", "==", period).where("status", "==", "draft").get(),
    db.collection("supplier_scores").where("sharedWith", "array-contains", companyId).where("period", "==", period).get(),
    db.collection("emission_results").where("sharedWith", "array-contains", companyId).where("period", "==", period).get(),
    db.collection("company_reviews").where("companyId", "==", companyId).where("period", "==", period).get(),
  ]);
  const relDocs = rels.docs.map((d) => d.data()).filter((r) => r.status !== "ended");
  if (!relDocs.length) return [];
  const supplierSnaps = await db.getAll(...relDocs.map((r) => db.doc(`suppliers/${r.supplierId}`)));
  const supplierById = new Map(supplierSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));
  const consent = new Map(consents.docs.map((d) => [d.data().supplierId as string, d.data().granted === true]));
  const reportBy = new Map(reports.docs.map((d) => [d.data().supplierId as string, d.data()]));
  const draftSet = new Set(drafts.docs.map((d) => d.data().supplierId as string));
  const scoreBy = new Map(scores.docs.map((d) => [d.id, d.data()]));
  const emissionBy = new Map(emissions.docs.map((d) => [d.id, d.data()]));
  const reviewBy = new Map(reviews.docs.map((d) => [d.data().reportId as string, d.data()]));

  return relDocs.map((rel): StatsRow => {
    const sid = rel.supplierId as string;
    const s = supplierById.get(sid) ?? {};
    const source = (s.dataSource === "demo" ? "demo" : "trial") as StatsRow["source"];
    const base: StatsRow = {
      supplierId: sid, name: s.businessName ?? sid, sector: s.sector ?? null, region: s.region ?? null, source,
      critical: rel.isCritical === true, consent: consent.get(sid) === true, reportStatus: "missing", reportVersion: null,
      reviewStatus: null, evidenceCount: null, final: null, color: null, scoreBasis: null, benchmarkBasis: null,
      completeness: null, evidence: null, intensity: null, intensityRatio: null, totalKg: null, totalStatus: null,
      byCategory: null, blankAsZero: [], kwh: null,
    };
    if (!base.consent) return { ...base, reportStatus: "no_consent" };
    const r = reportBy.get(sid);
    if (!r) return { ...base, reportStatus: (draftSet.has(sid) ? "draft" : "missing") as RowReportStatus };
    const rid = r.reportId as string;
    const sc = scoreBy.get(rid);
    const em = emissionBy.get(rid);
    const row: StatsRow = {
      ...base, sector: base.sector ?? r.profile?.sector ?? null, // a new supplier may set its sector only on the report
      reportStatus: r.status as RowReportStatus, reportVersion: r.version ?? null,
      evidenceCount: r.evidenceCount ?? (source === "trial" ? 0 : null), kwh: r.activity?.electricityKwh ?? null,
    };
    if (source === "demo") {
      // Original workbook results, unchanged.
      row.final = sc?.final ?? null;
      row.color = sc?.color ?? null;
      row.scoreBasis = "workbook_simulated";
      row.benchmarkBasis = "simulated_sample_average";
      row.completeness = sc ? (sc.components?.[0]?.score ?? null) / 100 : null;
      row.evidence = WORKBOOK_EVIDENCE[r.workbook?.evidenceStatus] ?? null;
      row.intensityRatio = sc?.intensityRatio ?? null;
      row.intensity = em?.intensity ?? null;
      row.totalKg = em?.totalKgCO2e ?? null;
      row.totalStatus = em ? "workbook" : null;
      row.byCategory = em ? (Object.fromEntries(CATEGORIES.map((c) => [c, em.byCategory?.[c] ?? null])) as Record<ActivityCategory, number | null>) : null;
      row.blankAsZero = em?.workbookBlankAsZero ?? [];
      return row;
    }
    // Trial: this company's review score if it decided on the current version, else the provisional base score.
    const rv = reviewBy.get(rid);
    const current = rv && rv.reportVersion === r.version;
    row.reviewStatus = current ? rv.status : r.status === "submitted" ? "pending" : null;
    const score = current && rv.score ? rv.score : sc;
    row.scoreBasis = current && rv.score ? "engine_company_review" : sc ? "engine_provisional" : null;
    if (score) {
      row.final = score.final ?? null;
      row.color = score.color ?? null;
      row.benchmarkBasis = score.benchmarkBasis ?? null;
      const comp = (score.components ?? []).find((c: { key: string }) => c.key === "completeness");
      row.completeness = comp?.score != null ? comp.score / 100 : null;
      const ev = score.evidence?.status as string | undefined;
      row.evidence = ev === "match" || ev === "mismatch" ? ev : ev ? "unverifiable" : null;
      row.intensityRatio = score.intensityRatio ?? null;
    }
    if (em) {
      row.totalKg = em.totalKgCO2e ?? null;
      row.totalStatus = em.totalStatus ?? null;
      row.intensity = em.intensity ?? null;
      const lines = (em.lines ?? []) as { category: ActivityCategory; status: string; kgCO2e: number | null }[];
      row.byCategory = Object.fromEntries(CATEGORIES.map((c) => {
        const l = lines.find((x) => x.category === c);
        return [c, l && (l.status === "calculated" || l.status === "not_used") ? l.kgCO2e : null];
      })) as Record<ActivityCategory, number | null>;
    }
    return row;
  }).sort((a, b) => a.supplierId.localeCompare(b.supplierId));
}

const hash = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 32);

export async function recomputeCompanyPeriod(db: Firestore, companyId: string, period: string) {
  const rows = await buildCompanyPeriodRows(db, companyId, period);
  const ref = db.doc(`company_period_stats/${companyId}_${period}`);
  const h = hash(rows);
  const existing = await ref.get();
  if (existing.data()?.rowsHash === h) return { written: false, rows: rows.length };
  await ref.set({ companyId, period, rows, rowCount: rows.length, rowsHash: h, generatedAt: FieldValue.serverTimestamp() });
  return { written: true, rows: rows.length };
}

/** Periods with any report shared with the company, plus the current reporting period. */
export async function companyPeriods(db: Firestore, companyId: string) {
  const snap = await db.collection("monthly_reports").where("sharedWith", "array-contains", companyId).select("period").get();
  const set = new Set(snap.docs.map((d) => d.data().period as string));
  const existing = await db.collection("company_period_stats").where("companyId", "==", companyId).select("period").get();
  existing.docs.forEach((d) => set.add(d.data().period as string));
  set.add(defaultPeriod());
  return [...set].sort();
}

export async function recomputeCompanyAll(db: Firestore, companyId: string) {
  let written = 0;
  for (const p of await companyPeriods(db, companyId)) if ((await recomputeCompanyPeriod(db, companyId, p)).written) written++;
  return written;
}

/** After a report changes: every company related to the supplier, for that period. Never throws. */
export async function recomputeAfterReportChange(db: Firestore, supplierId: string, period: string) {
  try {
    const rels = await db.collection("company_supplier_relationships").where("supplierId", "==", supplierId).get();
    await Promise.all(rels.docs.map((d) => recomputeCompanyPeriod(db, d.data().companyId, period)));
  } catch (e) {
    // Stats are derived data; the primary write already succeeded. Settings offers a manual refresh.
    console.error("stats recompute failed", supplierId, period, e);
  }
}

export async function recomputeAfterSharingChange(db: Firestore, companyId: string) {
  try { await recomputeCompanyAll(db, companyId); } catch (e) { console.error("stats recompute failed", companyId, e); }
}
