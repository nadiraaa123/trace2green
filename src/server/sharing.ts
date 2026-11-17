// Supplier-controlled data sharing (UU PDP: data belongs to the supplier).
// sharedWith on report-family docs is derived ONLY from consent records here.
import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { recomputeAfterSharingChange } from "./stats";
import { AppError, hashInvite } from "./suppliers";

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }

/** Collections whose docs carry supplierId + sharedWith. */
export const REPORT_FAMILY = [
  "monthly_reports",
  "evidence_metadata",
  "activity_records",
  "emission_results",
  "supplier_scores",
  "recommendations",
  "verification_records",
  "company_reviews",
] as const;

export function requireSupplier(caller: Caller): string {
  const sid = caller.claims.supplierId;
  if (caller.claims.role !== "supplier" || typeof sid !== "string") {
    throw new AppError("forbidden", "Hanya pemasok yang dapat melakukan tindakan ini.", 403);
  }
  return sid;
}

/** Company IDs this supplier currently shares with (granted consent). */
export async function grantedCompanies(db: Firestore, supplierId: string): Promise<string[]> {
  const snap = await db.collection("supplier_data_sharing_consents")
    .where("supplierId", "==", supplierId).where("granted", "==", true).get();
  return snap.docs.map((d) => d.data().companyId as string).sort();
}

/**
 * Adds or removes a company from sharedWith on every report-family doc of a
 * supplier. Drafts are never shared. Returns the number of docs touched.
 */
export async function propagateSharing(db: Firestore, supplierId: string, companyId: string, share: boolean) {
  const op = share ? FieldValue.arrayUnion(companyId) : FieldValue.arrayRemove(companyId);
  const refs: FirebaseFirestore.DocumentReference[] = [];
  // Company-scoped docs (a company's own review, decision records, review scores) are
  // only ever shared with that company — never with another buyer.
  const scopedElsewhere = (data: FirebaseFirestore.DocumentData) => data.scopeCompanyId && data.scopeCompanyId !== companyId;
  for (const col of REPORT_FAMILY) {
    const snap = await db.collection(col).where("supplierId", "==", supplierId).get();
    for (const d of snap.docs) {
      if (scopedElsewhere(d.data())) continue;
      if (col === "monthly_reports" && d.data().status === "draft") continue;
      if (col === "evidence_metadata" && share && (d.data().sharedWith ?? []).length === 0) {
        // Evidence of an unsubmitted draft stays private until submission.
        const report = await db.doc(`monthly_reports/${d.data().reportId}`).get();
        if (report.data()?.status === "draft") continue;
      }
      refs.push(d.ref);
    }
  }
  const versions = await db.collectionGroup("versions").where("supplierId", "==", supplierId).get();
  refs.push(...versions.docs.filter((d) => !scopedElsewhere(d.data())).map((d) => d.ref));
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.update(r, { sharedWith: op }));
    await batch.commit();
  }
  return refs.length;
}

export const consentSchema = z.object({
  companyId: z.string().regex(/^CMP-[A-Z0-9]+$/),
  granted: z.boolean(),
});

