// Draft creation/deletion via the server so company summaries (draft counts) stay current.
// Only the existence of a draft reaches company summaries — never its contents.
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { reportId as makeReportId } from "@/lib/constants";
import { isReportable, referenceDate } from "@/lib/period";
import { emptyActivity, emptyProfile } from "@/lib/report";
import { requireSupplier } from "./sharing";
import { recomputeAfterReportChange } from "./stats";
import { AppError } from "./suppliers";

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }

export async function createDraft(db: Firestore, caller: Caller, period: string, ref = referenceDate()) {
  const supplierId = requireSupplier(caller);
  if (!isReportable(period, ref)) throw new AppError("period_not_allowed", "Periode ini tidak dapat dilaporkan.", 400);
  const rid = makeReportId(supplierId, period);
  const reportRef = db.doc(`monthly_reports/${rid}`);
  const created = await db.runTransaction(async (tx) => {
    const [snap, sup] = await Promise.all([tx.get(reportRef), tx.get(db.doc(`suppliers/${supplierId}`))]);
    if (snap.exists) return false; // one report per month: open the existing one
    const s = sup.data() ?? {};
    const now = FieldValue.serverTimestamp();
    tx.create(reportRef, {
      reportId: rid, supplierId, period, status: "draft",
      // Identity is prefilled from the profile; activity data always starts empty.
      profile: { ...emptyProfile(), businessName: s.businessName ?? null, sector: s.sector ?? null, mainProduct: s.mainProduct ?? null, employees: s.employees ?? null },
      activity: emptyActivity(), draftStep: 1, version: 0, sharedWith: [], submittedAt: null,
      dataSource: "trial", isSimulated: false, createdAt: now, updatedAt: now,
    });
    return true;
  });
  if (created) await recomputeAfterReportChange(db, supplierId, period);
  return { reportId: rid, created };
}

export async function deleteDraft(db: Firestore, caller: Caller, period: string) {
  const supplierId = requireSupplier(caller);
  const rid = makeReportId(supplierId, period);
  const reportRef = db.doc(`monthly_reports/${rid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(reportRef);
    if (!snap.exists) return;
    if (snap.data()!.status !== "draft") throw new AppError("not_draft", "Hanya draf yang dapat dihapus.", 409);
    tx.delete(reportRef);
  });
  await recomputeAfterReportChange(db, supplierId, period);
  return { reportId: rid, deleted: true };
}
