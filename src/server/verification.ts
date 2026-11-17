// Reviewer decisions on submitted reports (approve / request revision / reject).
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { compareEvidence } from "@/lib/scoring";
import { CHECK_SOURCES } from "@/lib/verification";
import type { ActivityData, ReportProfile } from "@/lib/types";
import { calculate, loadReferenceData, writeCalculation } from "./calculation";
import { AppError } from "./suppliers";

export { CHECK_SOURCES };

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }


export const reviewSchema = z.object({
  reportId: z.string().regex(/^SUP-\d{3,}_\d{4}-(0[1-9]|1[0-2])$/),
  action: z.enum(["approve", "request_revision", "reject"]),
  note: z.string().trim().max(1000).optional().default(""),
  checkedKwh: z.number().nonnegative().lt(1e9).nullable().optional().default(null),
  checkSource: z.enum(Object.keys(CHECK_SOURCES) as [keyof typeof CHECK_SOURCES]).nullable().optional().default(null),
}).superRefine((v, ctx) => {
  if (v.action !== "approve" && v.note.length < 5) ctx.addIssue({ code: "custom", path: ["note"], message: "Alasan wajib diisi (minimal 5 karakter)" });
  if (v.checkedKwh != null && !v.checkSource) ctx.addIssue({ code: "custom", path: ["checkSource"], message: "Sebutkan sumber pemeriksaan untuk nilai yang diperiksa" });
  if (v.checkedKwh == null && v.checkSource) ctx.addIssue({ code: "custom", path: ["checkedKwh"], message: "Isi nilai kWh hasil pemeriksaan" });
});

export type ReviewInput = z.input<typeof reviewSchema>;

/** Company admins with canVerify, for reports shared with their company; or platform admins. */
export function assertReviewer(caller: Caller, sharedWith: string[]): { companyId: string | null; role: string } {
  const role = caller.claims.role;
  if (role === "platform_admin") return { companyId: null, role };
  const companyId = caller.claims.companyId;
  if (role !== "company_admin" || typeof companyId !== "string" || caller.claims.canVerify !== true) {
    throw new AppError("forbidden", "Akun ini tidak berwenang memverifikasi laporan.", 403);
  }
  if (!sharedWith.includes(companyId)) {
    throw new AppError("forbidden", "Laporan ini tidak dibagikan ke perusahaan Anda.", 403);
  }
  return { companyId, role };
}

const NEXT_STATUS = { approve: "verified", request_revision: "revision_requested", reject: "rejected" } as const;

export async function reviewReport(db: Firestore, caller: Caller, raw: ReviewInput) {
  const input = reviewSchema.parse(raw);
  const reportRef = db.doc(`monthly_reports/${input.reportId}`);
  const ref = await loadReferenceData(db);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reportRef);
    if (!snap.exists) throw new AppError("not_found", "Laporan tidak ditemukan.", 404);
    const r = snap.data()!;
    const reviewer = assertReviewer(caller, r.sharedWith ?? []);
    if (r.isSimulated || r.dataSource === "demo") {
      throw new AppError("simulated_record", "Data simulasi dari workbook tidak masuk alur verifikasi.", 409);
    }
    if (r.status !== "submitted") {
      throw new AppError("not_reviewable", "Hanya laporan berstatus Menunggu Verifikasi yang dapat ditinjau.", 409);
    }
    const profile = r.profile as ReportProfile;
    const activity = r.activity as ActivityData;
    const evidenceCheck = compareEvidence(activity.electricityKwh, input.checkedKwh, ref.params.evidenceTolerance,
      (activity.notApplicable ?? []).includes("listrik"));
    const evidenceMeta = await tx.get(db.collection("evidence_metadata").where("reportId", "==", input.reportId).where("supplierId", "==", r.supplierId));
    const ownerUid = (await tx.get(db.doc(`suppliers/${r.supplierId}`))).data()?.ownerUid as string | undefined;

    const to = NEXT_STATUS[input.action];
    const now = FieldValue.serverTimestamp();
    tx.update(reportRef, { status: to, reviewedAt: now, reviewedByUid: caller.uid, reviewedByCompanyId: reviewer.companyId, updatedAt: now });

    tx.create(db.collection("verification_records").doc(), {
      reportId: input.reportId, supplierId: r.supplierId, action: input.action, fromStatus: "submitted", toStatus: to,
      actorUid: caller.uid, actorRole: reviewer.role, actorCompanyId: reviewer.companyId, note: input.note || null,
      version: r.version, sharedWith: r.sharedWith,
      evidenceCheck: {
        reportedKwh: activity.electricityKwh, checkedKwh: input.checkedKwh, checkSource: input.checkSource,
        checkSourceLabel: input.checkSource ? CHECK_SOURCES[input.checkSource] : null,
        tolerance: ref.params.evidenceTolerance, outcome: evidenceCheck,
        // What the app actually holds: metadata only, never a document that was "inspected" in-app.
        inAppEvidence: evidenceMeta.docs.map((d) => ({ id: d.id, fileName: d.data().fileName, storageMode: d.data().storageMode })),
        inAppDocumentInspected: false,
      },
      dataSource: r.dataSource, isSimulated: false, createdAt: now,
    });

    const calc = calculate(profile, activity, input.checkedKwh, ref);
    writeCalculation(db, tx, calc, ref, {
      reportId: input.reportId, supplierId: r.supplierId, period: r.period, reportVersion: r.version, reportStatus: to,
      sharedWith: r.sharedWith, dataSource: r.dataSource, trigger: `review:${input.action}`, actorUid: caller.uid,
      scoreType: input.action === "approve" ? "verified" : "provisional", profile, activity, checkedKwh: input.checkedKwh,
    });

    if (ownerUid) {
      const title = { approve: "Laporan terverifikasi", request_revision: "Laporan perlu diperbaiki", reject: "Laporan ditolak" }[input.action];
      tx.create(db.collection("notifications").doc(), {
        recipientUid: ownerUid, title, body: input.note ? `${r.period}: ${input.note}` : `Laporan ${r.period}: ${title.toLowerCase()}.`,
        link: `/s/laporan/${r.period}`, read: false, createdAt: now,
      });
    }
    tx.create(db.collection("audit_logs").doc(), {
      actorUid: caller.uid, action: `report.review.${input.action}`, target: reportRef.path,
      checkedKwh: input.checkedKwh, evidence: evidenceCheck.status, createdAt: now,
    });

    return { reportId: input.reportId, status: to, evidence: evidenceCheck, final: calc.score.final, color: calc.score.color };
  });
}
