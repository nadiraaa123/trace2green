// Company dashboard KPIs (pure). One row per related supplier per period lives in
// the server-maintained summary doc company_period_stats/{companyId}_{period}.
// Rules:
// - The company portal shows ONE unified view (combinedKpis). Only additive counts
//   and totals are combined; scores are never averaged across simulated (workbook)
//   and trial (engine) methodologies.
// - Missing data stays missing: averages state their n and what was excluded.
// - Nothing here invents values; every number is derived from the rows.
import type { ActivityCategory } from "./types";

export type Source = "demo" | "trial";
export type SourceFilter = "all" | Source;
export type RowReportStatus = "no_consent" | "missing" | "draft" | "submitted" | "revision_requested" | "imported_simulated";
export type RowReviewStatus = "pending" | "verified" | "revision_requested" | "rejected" | "awaiting_resubmission" | null;
export type EvidenceState = "match" | "mismatch" | "unverifiable" | null;

export interface StatsRow {
  supplierId: string;
  name: string;
  sector: string | null;
  region: string | null;
  source: Source;
  critical: boolean;
  consent: boolean;
  reportStatus: RowReportStatus;
  reportVersion: number | null;
  reviewStatus: RowReviewStatus; // this company's review (trial only)
  evidenceCount: number | null; // in-app evidence metadata entries (no files stored)
  final: number | null;
  color: "HIJAU" | "KUNING" | "MERAH" | null;
  scoreBasis: "workbook_simulated" | "engine_provisional" | "engine_company_review" | null;
  benchmarkBasis: "simulated_sample_average" | "industry_verified" | null;
  completeness: number | null; // 0–1
  evidence: EvidenceState;
  intensity: number | null;
  intensityRatio: number | null;
  totalKg: number | null;
  totalStatus: "workbook" | "complete" | "partial" | "unavailable" | null;
  byCategory: Record<ActivityCategory, number | null> | null; // null = not calculated (missing), 0 = genuine zero
  blankAsZero: ActivityCategory[]; // workbook rows only: blanks the workbook counted as 0
  kwh: number | null;
}

export interface PeriodStats { companyId: string; period: string; rows: StatsRow[] }

export const CATEGORIES: ActivityCategory[] = ["listrik", "bbm", "kemasan", "limbah", "transportasi"];
const RECEIVED: RowReportStatus[] = ["submitted", "revision_requested", "imported_simulated"];

export interface SourceKpis {
  source: Source;
  related: number; // relationships
  consented: number; // suppliers sharing data (denominator)
  received: number; // reports received (incl. revision-required)
  missing: number;
  draft: number;
  revision: number;
  completionRate: number | null; // received / consented
  avgScore: number | null;
  scored: number; // n behind avgScore
  unscored: number; // received reports without a final score
  colors: { HIJAU: number; KUNING: number; MERAH: number; none: number };
  emissions: { totalKg: number; byCategory: Record<ActivityCategory, number>; complete: number; partial: number; unavailable: number; workbook: number };
  avgCompleteness: number | null;
  evidence: { match: number; mismatch: number; unverifiable: number };
  review: { pending: number; verified: number; rejected: number; revisionRequested: number; awaiting: number };
  attention: number;
}

/** A supplier "needs attention" when there is something to act on. */
export function attentionReasons(r: StatsRow): string[] {
  if (!r.consent) return [];
  const out: string[] = [];
  if (r.reportStatus === "missing") out.push("Belum mengirim laporan");
  if (r.reportStatus === "revision_requested") out.push("Perlu perbaikan");
  if (r.color === "MERAH") out.push("Status MERAH");
  if (r.evidence === "mismatch") out.push("Bukti tidak cocok");
  if (r.reviewStatus === "pending") out.push("Menunggu verifikasi Anda");
  return out;
}