/** Supplier grants or revokes a related company's access to its reports. */
export async function setConsent(db: Firestore, caller: Caller, input: z.infer<typeof consentSchema>) {
  const supplierId = requireSupplier(caller);
  const id = `${input.companyId}_${supplierId}`;
  const rel = await db.doc(`company_supplier_relationships/${id}`).get();
  if (!rel.exists || rel.data()!.status === "ended") {
    throw new AppError("not_related", "Usaha Anda belum terhubung dengan perusahaan ini.", 404);
  }
  const now = FieldValue.serverTimestamp();
  const consentRef = db.doc(`supplier_data_sharing_consents/${id}`);
  await consentRef.set({
    companyId: input.companyId,
    supplierId,
    granted: input.granted,
    method: "supplier_in_app",
    grantedByUid: caller.uid,
    grantedAt: input.granted ? now : null,
    revokedAt: input.granted ? null : now,
    propagation: "pending",
    dataSource: rel.data()!.dataSource ?? "trial",
    isSimulated: false,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  const touched = await propagateSharing(db, supplierId, input.companyId, input.granted);
  await consentRef.update({ propagation: "done", updatedAt: FieldValue.serverTimestamp() });
  await recomputeAfterSharingChange(db, input.companyId);
  await db.collection("audit_logs").add({
    actorUid: caller.uid,
    action: input.granted ? "consent.grant" : "consent.revoke",
    target: `supplier_data_sharing_consents/${id}`,
    docsUpdated: touched,
    createdAt: now,
  });
  return { companyId: input.companyId, granted: input.granted, docsUpdated: touched };
}

export const connectSchema = z.object({
  inviteCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/, "Kode harus 8 karakter"),
  shareData: z.boolean(),
});

/** A registered supplier links itself to a company using a "connect" invite code. */
export async function connectWithInvite(db: Firestore, caller: Caller, input: z.infer<typeof connectSchema>) {
  const supplierId = requireSupplier(caller);
  const inviteRef = db.doc(`supplier_invites/${hashInvite(input.inviteCode)}`);
  const supplierRef = db.doc(`suppliers/${supplierId}`);

  const { companyId, companyName } = await db.runTransaction(async (tx) => {
    const [inv, sup] = await Promise.all([tx.get(inviteRef), tx.get(supplierRef)]);
    if (!inv.exists) throw new AppError("invite_invalid", "Kode tidak ditemukan.", 404);
    const invite = inv.data()!;
    if (invite.supplierId) {
      throw new AppError("invite_wrong_type", "Kode ini untuk klaim profil pemasok saat pendaftaran, bukan untuk menghubungkan.", 400);
    }
    if (invite.usedByUid) throw new AppError("invite_used", "Kode sudah dipakai.", 409);
    if ((invite.expiresAt as Timestamp).toMillis() < Date.now()) throw new AppError("invite_expired", "Kode sudah kedaluwarsa.", 410);
    if (sup.data()?.ownerUid !== caller.uid) throw new AppError("forbidden", "Profil pemasok bukan milik akun ini.", 403);
    const relRef = db.doc(`company_supplier_relationships/${invite.companyId}_${supplierId}`);
    const rel = await tx.get(relRef);
    if (rel.exists) throw new AppError("already_connected", "Usaha Anda sudah terhubung dengan perusahaan ini.", 409);
    const now = FieldValue.serverTimestamp();
    const ds = sup.data()!.dataSource ?? "trial";
    tx.create(relRef, {
      companyId: invite.companyId, companyName: invite.companyName ?? invite.companyId, supplierId,
      isCritical: false, status: "active", dataSource: ds, isSimulated: false, createdAt: now, updatedAt: now,
    });
    tx.update(supplierRef, { linkedCompanies: FieldValue.arrayUnion(invite.companyId), updatedAt: now });
    tx.update(inviteRef, { usedByUid: caller.uid, usedAt: now });
    tx.set(db.doc(`supplier_data_sharing_consents/${invite.companyId}_${supplierId}`), {
      companyId: invite.companyId, supplierId, granted: input.shareData, method: "supplier_in_app",
      grantedByUid: caller.uid, grantedAt: input.shareData ? now : null, revokedAt: null,
      propagation: input.shareData ? "pending" : "done",
      dataSource: ds, isSimulated: false, createdAt: now, updatedAt: now,
    });
    tx.create(db.collection("audit_logs").doc(), {
      actorUid: caller.uid, action: "supplier.connect", target: relRef.path, shareData: input.shareData, createdAt: now,
    });
    return { companyId: invite.companyId as string, companyName: (invite.companyName as string) ?? invite.companyId };
  });

  if (input.shareData) {
    await propagateSharing(db, supplierId, companyId, true);
    await db.doc(`supplier_data_sharing_consents/${companyId}_${supplierId}`).update({ propagation: "done" });
  }
  await recomputeAfterSharingChange(db, companyId);
  return { companyId, companyName, shared: input.shareData };
}
