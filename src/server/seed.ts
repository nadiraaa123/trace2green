// Idempotent import of the simulated workbook into Firestore.
//
// - Deterministic document IDs (SUP-001, SUP-001_2027-01, …) → re-running never duplicates.
// - Each seeded doc stores _seedHash; unchanged docs are skipped (no write).
// - Never overwrites live data: report-family docs whose dataSource is not "demo"
//   are left alone and reported as conflicts; claimed suppliers keep their owner,
//   contact details and profile edits; consents changed in-app are kept.
// - Workbook values are stored as-is with calcSource "workbook_simulated".
import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { missingItems } from "@/lib/report";
import type { EmissionFactor } from "@/lib/emissions";
import type { ScoringParams } from "@/lib/scoring";
import type { ActivityData, ReportProfile } from "@/lib/types";
import type { Workbook } from "./workbook";

const SOURCE = "Dummy Data Analisis.xlsx";
const DEMO = { dataSource: "demo", isSimulated: true } as const;

export const companyIdFor = (buyer: string) => {
  const m = /^Perusahaan Mitra ([A-Z])$/.exec(buyer);
  if (!m) throw new Error(`Unknown buyer name in workbook: ${buyer}`);
  return `CMP-${m[1]}`;
};

const FACTOR_MAP: Record<string, Pick<EmissionFactor, "category" | "activityUnit" | "appliesToFuelTypes" | "appliesToTransportMode">> = {
  "Listrik|kWh": { category: "listrik", activityUnit: "kWh" },
  // Workbook note: "setara bensin". Covers Bensin and rows whose fuel type was not recorded.
  "BBM|liter": { category: "bbm", activityUnit: "liter", appliesToFuelTypes: ["Bensin", "unspecified"] },
  "Kemasan|kg": { category: "kemasan", activityUnit: "kg" },
  "Limbah|kg": { category: "limbah", activityUnit: "kg" },
  "Motor|km": { category: "transportasi", activityUnit: "km", appliesToTransportMode: "Motor" },
  "Mobil bak|km": { category: "transportasi", activityUnit: "km", appliesToTransportMode: "Mobil bak" },
  "Truk|km": { category: "transportasi", activityUnit: "km", appliesToTransportMode: "Truk" },
};

export function factorsFromWorkbook(wb: Workbook): EmissionFactor[] {
  return wb.factors.map((f) => {
    const m = FACTOR_MAP[`${f.category}|${f.unit}`];
    if (!m) throw new Error(`Unmapped workbook factor ${f.category}/${f.unit}`);
    const slug = f.category.toLowerCase().replace(/\s+/g, "-");
    return {
      factorId: `wb-${slug}-${f.unit.toLowerCase()}`, ...m, kgCO2ePerUnit: f.factor, status: "simulated",
      source: `${SOURCE} — tab Faktor emisi`, sourceNote: f.note, factorYear: null, validFrom: null, validTo: null,
    };
  });
}

export function scoringParamsFromWorkbook(wb: Workbook): ScoringParams {
  const get = (prefix: string) => {
    const p = wb.params.find((x) => x.name.startsWith(prefix));
    if (!p) throw new Error(`Workbook parameter "${prefix}" not found`);
    return p.value;
  };
  return {
    weights: { completeness: get("Bobot kelengkapan"), evidence: get("Bobot kecocokan"), intensity: get("Bobot intensitas") },
    evidenceTolerance: get("Toleransi kecocokan"), minCompleteness: get("Kelengkapan minimum"),
    greenMaxRatio: get("Batas rasio intensitas HIJAU"), redMinRatio: get("Batas rasio intensitas MERAH"),
    source: `${SOURCE} — tab Faktor emisi (parameter skor; toleransi & batas adalah ASUMSI workbook)`,
  };
}