export function kpisFor(rows: StatsRow[], source: Source): SourceKpis {
  const rs = rows.filter((r) => r.source === source);
  const consented = rs.filter((r) => r.consent);
  const received = consented.filter((r) => RECEIVED.includes(r.reportStatus));
  const scored = received.filter((r) => r.final != null);
  const withCompleteness = received.filter((r) => r.completeness != null);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<ActivityCategory, number>;
  const em = { totalKg: 0, byCategory, complete: 0, partial: 0, unavailable: 0, workbook: 0 };
  for (const r of received) {
    if (r.totalStatus === "unavailable" || r.totalKg == null) { em.unavailable++; continue; }
    em.totalKg += r.totalKg;
    if (r.totalStatus === "workbook") em.workbook++;
    else if (r.totalStatus === "complete") em.complete++;
    else em.partial++;
    for (const c of CATEGORIES) em.byCategory[c] += r.byCategory?.[c] ?? 0; // null (missing) adds nothing — it is not a zero claim
  }
  const count = (f: (r: StatsRow) => boolean) => received.filter(f).length;
  return {
    source,
    related: rs.length,
    consented: consented.length,
    received: received.length,
    missing: consented.filter((r) => r.reportStatus === "missing").length,
    draft: consented.filter((r) => r.reportStatus === "draft").length,
    revision: consented.filter((r) => r.reportStatus === "revision_requested").length,
    completionRate: consented.length ? received.length / consented.length : null,
    avgScore: scored.length ? scored.reduce((s, r) => s + r.final!, 0) / scored.length : null,
    scored: scored.length,
    unscored: received.length - scored.length,
    colors: { HIJAU: count((r) => r.color === "HIJAU"), KUNING: count((r) => r.color === "KUNING"), MERAH: count((r) => r.color === "MERAH"), none: count((r) => r.color == null) },
    emissions: em,
    avgCompleteness: withCompleteness.length ? withCompleteness.reduce((s, r) => s + r.completeness!, 0) / withCompleteness.length : null,
    evidence: { match: count((r) => r.evidence === "match"), mismatch: count((r) => r.evidence === "mismatch"), unverifiable: count((r) => r.evidence === "unverifiable") },
    review: {
      pending: count((r) => r.reviewStatus === "pending"), verified: count((r) => r.reviewStatus === "verified"),
      rejected: count((r) => r.reviewStatus === "rejected"), revisionRequested: count((r) => r.reviewStatus === "revision_requested"),
      awaiting: count((r) => r.reviewStatus === "awaiting_resubmission"),
    },
    attention: consented.filter((r) => attentionReasons(r).length > 0).length,
  };
}

/** KPIs per selected source; "all" returns both groups, never a blended average. */
export function kpis(rows: StatsRow[], filter: SourceFilter): SourceKpis[] {
  return filter === "all" ? [kpisFor(rows, "demo"), kpisFor(rows, "trial")] : [kpisFor(rows, filter)];
}

export const filterRows = (rows: StatsRow[], f: SourceFilter) => (f === "all" ? rows : rows.filter((r) => r.source === f));

export const SOURCE_LABEL: Record<Source, string> = { demo: "Simulasi", trial: "Trial" };

/**
 * High-consumption flags from real comparisons only:
 * 1) electricity up > threshold vs the same supplier's previous period;
 * 2) intensity ratio above the red threshold vs the (labeled) benchmark.
 */
export function consumptionFlags(current: StatsRow[], previous: StatsRow[] | null, increaseThreshold = 0.2, redRatio = 1.15) {
  const prev = new Map((previous ?? []).map((r) => [r.supplierId, r]));
  const out: { supplierId: string; name: string; source: Source; kind: "kwh_increase" | "intensity_high"; detail: string }[] = [];
  for (const r of current) {
    const p = prev.get(r.supplierId);
    if (r.kwh != null && p?.kwh != null && p.kwh > 0 && (r.kwh - p.kwh) / p.kwh > increaseThreshold) {
      out.push({ supplierId: r.supplierId, name: r.name, source: r.source, kind: "kwh_increase",
        detail: `Listrik naik ${(((r.kwh - p.kwh) / p.kwh) * 100).toFixed(0)}% (${p.kwh} → ${r.kwh} kWh)` });
    }
    if (r.intensityRatio != null && r.intensityRatio > redRatio) {
      out.push({ supplierId: r.supplierId, name: r.name, source: r.source, kind: "intensity_high",
        detail: `Intensitas ${r.intensityRatio.toFixed(2)}× rata-rata kelompok ${r.benchmarkBasis === "simulated_sample_average" ? "(pembanding simulasi)" : ""}`.trim() });
    }
  }
  return out;
}

/**
 * Completion-rate trend per source, only inside that source's reporting window:
 * simulated data → months that contain simulated reports (the workbook covers Jan–Mar 2027);
 * trial data → from the first month with a trial report onward. Outside the window the
 * value is null (no line), never a fabricated 0%.
 */
