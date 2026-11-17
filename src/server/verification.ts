// Company-scoped review decisions. Each company decides on its own copy of the
// review (company_reviews/{companyId}_{reportId}); one company's approval never
// approves the report for another buyer. A revision request reopens the report
// itself (the supplier must change the data), which resets every company's review.
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { compareEvidence } from "@/lib/scoring";
import type { ActivityData, ReportProfile } from "@/lib/types";
import { CHECK_SOURCES } from "@/lib/verification";
import { calculate, loadReferenceData, scorePayload } from "./calculation";
import { recomputeAfterReportChange, recomputeCompanyPeriod } from "./stats";
import { AppError } from "./suppliers";

export { CHECK_SOURCES };

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }

export const reviewSchema = z.object({
  reportId: z.string().regex(/^SUP-\d{3,}_\d{4}-(0[1-9]|1[0-2])$/),
  action: z.enum(["approve", "request_revision", "reject"]),
  note: z.string().trim().max(1000).optional().default(""),
  checkedKwh: z.number().nonnegative().lt(1e9).nullable().optional().default(null),
  checkSource: z.enum(Object.keys(CHECK_SOURCES) as [keyof typeof CHECK_SOURCES]).nullable().optional().default(null),
  /** Only for platform admins, who must say which company they act for. */
  companyId: z.string().regex(/^CMP-[A-Z0-9]+$/).optional(),
}).superRefine((v, ctx) => {
  if (v.action !== "approve" && v.note.length < 5) ctx.addIssue({ code: "custom", path: ["note"], message: "Alasan wajib diisi (minimal 5 karakter)" });
  if (v.checkedKwh != null && !v.checkSource) ctx.addIssue({ code: "custom", path: ["checkSource"], message: "Sebutkan sumber pemeriksaan untuk nilai yang diperiksa" });
  if (v.checkedKwh == null && v.checkSource) ctx.addIssue({ code: "custom", path: ["checkedKwh"], message: "Isi nilai kWh hasil pemeriksaan" });
});

export type ReviewInput = z.input<typeof reviewSchema>;

/** Returns the company the caller reviews for, or throws. */
export function reviewerCompany(caller: Caller, requested?: string): { companyId: string; role: string } {
  const role = caller.claims.role;
  if (role === "platform_admin") {
    if (!requested) throw new AppError("company_required", "Admin platform harus memilih perusahaan yang diwakili.", 400);
    return { companyId: requested, role };
  }
  const companyId = caller.claims.companyId;
  if (role !== "company_admin" || typeof companyId !== "string" || caller.claims.canVerify !== true) {
    throw new AppError("forbidden", "Akun ini tidak berwenang memverifikasi laporan.", 403);
  }
  if (requested && requested !== companyId) throw new AppError("forbidden", "Tidak dapat meninjau atas nama perusahaan lain.", 403);
  return { companyId, role };
}

const REVIEW_STATUS = { approve: "verified", request_revision: "revision_requested", reject: "rejected" } as const;