export function reportFromSubmission(s: Workbook["submissions"][number], businessName: string): { profile: ReportProfile; activity: ActivityData } {
  return {
    profile: {
      businessName, sector: s.sector, mainProduct: null, productionVolume: s.production,
      // Workbook header: "Q5 Volume produksi (unit/bulan)".
      productionUnit: s.production != null ? "unit" : null, employees: s.employees,
    },
    activity: {
      electricityKwh: s.kwh,
      fuelQuantity: s.fuelLiters, fuelUnit: s.fuelLiters != null ? "liter" : null, fuelType: null, // type not recorded in workbook
      packagingKg: s.packagingKg, packagingMaterial: null, wasteKg: s.wasteKg, wasteHandling: null,
      rawMaterialOrigin: s.origin as ActivityData["rawMaterialOrigin"], transportMode: s.transportMode as ActivityData["transportMode"],
      transportKm: s.transportKm, efficiencyPractice: s.practice as ActivityData["efficiencyPractice"],
      notApplicable: [], // the workbook has no "not used" answer: blanks are missing
    },
  };
}

interface Planned { ref: DocumentReference; data: Record<string, unknown>; mode: "replace" | "supplier" | "consent" | "report_family" }

export interface SeedStats {
  planned: number; written: number; skippedUnchanged: number; conflicts: string[];
  counts: Record<string, number>;
}

const hash = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 32);