export function completionTrend(periods: { period: string; rows: StatsRow[] }[], source: Source): (number | null)[] {
  const ks = periods.map((p) => kpisFor(p.rows, source));
  const first = ks.findIndex((k) => k.received > 0);
  return ks.map((k, i) => {
    if (first < 0 || i < first || k.completionRate == null) return null;
    if (source === "demo" && k.received === 0) return null;
    return Math.round(k.completionRate * 1000) / 10;
  });
}

/**
 * Unified operational view (dashboard home). Only ADDITIVE quantities are combined
 * across sources — supplier counts, report counts, emission totals, category counts.
 * Scores are never averaged across sources (different methodologies); per-source
 * breakdowns stay available on the detail pages.
 */
export interface CombinedKpis {
  related: number; consented: number; expected: number; received: number; attention: number;
  emissionsKg: number; byCategory: Record<ActivityCategory, number>;
  colors: { HIJAU: number; KUNING: number; MERAH: number; none: number };
  missing: number; draft: number; revision: number;
  /** Emission totals by how they were obtained (counts are additive). */
  emissionStatus: { workbook: number; complete: number; partial: number; unavailable: number };
  evidence: { match: number; mismatch: number; unverifiable: number };
  /** Received reports by completeness band (counts, not an average). */
  completeness: { full: number; partial: number; low: number; unknown: number };
  /** In-app (non-simulated) received reports and how many this company verified. */
  appReceived: number; verified: number;
  hasDemo: boolean; hasTrial: boolean;
}

export function combinedKpis(rows: StatsRow[]): CombinedKpis {
  const d = kpisFor(rows, "demo");
  const t = kpisFor(rows, "trial");
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, d.emissions.byCategory[c] + t.emissions.byCategory[c]])) as Record<ActivityCategory, number>;
  return {
    related: d.related + t.related, consented: d.consented + t.consented, expected: d.consented + t.consented,
    received: d.received + t.received, attention: d.attention + t.attention,
    emissionsKg: d.emissions.totalKg + t.emissions.totalKg, byCategory,
    colors: { HIJAU: d.colors.HIJAU + t.colors.HIJAU, KUNING: d.colors.KUNING + t.colors.KUNING, MERAH: d.colors.MERAH + t.colors.MERAH, none: d.colors.none + t.colors.none },
    missing: d.missing + t.missing, draft: d.draft + t.draft, revision: d.revision + t.revision,
    emissionStatus: {
      workbook: d.emissions.workbook + t.emissions.workbook, complete: d.emissions.complete + t.emissions.complete,
      partial: d.emissions.partial + t.emissions.partial, unavailable: d.emissions.unavailable + t.emissions.unavailable,
    },
    evidence: { match: d.evidence.match + t.evidence.match, mismatch: d.evidence.mismatch + t.evidence.mismatch, unverifiable: d.evidence.unverifiable + t.evidence.unverifiable },
    completeness: completenessBands(rows),
    appReceived: t.received, verified: t.review.verified,
    hasDemo: d.related > 0, hasTrial: t.related > 0,
  };
}

/** Received reports bucketed by completeness: 100%, 60–99%, < 60% (the MERAH rule), unknown. */
export function completenessBands(rows: StatsRow[]) {
  const out = { full: 0, partial: 0, low: 0, unknown: 0 };
  for (const r of rows) {
    if (!r.consent || !RECEIVED.includes(r.reportStatus)) continue;
    if (r.completeness == null) out.unknown++;
    else if (r.completeness >= 1) out.full++;
    else if (r.completeness >= 0.6) out.partial++;
    else out.low++;
  }
  return out;
}

/** Received reports (consented) — the unified list used by every company page. */
export const receivedRows = (rows: StatsRow[]) => rows.filter((r) => r.consent && RECEIVED.includes(r.reportStatus));

/**
 * Share of suppliers that sent a report, per period, across sources — each source
 * counted only inside its own reporting window (see completionTrend), so a source
 * that has no data for a month never pulls the line down to a fabricated 0%.
 */
export function combinedCompletionTrend(periods: { period: string; rows: StatsRow[] }[]): (number | null)[] {
  const windows = { demo: completionTrend(periods, "demo"), trial: completionTrend(periods, "trial") };
  return periods.map((p, i) => {
    let received = 0;
    let consented = 0;
    for (const s of ["demo", "trial"] as const) {
      if (windows[s][i] == null) continue;
      const k = kpisFor(p.rows, s);
      received += k.received;
      consented += k.consented;
    }
    return consented ? Math.round((received / consented) * 1000) / 10 : null;
  });
}
