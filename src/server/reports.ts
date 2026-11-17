// Report submission workflow (server-only status transitions).
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { PERIOD_RE, reportId as makeReportId } from "@/lib/constants";
import { isReportable, referenceDate } from "@/lib/period";
import { missingItems, submitBlockers } from "@/lib/report";
import type { ReportStatus } from "@/lib/types";
import { grantedCompanies, requireSupplier } from "./sharing";
import { AppError } from "./suppliers";

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }

const num = z.number().nonnegative().lt(1e9).nullable();
const str = (max: number) => z.string().max(max).nullable();

export const profileSchema = z.object({
  businessName: str(120),
  sector: str(60),
  mainProduct: str(120),
  productionVolume: num,
  productionUnit: str(30),
  employees: num,
}).strict();

export const activitySchema = z.object({
  electricityKwh: num,
  fuelQuantity: num,
  fuelUnit: z.enum(["liter", "kg"]).nullable(),
  fuelType: z.enum(["Bensin", "Solar", "LPG", "Lainnya"]).nullable(),
  packagingKg: num,
  packagingMaterial: str(80),
  wasteKg: num,
  wasteHandling: str(80),
  rawMaterialOrigin: z.enum(["Lokal", "Regional", "Impor"]).nullable(),
  transportMode: z.enum(["Motor", "Mobil bak", "Truk"]).nullable(),
  transportKm: num,
  efficiencyPractice: z.enum(["Belum", "Sebagian", "Sudah ada"]).nullable(),
  notApplicable: z.array(z.enum(["listrik", "bbm", "kemasan", "limbah", "transportasi"])).max(5),
}).strict()
  .refine((a) => a.fuelType == null || a.fuelUnit === (a.fuelType === "LPG" ? "kg" : "liter"), {
    message: "Satuan bahan bakar tidak sesuai jenisnya (LPG dalam kg, BBM dalam liter)",
  });

export const periodSchema = z.object({ period: z.string().regex(PERIOD_RE, "Periode tidak valid") });

export async function submitReport(db: Firestore, caller: Caller, period: string, ref = referenceDate()) {
  const supplierId = requireSupplier(caller);
  if (!isReportable(period, ref)) {
    throw new AppError("period_not_allowed", "Periode ini tidak dapat dilaporkan.", 400);
  }
  const rid = makeReportId(supplierId, period);
  const reportRef = db.doc(`monthly_reports/${rid}`);
  // Consents are read outside the transaction; a consent change concurrently
  // re-propagates sharedWith over all docs, so the end state stays consistent.
  const sharedWith = await grantedCompanies(db, supplierId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(reportRef);
    if (!snap.exists) throw new AppError("not_found", "Draf laporan tidak ditemukan.", 404);
    const r = snap.data()!;
    if (r.supplierId !== supplierId) throw new AppError("forbidden", "Laporan bukan milik Anda.", 403);
    const from = r.status as ReportStatus;
    if (from !== "draft" && from !== "revision_requested") {
      throw new AppError("not_editable", "Laporan ini sudah dikirim dan tidak dapat dikirim ulang.", 409);
    }
    const profile = profileSchema.parse(r.profile);
    const activity = activitySchema.parse(r.activity);
    const blockers = submitBlockers(profile);
    if (blockers.length) throw new AppError("incomplete", blockers.join(". "), 400);

    const evidence = await tx.get(
      db.collection("evidence_metadata").where("supplierId", "==", supplierId).where("reportId", "==", rid),
    );

    const version = (r.version ?? 0) + 1;
    const now = FieldValue.serverTimestamp();
    const missing = missingItems(profile, activity).map((m) => m.field);

    tx.update(reportRef, {
      status: "submitted",
      version,
      submittedAt: now,
      sharedWith,
      missingFields: missing,
      evidenceCount: evidence.size,
      updatedAt: now,
    });
    // Immutable snapshot: later edits (after a revision request) never overwrite history.
    tx.create(reportRef.collection("versions").doc(`v${version}`), {
      reportId: rid, supplierId, period, version, profile, activity, missingFields: missing,
      evidenceIds: evidence.docs.map((d) => d.id), sharedWith,
      dataSource: r.dataSource, isSimulated: r.isSimulated ?? false, submittedAt: now, submittedByUid: caller.uid,
    });
    evidence.docs.forEach((d) => tx.update(d.ref, { sharedWith }));
    tx.create(db.collection("verification_records").doc(), {
      reportId: rid, supplierId, action: version === 1 ? "submitted" : "resubmitted",
      fromStatus: from, toStatus: "submitted", actorUid: caller.uid, actorRole: "supplier",
      note: null, version, sharedWith, dataSource: r.dataSource, isSimulated: false, createdAt: now,
    });
    tx.create(db.collection("notifications").doc(), {
      recipientUid: caller.uid, title: "Laporan terkirim",
      body: `Laporan ${period} diterima dan sedang menunggu verifikasi.`,
      link: `/s/laporan/${period}`, read: false, createdAt: now,
    });
    tx.create(db.collection("audit_logs").doc(), {
      actorUid: caller.uid, action: "report.submit", target: reportRef.path, version, createdAt: now,
    });
    return { reportId: rid, version, status: "submitted" as const, sharedWith, missingFields: missing };
  });
  return result;
}

export const correctionSchema = z.object({
  period: z.string().regex(PERIOD_RE),
  reason: z.string().trim().min(5, "Jelaskan singkat apa yang perlu dikoreksi").max(500),
});

/**
 * Supplier reopens a submitted report that has not been reviewed yet.
 * Verified/rejected reports cannot be reopened by the supplier (Phase 3 adds
 * reviewer-initiated revision requests).
 */
export async function requestCorrection(db: Firestore, caller: Caller, raw: z.infer<typeof correctionSchema>) {
  const supplierId = requireSupplier(caller);
  const input = correctionSchema.parse(raw);
  const rid = makeReportId(supplierId, input.period);
  const reportRef = db.doc(`monthly_reports/${rid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reportRef);
    if (!snap.exists || snap.data()!.supplierId !== supplierId) throw new AppError("not_found", "Laporan tidak ditemukan.", 404);
    const r = snap.data()!;
    if (r.status !== "submitted") {
      throw new AppError("not_correctable", "Koreksi hanya dapat diajukan sebelum laporan diverifikasi.", 409);
    }
    const now = FieldValue.serverTimestamp();
    tx.update(reportRef, { status: "revision_requested", updatedAt: now });
    tx.create(db.collection("verification_records").doc(), {
      reportId: rid, supplierId, action: "supplier_correction_request", fromStatus: "submitted",
      toStatus: "revision_requested", actorUid: caller.uid, actorRole: "supplier", note: input.reason,
      version: r.version, sharedWith: r.sharedWith ?? [], dataSource: r.dataSource, isSimulated: false, createdAt: now,
    });
    tx.create(db.collection("audit_logs").doc(), {
      actorUid: caller.uid, action: "report.correction_request", target: reportRef.path, createdAt: now,
    });
    return { reportId: rid, status: "revision_requested" as const };
  });
}