export async function reviewReport(db: Firestore, caller: Caller, raw: ReviewInput) {
  const input = reviewSchema.parse(raw);
  const { companyId, role } = reviewerCompany(caller, input.companyId);
  const reportRef = db.doc(`monthly_reports/${input.reportId}`);
  const reviewRef = db.doc(`company_reviews/${companyId}_${input.reportId}`);
  const ref = await loadReferenceData(db);

  const result = await db.runTransaction(async (tx) => {
    const [snap, reviewSnap] = await Promise.all([tx.get(reportRef), tx.get(reviewRef)]);
    if (!snap.exists) throw new AppError("not_found", "Laporan tidak ditemukan.", 404);
    const r = snap.data()!;
    if (!(r.sharedWith ?? []).includes(companyId)) throw new AppError("forbidden", "Laporan ini tidak dibagikan ke perusahaan Anda.", 403);
    if (r.isSimulated || r.dataSource === "demo") throw new AppError("simulated_record", "Data simulasi dari workbook tidak masuk alur verifikasi.", 409);
    if (r.status !== "submitted") throw new AppError("not_reviewable", "Hanya laporan berstatus Menunggu Verifikasi yang dapat ditinjau.", 409);
    const review = reviewSnap.data();
    // A company that was granted access after submission has no review doc yet: it starts as pending.
    if (review && (review.status !== "pending" || review.reportVersion !== r.version)) {
      throw new AppError("not_reviewable", "Perusahaan Anda sudah memutuskan versi laporan ini.", 409);
    }
    const others = input.action === "request_revision"
      ? await tx.get(db.collection("company_reviews").where("reportId", "==", input.reportId)) : null;
    const evidenceMeta = await tx.get(db.collection("evidence_metadata").where("reportId", "==", input.reportId).where("supplierId", "==", r.supplierId));
    const ownerUid = (await tx.get(db.doc(`suppliers/${r.supplierId}`))).data()?.ownerUid as string | undefined;

    const profile = r.profile as ReportProfile;
    const activity = r.activity as ActivityData;
    const calc = calculate(profile, activity, input.checkedKwh, ref);
    const reviewStatus = REVIEW_STATUS[input.action];
    const now = FieldValue.serverTimestamp();
    const scoped = { sharedWith: [companyId], scopeCompanyId: companyId };
    const evidence = {
      reportedKwh: activity.electricityKwh, checkedKwh: input.checkedKwh, checkSource: input.checkSource,
      checkSourceLabel: input.checkSource ? CHECK_SOURCES[input.checkSource] : null,
      tolerance: ref.params.evidenceTolerance, outcome: compareEvidence(activity.electricityKwh, input.checkedKwh, ref.params.evidenceTolerance, (activity.notApplicable ?? []).includes("listrik")),
      // What the app holds: metadata only, never a document inspected in-app.
      inAppEvidence: evidenceMeta.docs.map((d) => ({ id: d.id, fileName: d.data().fileName, storageMode: d.data().storageMode })),
      inAppDocumentInspected: false,
    };
    const score = { scoreType: input.action === "approve" ? "verified" : "provisional", ...scorePayload(calc, ref, activity, input.checkedKwh) };

    tx.set(reviewRef, {
      companyId, reportId: input.reportId, supplierId: r.supplierId, period: r.period, reportVersion: r.version,
      status: reviewStatus, decidedAt: now, decidedByUid: caller.uid, note: input.note || null, evidence, score,
      ...scoped, dataSource: r.dataSource, isSimulated: false, createdAt: review?.createdAt ?? now, updatedAt: now,
    });
    let reportStatus = r.status as string;
    if (input.action === "request_revision") {
      reportStatus = "revision_requested";
      tx.update(reportRef, { status: "revision_requested", updatedAt: now });
      others!.docs.filter((d) => d.id !== reviewRef.id && d.data().status === "pending")
        .forEach((d) => tx.update(d.ref, { status: "awaiting_resubmission", updatedAt: now }));
    }
    tx.create(db.collection("verification_records").doc(), {
      reportId: input.reportId, supplierId: r.supplierId, action: input.action, fromStatus: "submitted",
      toStatus: input.action === "request_revision" ? "revision_requested" : null, reviewStatus,
      actorUid: caller.uid, actorRole: role, actorCompanyId: companyId, companyId, note: input.note || null,
      version: r.version, evidenceCheck: evidence, ...scoped, dataSource: r.dataSource, isSimulated: false, createdAt: now,
    });
    tx.create(db.collection(`supplier_scores/${input.reportId}/versions`).doc(), {
      reportId: input.reportId, supplierId: r.supplierId, period: r.period, reportVersion: r.version, reportStatus,
      calcSource: "engine_v1", trigger: `review:${input.action}`, companyId, ...score, ...scoped,
      dataSource: r.dataSource, isSimulated: false, actorUid: caller.uid, createdAt: now,
    });
    if (ownerUid) {
      const title = { approve: "Laporan terverifikasi", request_revision: "Laporan perlu diperbaiki", reject: "Laporan ditolak" }[input.action];
      tx.create(db.collection("notifications").doc(), {
        recipientUid: ownerUid, title, body: `${r.period} · ${companyId}${input.note ? `: ${input.note}` : ""}`,
        link: `/s/laporan/${r.period}`, read: false, createdAt: now,
      });
    }
    tx.create(db.collection("audit_logs").doc(), {
      actorUid: caller.uid, action: `report.review.${input.action}`, target: reviewRef.path, companyId,
      checkedKwh: input.checkedKwh, evidence: evidence.outcome.status, createdAt: now,
    });
    return {
      reportId: input.reportId, companyId, reviewStatus, reportStatus, supplierId: r.supplierId as string, period: r.period as string,
      evidence: evidence.outcome, final: calc.score.final, color: calc.score.color,
    };
  });

  if (input.action === "request_revision") await recomputeAfterReportChange(db, result.supplierId, result.period);
  else await recomputeCompanyPeriod(db, companyId, result.period);
  return result;
}
