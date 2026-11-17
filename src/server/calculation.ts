// Live (trial/production) emissions + scoring, written inside the caller's transaction.
// Seeded workbook rows never pass through here: their results stay "workbook_simulated".
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { calculateEmissions, type EmissionFactor, type EmissionResult } from "@/lib/emissions";
import {
  compareEvidence, recommendationsFor, scoreReport, WORKBOOK_SCORING_PARAMS,
  type Benchmark, type EvidenceOutcome, type ScoreResult, type ScoringParams,
} from "@/lib/scoring";
import type { ActivityData, ReportProfile, ReportStatus } from "@/lib/types";

export interface ReferenceData {
  factors: EmissionFactor[];
  params: ScoringParams;
  benchmarkFor: (sector: string | null) => Benchmark | null;
}

/** Reads factors, parameters and INDUSTRY benchmarks. Simulated sample averages are never used live. */
export async function loadReferenceData(db: Firestore): Promise<ReferenceData> {
  const [f, p, b] = await Promise.all([
    db.collection("emission_factors").get(),
    db.doc("meta/scoring_params").get(),
    db.collection("benchmarks").where("status", "==", "industry_verified").get(),
  ]);
  const factors = f.docs.map((d) => d.data() as EmissionFactor);
  const params = p.exists ? (p.data() as ScoringParams) : WORKBOOK_SCORING_PARAMS;
  const benchmarks = b.docs.map((d) => ({ benchmarkId: d.id, ...d.data() }) as Benchmark);
  return { factors, params, benchmarkFor: (sector) => benchmarks.find((x) => x.sector === sector) ?? null };
}

export interface Calculation {
  emission: EmissionResult;
  evidence: EvidenceOutcome;
  score: ScoreResult;
}

export function calculate(profile: ReportProfile, activity: ActivityData, checkedKwh: number | null, ref: ReferenceData): Calculation {
  const emission = calculateEmissions(activity, profile.productionVolume, profile.productionUnit, ref.factors);
  const evidence = compareEvidence(activity.electricityKwh, checkedKwh, ref.params.evidenceTolerance, (activity.notApplicable ?? []).includes("listrik"));
  const score = scoreReport({
    profile, activity, intensity: emission.intensity, evidence, benchmark: ref.benchmarkFor(profile.sector), params: ref.params,
  });
  return { emission, evidence, score };
}

interface WriteCtx {
  reportId: string; supplierId: string; period: string; reportVersion: number; reportStatus: ReportStatus;
  sharedWith: string[]; dataSource: string; trigger: string; actorUid: string;
  /** "verified" only after a reviewer approved the report. */
  scoreType: "provisional" | "verified";
  profile: ReportProfile; activity: ActivityData; checkedKwh: number | null;
}

/** Writes activity_records, emission_results, supplier_scores (+ immutable version) and recommendations. */
export function writeCalculation(db: Firestore, tx: Transaction, calc: Calculation, ref: ReferenceData, c: WriteCtx) {
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
    ...base, scoreType: c.scoreType, calcSource: "engine_v1", reportVersion: c.reportVersion, reportStatus: c.reportStatus,
    components: calc.score.components, availableWeight: calc.score.availableWeight, partialPoints: calc.score.partialPoints,
    final: calc.score.final, color: calc.score.color, colorReason: calc.score.colorReason, intensityRatio: calc.score.intensityRatio,
    evidence: { ...calc.evidence, checkedKwh: c.checkedKwh, reportedKwh: c.activity.electricityKwh },
    params: { weights: ref.params.weights, evidenceTolerance: ref.params.evidenceTolerance, source: ref.params.source },
    benchmark: ref.benchmarkFor(c.profile.sector), trigger: c.trigger,
  };
  tx.set(db.doc(`supplier_scores/${c.reportId}`), { ...scoreDoc, updatedAt: now });
  tx.create(db.collection(`supplier_scores/${c.reportId}/versions`).doc(), { ...scoreDoc, actorUid: c.actorUid, createdAt: now });

  const missingFactor = calc.emission.lines.filter((l) => l.status === "missing_factor").map((l) => l.category);
  tx.set(db.doc(`recommendations/${c.reportId}`), {
    ...base, source: "rules_v1", reportVersion: c.reportVersion,
    items: recommendationsFor(c.profile, c.activity, calc.score, missingFactor), updatedAt: now,
  });
}
