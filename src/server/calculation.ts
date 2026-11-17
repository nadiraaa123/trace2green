// Live (trial/production) emissions + scoring, written inside the caller's transaction.
// Seeded workbook rows never pass through here: their results stay "workbook_simulated".
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { calculateEmissions, type EmissionFactor, type EmissionResult } from "@/lib/emissions";
import {
  compareEvidence, recommendationsFor, scoreReport, WORKBOOK_SCORING_PARAMS,
  type Benchmark, type EvidenceOutcome, type ScoreResult, type ScoringParams,
} from "@/lib/scoring";
import type { ActivityData, ReportProfile } from "@/lib/types";

/**
 * Demo-only: allow the workbook's simulated group average as a LABELED benchmark.
 * Server-side env, off unless explicitly set. Never treated as an industry benchmark.
 */
export const demoBenchmarkEnabled = () => process.env.DEMO_SIMULATED_BENCHMARK === "true";

/** Workbook benchmarks are "kg CO2e/unit": only count-type production units are comparable. */
export const COUNT_UNITS = ["unit", "pcs"];

export interface ReferenceData {
  factors: EmissionFactor[];
  params: ScoringParams;
  benchmarkFor: (sector: string | null, productionUnit: string | null) => Benchmark | null;
}

export async function loadReferenceData(db: Firestore, opts: { allowSimulatedBenchmark?: boolean } = {}): Promise<ReferenceData> {
  const allowSim = opts.allowSimulatedBenchmark ?? demoBenchmarkEnabled();
  const [f, p, b] = await Promise.all([
    db.collection("emission_factors").get(),
    db.doc("meta/scoring_params").get(),
    db.collection("benchmarks").get(),
  ]);
  const factors = f.docs.map((d) => d.data() as EmissionFactor);
  const params = p.exists ? (p.data() as ScoringParams) : WORKBOOK_SCORING_PARAMS;
  const all = b.docs.map((d) => ({ benchmarkId: d.id, ...d.data() }) as Benchmark);
  const industry = all.filter((x) => x.status === "industry_verified");
  const simulated = allowSim ? all.filter((x) => x.status === "simulated_sample_average") : [];
  return {
    factors, params,
    benchmarkFor: (sector, unit) => {
      const ind = industry.find((x) => x.sector === sector);
      if (ind) return ind;
      const sim = simulated.find((x) => x.sector === sector);
      return sim && unit && COUNT_UNITS.includes(unit) ? sim : null;
    },
  };
}

export interface Calculation { emission: EmissionResult; evidence: EvidenceOutcome; score: ScoreResult; benchmark: Benchmark | null }

export function calculate(profile: ReportProfile, activity: ActivityData, checkedKwh: number | null, ref: ReferenceData): Calculation {
  const emission = calculateEmissions(activity, profile.productionVolume, profile.productionUnit, ref.factors);
  const evidence = compareEvidence(activity.electricityKwh, checkedKwh, ref.params.evidenceTolerance, (activity.notApplicable ?? []).includes("listrik"));
  const benchmark = ref.benchmarkFor(profile.sector, profile.productionUnit);
  const score = scoreReport({ profile, activity, intensity: emission.intensity, evidence, benchmark, params: ref.params });
  return { emission, evidence, score, benchmark };
}

export function scorePayload(calc: Calculation, ref: ReferenceData, activity: ActivityData, checkedKwh: number | null) {
  return {
    components: calc.score.components, availableWeight: calc.score.availableWeight, partialPoints: calc.score.partialPoints,
    final: calc.score.final, color: calc.score.color, colorReason: calc.score.colorReason, intensityRatio: calc.score.intensityRatio,
    evidence: { ...calc.evidence, checkedKwh, reportedKwh: activity.electricityKwh },
    params: { weights: ref.params.weights, evidenceTolerance: ref.params.evidenceTolerance, source: ref.params.source },
    benchmark: calc.benchmark,
    benchmarkBasis: calc.benchmark?.status ?? null, // "simulated_sample_average" → demo label in UI
  };
}

interface BaseCtx {
  reportId: string; supplierId: string; period: string; reportVersion: number;
  sharedWith: string[]; dataSource: string; trigger: string; actorUid: string;
  profile: ReportProfile; activity: ActivityData;
}

/**
 * Supplier-level results shared with every authorized company: activity records,
 * emissions, the provisional score (no reviewer evidence) and recommendations.
 */
export function writeBaseCalculation(db: Firestore, tx: Transaction, calc: Calculation, ref: ReferenceData, c: BaseCtx) {
  const now = FieldValue.serverTimestamp();
  const base = { reportId: c.reportId, supplierId: c.supplierId, period: c.period, sharedWith: c.sharedWith, dataSource: c.dataSource, isSimulated: false };

  for (const l of calc.emission.lines) {
    tx.set(db.doc(`activity_records/${c.reportId}_${l.category}`), {
      ...base, category: l.category, quantity: l.quantity, unit: l.unit, qualifier: l.qualifier,
      status: l.status === "not_used" ? "declared_not_used" : l.status === "missing_activity" ? "missing" : "reported",
      reportVersion: c.reportVersion, updatedAt: now,
    });
  }
  tx.set(db.doc(`emission_results/${c.reportId}`), {
    ...base, calcSource: "engine_v1", reportVersion: c.reportVersion, lines: calc.emission.lines,
    totalKgCO2e: calc.emission.totalKgCO2e, totalStatus: calc.emission.totalStatus, missingCategories: calc.emission.missingCategories,
    intensity: calc.emission.intensity, intensityUnit: calc.emission.intensityUnit, intensityNote: calc.emission.intensityNote,
    usesSimulatedFactors: calc.emission.usesSimulatedFactors, factorIds: calc.emission.lines.map((l) => l.factorId).filter(Boolean),
    updatedAt: now,
  });
  const scoreDoc = {
    ...base, scoreType: "provisional", calcSource: "engine_v1", reportVersion: c.reportVersion, reportStatus: "submitted",
    ...scorePayload(calc, ref, c.activity, null), trigger: c.trigger, scopeCompanyId: null,
  };
  tx.set(db.doc(`supplier_scores/${c.reportId}`), { ...scoreDoc, updatedAt: now });
  tx.create(db.collection(`supplier_scores/${c.reportId}/versions`).doc(), { ...scoreDoc, actorUid: c.actorUid, createdAt: now });
  const missingFactor = calc.emission.lines.filter((l) => l.status === "missing_factor").map((l) => l.category);
  tx.set(db.doc(`recommendations/${c.reportId}`), {
    ...base, source: "rules_v1", reportVersion: c.reportVersion,
    items: recommendationsFor(c.profile, c.activity, calc.score, missingFactor), updatedAt: now,
  });
}