export async function seedWorkbook(db: Firestore, wb: Workbook, opts: { dryRun?: boolean } = {}): Promise<SeedStats> {
  const plan: Planned[] = [];
  const add = (path: string, data: Record<string, unknown>, mode: Planned["mode"] = "replace") => plan.push({ ref: db.doc(path), data, mode });
  const supplierById = new Map(wb.suppliers.map((s) => [s.supplierId, s]));
  // Sharing follows CURRENT consent records, so re-seeding never restores access a
  // supplier revoked, and keeps companies a claimed supplier connected to later.
  const consentSnap = await db.collection("supplier_data_sharing_consents").get();
  const consentState = new Map(consentSnap.docs.map((d) => [d.id, d.data().granted === true]));
  const sharedFor = (sid: string) => {
    const seeded = companyIdFor(supplierById.get(sid)!.buyer);
    const out = new Set<string>();
    if (consentState.get(`${seeded}_${sid}`) !== false) out.add(seeded); // absent = seeded simulated consent
    for (const [id, granted] of consentState) if (granted && id.endsWith(`_${sid}`)) out.add(id.split("_")[0]);
    return [...out].sort();
  };
  const linkFor = (sid: string) => companyIdFor(supplierById.get(sid)!.buyer);

  // Companies
  for (const buyer of [...new Set(wb.suppliers.map((s) => s.buyer))].sort()) {
    const companyId = companyIdFor(buyer);
    add(`companies/${companyId}`, { companyId, name: buyer, plan: "trial", ...DEMO });
  }

  // Suppliers, relationships, simulated consents
  wb.suppliers.forEach((s, i) => {
    const companyId = companyIdFor(s.buyer);
    add(`suppliers/${s.supplierId}`, {
      supplierId: s.supplierId, businessName: s.name, sector: s.sector, region: s.region,
      seedSource: { workbook: SOURCE, sheet: "Daftar pemasok", row: i + 2 }, ...DEMO,
    }, "supplier");
    add(`company_supplier_relationships/${companyId}_${s.supplierId}`, {
      companyId, companyName: s.buyer, supplierId: s.supplierId, isCritical: s.critical, status: "active", ...DEMO,
    });
    add(`supplier_data_sharing_consents/${companyId}_${s.supplierId}`, {
      companyId, supplierId: s.supplierId, granted: true, method: "seed_simulated", grantedByUid: null,
      grantedAt: null, revokedAt: null, propagation: "done", note: "Persetujuan simulasi untuk data contoh", ...DEMO,
    }, "consent");
  });

  // Factors, parameters, benchmarks (reference only)
  for (const f of factorsFromWorkbook(wb)) add(`emission_factors/${f.factorId}`, { ...f, ...DEMO });
  add("meta/scoring_params", { ...scoringParamsFromWorkbook(wb), ...DEMO });
  const groupAvg = new Map<string, number>();
  wb.scores.forEach((s) => {
    const sector = supplierById.get(s.supplierId)!.sector;
    if (s.groupAvg != null) groupAvg.set(sector, s.groupAvg);
  });
  for (const [sector, avg] of [...groupAvg].sort()) {
    add(`benchmarks/wb-${sector.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, {
      sector, avgIntensity: avg, unit: "kg CO2e/unit", status: "simulated_sample_average", usableForLiveScoring: false,
      source: `${SOURCE} — tab Hasil skor, kolom "Rata-rata Kelompok" (rata-rata sampel simulasi, bukan pembanding industri)`, ...DEMO,
    });
  }

  // Reports and workbook results
  wb.submissions.forEach((s, i) => {
    const sup = supplierById.get(s.supplierId);
    if (!sup) throw new Error(`Submission for unknown supplier ${s.supplierId}`);
    const rid = `${s.supplierId}_${s.period}`;
    const sc = wb.scores[i];
    if (sc.supplierId !== s.supplierId || sc.period !== s.period) throw new Error(`Hasil skor row ${i + 2} does not match Isian pemasok`);
    const sharedWith = sharedFor(s.supplierId);
    const { profile, activity } = reportFromSubmission(s, sup.name);
    const base = { reportId: rid, supplierId: s.supplierId, period: s.period, sharedWith, ...DEMO };

    add(`monthly_reports/${rid}`, {
      ...base, status: "imported_simulated", profile, activity, draftStep: 4, version: 1, submittedAt: null,
      missingFields: missingItems(profile, activity).map((m) => m.field),
      // Workbook evidence result kept apart from the verification workflow.
      workbook: { evidenceStatus: sc.evidenceStatus, billKwh: s.billKwh, sheet: "Isian pemasok", row: i + 2 },
    }, "report_family");

    const acts: [string, number | null, string | null, string | null][] = [
      ["listrik", s.kwh, "kWh", null], ["bbm", s.fuelLiters, "liter", null], ["kemasan", s.packagingKg, "kg", null],
      ["limbah", s.wasteKg, "kg", null], ["transportasi", s.transportKm, "km", s.transportMode],
    ];
    for (const [category, quantity, unit, qualifier] of acts) {
      add(`activity_records/${rid}_${category}`, { ...base, category, quantity, unit, qualifier, status: quantity == null ? "missing" : "reported" }, "report_family");
    }

    const inputs: Record<string, number | null> = { listrik: s.kwh, bbm: s.fuelLiters, kemasan: s.packagingKg, limbah: s.wasteKg, transportasi: s.transportKm };
    add(`emission_results/${rid}`, {
      ...base, calcSource: "workbook_simulated", reportVersion: 1,
      byCategory: sc.emis, totalKgCO2e: sc.emis.total, intensity: sc.intensity, intensityUnit: "kg CO2e/unit",
      // Made visible, not silently corrected: the workbook multiplies blank cells as 0.
      workbookBlankAsZero: Object.entries(inputs).filter(([, v]) => v == null).map(([k]) => k),
      usesSimulatedFactors: true,
    }, "report_family");

    add(`supplier_scores/${rid}`, {
      ...base, scoreType: "simulated", calcSource: "workbook_simulated", reportVersion: 1,
      components: [
        { key: "completeness", weight: 0.3, status: "available", score: sc.scoreCompleteness, detail: `Workbook: ${Math.round(sc.completeness * 10)} dari 10` },
        { key: "evidence", weight: 0.3, status: "available", score: sc.scoreEvidence, detail: `Workbook: ${sc.evidenceStatus}` },
        { key: "intensity", weight: 0.4, status: "available", score: sc.scoreIntensity,
          detail: sc.ratio != null ? `Workbook: rasio ${sc.ratio.toFixed(2)} terhadap rata-rata sampel simulasi` : "Workbook: intensitas kosong dihitung 0" },
      ],
      final: sc.final, color: sc.color, intensityRatio: sc.ratio, groupAvg: sc.groupAvg, auditPriority: sc.priority,
      methodNote: "Skor asli workbook (simulasi). Bukti kosong dan intensitas kosong dihitung 0 oleh workbook.",
    }, "report_family");

    add(`recommendations/${rid}`, { ...base, source: "workbook_simulated", items: [{ code: "workbook", text: sc.suggestion, severity: "info" }] }, "report_family");
  });

  // Sample audits: simulated events, never status changes.
  for (const a of wb.audits) {
    const rid = `${a.supplierId}_${a.period}`;
    if (!wb.submissions.some((s) => s.supplierId === a.supplierId && s.period === a.period)) throw new Error(`Audit for missing report ${rid}`);
    add(`verification_records/wb-audit-${rid}`, {
      reportId: rid, supplierId: a.supplierId, action: "sample_audit", fromStatus: null, toStatus: null,
      actorUid: null, actorRole: "system", note: a.note, version: 1, sharedWith: sharedFor(a.supplierId),
      audit: { reportedKwh: a.reportedKwh, auditedKwh: a.auditedKwh, diff: a.diff, result: a.result },
      simulatedEvent: true, ...DEMO,
    }, "report_family");
  }

  // ---- apply ----
  const stats: SeedStats = { planned: plan.length, written: 0, skippedUnchanged: 0, conflicts: [], counts: {} };
  for (const p of plan) {
    const col = p.ref.parent.id;
    stats.counts[col] = (stats.counts[col] ?? 0) + 1;
  }
  const writes: { ref: DocumentReference; data: Record<string, unknown>; merge: boolean }[] = [];
  for (let i = 0; i < plan.length; i += 300) {
    const chunk = plan.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map((p) => p.ref));
    chunk.forEach((p, j) => {
      const existing = snaps[j].exists ? snaps[j].data()! : null;
      // Live data always wins; report it even if nothing else changed.
      if (p.mode === "report_family" && existing && existing.dataSource !== "demo") {
        stats.conflicts.push(`${p.ref.path}: existing ${existing.dataSource} document kept`);
        return;
      }
      if (p.mode === "consent" && existing && existing.method !== "seed_simulated") {
        stats.conflicts.push(`${p.ref.path}: consent changed by supplier, kept`);
        return;
      }
      const h = hash(p.data);
      if (existing?._seedHash === h) { stats.skippedUnchanged++; return; }
      const now = FieldValue.serverTimestamp();
      const meta = { _seedHash: h, seededAt: now, updatedAt: now, ...(existing ? {} : { createdAt: now }) };
      if (p.mode === "supplier") {
        const companyId = linkFor(p.data.supplierId as string);
        if (existing?.ownerUid) {
          // Claimed profile: keep the owner's edits; only refresh provenance and the link.
          writes.push({ ref: p.ref, merge: true, data: { seedSource: p.data.seedSource, linkedCompanies: FieldValue.arrayUnion(companyId), ...meta } });
          return;
        }
        writes.push({ ref: p.ref, merge: true, data: {
          ...p.data, ownerUid: null, claimStatus: "unclaimed", picName: existing?.picName ?? null, whatsapp: existing?.whatsapp ?? null,
          mainProduct: existing?.mainProduct ?? null, employees: existing?.employees ?? null, privacyConsentAt: null,
          linkedCompanies: FieldValue.arrayUnion(companyId), ...meta,
        } });
        return;
      }
      writes.push({ ref: p.ref, merge: false, data: { ...p.data, ...meta, ...(existing?.createdAt ? { createdAt: existing.createdAt } : {}) } });
    });
  }

  if (!opts.dryRun) {
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach((w) => batch.set(w.ref, w.data, { merge: w.merge }));
      await batch.commit();
    }
    // Supplier counter must stay above seeded IDs (only ever increases).
    const maxSeeded = Math.max(...wb.suppliers.map((s) => Number(s.supplierId.slice(4))));
    await db.runTransaction(async (tx) => {
      const ref = db.doc("meta/counters");
      const cur = (await tx.get(ref)).data()?.nextSupplierNumber ?? 0;
      if (cur <= maxSeeded) tx.set(ref, { nextSupplierNumber: maxSeeded + 1 }, { merge: true });
    });
    if (writes.length) {
      await db.doc("meta/seed_import").set({
        workbook: SOURCE, workbookSha256: wb.sha256, lastRunAt: FieldValue.serverTimestamp(),
        documents: stats.planned, lastWritten: writes.length, conflicts: stats.conflicts.length, counts: stats.counts,
      }, { merge: true });
    }
  }
  stats.written = writes.length;
  return stats;
}
