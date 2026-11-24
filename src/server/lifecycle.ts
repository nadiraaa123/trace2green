// Customer Success + subscription lifecycle (ACTUAL records only). Server-side authority:
// clients can read (rules) but every change goes through here.
//
// Collections:
//   cs_staff/{csId}                         CS directory (scenario staff flagged scenario:true)
//   cs_assignments/{supplierId}             ONE primary CS per supplier (doc id = supplier → uniqueness)
//   supplier_lifecycle/{companyId}_{sid}    stage per company–supplier relationship (+ /history)
//   cs_followups/{auto}                     follow-up notes/actions
//   company_subscriptions/{companyId}       company plan: trial / active / renewal, separate from supplier stage
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import {
  canTransition, ISO_DATE_RE, isoDate, LIFECYCLE_STAGES, NEEDS_CONFIRMATION, roleMayTransition, trialWindow, type LifecycleStage,
} from "@/lib/lifecycle";
import { referenceDate } from "@/lib/period";
import { CS_CAPACITY, TRIAL_QUOTA_PER_NEW_COMPANY } from "@/lib/scenario";
import { AppError } from "./suppliers";

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }
type Actor = { role: "platform_admin" } | { role: "customer_success"; csId: string };

export const lifecycleId = (companyId: string, supplierId: string) => `${companyId}_${supplierId}`;

function actorOf(caller: Caller): Actor {
  if (caller.claims.role === "platform_admin") return { role: "platform_admin" };
  if (caller.claims.role === "customer_success" && typeof caller.claims.csId === "string") return { role: "customer_success", csId: caller.claims.csId };
  throw new AppError("forbidden", "Hanya tim internal Trace2Green yang dapat melakukan tindakan ini.", 403);
}
function requireAdmin(caller: Caller) {
  if (caller.claims.role !== "platform_admin") throw new AppError("forbidden", "Hanya Platform Admin.", 403);
}

// ---------- hooks used by existing flows ----------

/** Called after a supplier connects to a company: creates an "onboarding" record once. Never overwrites. */
export async function ensureLifecycleOnConnect(db: Firestore, companyId: string, companyName: string, supplierId: string, supplierName: string) {
  const ref = db.doc(`supplier_lifecycle/${lifecycleId(companyId, supplierId)}`);
  const assign = await db.doc(`cs_assignments/${supplierId}`).get();
  const now = FieldValue.serverTimestamp();
  try {
    await ref.create({
      companyId, companyName, supplierId, supplierName, csId: assign.data()?.csId ?? null, stage: "onboarding", basis: "actual",
      trialYear: null, trialStart: null, trialEnd: null, activationDate: null, contractStart: null, contractEnd: null, renewalDate: null,
      confirmation: null, lastReportPeriod: null, needsAssistance: false, createdAt: now, updatedAt: now,
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 6) throw e; // 6 = ALREADY_EXISTS → keep the existing record
  }
}

/** After a submission: record the latest period on the supplier's lifecycle records (for CS follow-up). */
export async function recordReportOnLifecycle(db: Firestore, supplierId: string, period: string) {
  const snap = await db.collection("supplier_lifecycle").where("supplierId", "==", supplierId).get();
  await Promise.all(snap.docs.map((d) => {
    const prev = d.data().lastReportPeriod as string | null;
    return !prev || prev < period ? d.ref.update({ lastReportPeriod: period, updatedAt: FieldValue.serverTimestamp() }) : null;
  }));
}

/**
 * Subscription access: a supplier whose every lifecycle record is expired cannot submit.
 * Suppliers without lifecycle records (legacy/pilot flows) are not blocked.
 */
export async function assertSubscriptionAccess(db: Firestore, supplierId: string) {
  const snap = await db.collection("supplier_lifecycle").where("supplierId", "==", supplierId).get();
  if (!snap.empty && snap.docs.every((d) => d.data().stage === "expired")) {
    throw new AppError("subscription_inactive", "Langganan Anda tidak aktif. Hubungi tim Customer Success Trace2Green.", 403);
  }
}

// ---------- CS assignment ----------

export const assignSchema = z.object({ supplierId: z.string().regex(/^SUP-\d{3,}$/), csId: z.string().regex(/^CS[A-Z0-9-]{1,20}$/).nullable() });

/** Platform Admin sets (or clears) the ONE primary CS of a supplier; capacity 70 unique suppliers. */
export async function assignCs(db: Firestore, caller: Caller, raw: z.infer<typeof assignSchema>) {
  requireAdmin(caller);
  const { supplierId, csId } = assignSchema.parse(raw);
  const assignRef = db.doc(`cs_assignments/${supplierId}`);
  const res = await db.runTransaction(async (tx) => {
    const current = await tx.get(assignRef);
    const lifecycles = await tx.get(db.collection("supplier_lifecycle").where("supplierId", "==", supplierId));
    if (csId) {
      const staff = await tx.get(db.doc(`cs_staff/${csId}`));
      if (!staff.exists || staff.data()!.active === false) throw new AppError("cs_not_found", "CS tidak ditemukan atau tidak aktif.", 404);
      if (staff.data()!.scenario === true) throw new AppError("cs_scenario", "Akun CS skenario tidak menangani pemasok nyata.", 400);
      if (current.data()?.csId !== csId) {
        const load = await tx.get(db.collection("cs_assignments").where("csId", "==", csId).count());
        if (load.data().count >= CS_CAPACITY) throw new AppError("cs_full", `Kapasitas CS penuh (${CS_CAPACITY} pemasok).`, 409);
      }
    }
    const now = FieldValue.serverTimestamp();
    if (csId) tx.set(assignRef, { supplierId, csId, assignedBy: caller.uid, assignedAt: now });
    else tx.delete(assignRef);
    lifecycles.docs.forEach((d) => tx.update(d.ref, { csId, updatedAt: now }));
    tx.create(db.collection("audit_logs").doc(), { actorUid: caller.uid, action: "cs.assign", target: assignRef.path, from: current.data()?.csId ?? null, to: csId, createdAt: now });
    return { supplierId, csId, previous: (current.data()?.csId as string | undefined) ?? null };
  });
  return res;
}

// ---------- supplier lifecycle transitions ----------

export const stageSchema = z.object({
  companyId: z.string().min(1).max(40),
  supplierId: z.string().regex(/^SUP-\d{3,}$/),
  to: z.enum(LIFECYCLE_STAGES),
  note: z.string().trim().max(500).optional(),
  trialYear: z.number().int().min(2026).max(2040).optional(),
  confirmation: z.object({
    reference: z.string().trim().min(3, "Nomor referensi konfirmasi wajib diisi").max(120),
    contractStart: z.string().regex(ISO_DATE_RE),
    contractEnd: z.string().regex(ISO_DATE_RE),
  }).optional(),
});

async function trialQuotaCheck(tx: Transaction, db: Firestore, companyId: string, year: number) {
  const sub = await tx.get(db.doc(`company_subscriptions/${companyId}`));
  const s = sub.data();
  if (!s || s.isNewCompany !== true || s.trialYear !== year) {
    throw new AppError("trial_not_allowed", "Perusahaan ini tidak memiliki masa trial untuk tahun tersebut.", 409);
  }
  const used = await tx.get(db.collection("supplier_lifecycle").where("companyId", "==", companyId).where("trialYear", "==", year).count());
  if (used.data().count >= TRIAL_QUOTA_PER_NEW_COMPANY) {
    throw new AppError("trial_quota", `Kuota trial perusahaan sudah penuh (${TRIAL_QUOTA_PER_NEW_COMPANY} pemasok).`, 409);
  }
}

export async function setSupplierStage(db: Firestore, caller: Caller, raw: z.infer<typeof stageSchema>, ref: Date = referenceDate()) {
  const actor = actorOf(caller);
  const input = stageSchema.parse(raw);
  const docRef = db.doc(`supplier_lifecycle/${lifecycleId(input.companyId, input.supplierId)}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) throw new AppError("not_found", "Data siklus pemasok tidak ditemukan.", 404);
    const cur = snap.data()!;
    if (actor.role === "customer_success" && cur.csId !== actor.csId) throw new AppError("forbidden", "Pemasok ini bukan portofolio Anda.", 403);
    const from = cur.stage as LifecycleStage;
    if (!canTransition(from, input.to)) throw new AppError("bad_transition", `Tidak dapat berpindah dari ${from} ke ${input.to}.`, 409);
    if (!roleMayTransition(actor.role, input.to)) throw new AppError("forbidden", "Status ini hanya dapat diubah oleh Platform Admin dengan konfirmasi.", 403);

    const now = FieldValue.serverTimestamp();
    const update: Record<string, unknown> = { stage: input.to, updatedAt: now };
    if (input.to === "trial") {
      // Trial counts once per supplier: a record that already had this trial year does not consume quota again.
      const year = input.trialYear ?? ref.getUTCFullYear();
      const w = trialWindow(year);
      if (isoDate(ref) > w.end) throw new AppError("trial_window_closed", `Masa trial ${year} (Januari–Maret) sudah berakhir.`, 409);
      if (cur.trialYear !== year) await trialQuotaCheck(tx, db, input.companyId, year);
      Object.assign(update, { trialYear: year, trialStart: w.start, trialEnd: w.end });
    }
    if (NEEDS_CONFIRMATION.includes(input.to)) {
      const c = input.confirmation;
      if (!c) throw new AppError("confirmation_required", "Status berbayar membutuhkan konfirmasi (nomor referensi dan tanggal kontrak).", 400);
      if (c.contractEnd <= c.contractStart) throw new AppError("bad_dates", "Tanggal akhir kontrak harus setelah tanggal mulai.", 400);
      Object.assign(update, {
        contractStart: c.contractStart, contractEnd: c.contractEnd, renewalDate: c.contractEnd,
        confirmation: { reference: c.reference, confirmedBy: caller.uid, confirmedAt: now },
        ...(input.to === "active_subscription" && !cur.activationDate ? { activationDate: isoDate(ref) } : {}),
      });
    }
    tx.update(docRef, update);
    tx.create(docRef.collection("history").doc(), { from, to: input.to, note: input.note ?? null, actorUid: caller.uid, actorRole: actor.role,
      confirmationReference: input.confirmation?.reference ?? null, createdAt: now });
    tx.create(db.collection("audit_logs").doc(), { actorUid: caller.uid, action: "lifecycle.stage", target: docRef.path, from, to: input.to, createdAt: now });
    return { id: docRef.id, from, to: input.to };
  });
}

// ---------- follow-ups ----------

export const followUpSchema = z.object({
  companyId: z.string().min(1).max(40),
  supplierId: z.string().regex(/^SUP-\d{3,}$/),
  note: z.string().trim().min(3, "Catatan minimal 3 karakter").max(1000),
  dueDate: z.string().regex(ISO_DATE_RE).nullish(),
  needsAssistance: z.boolean().optional(),
});

export async function addFollowUp(db: Firestore, caller: Caller, raw: z.infer<typeof followUpSchema>) {
  const actor = actorOf(caller);
  const input = followUpSchema.parse(raw);
  const lcRef = db.doc(`supplier_lifecycle/${lifecycleId(input.companyId, input.supplierId)}`);
  const lc = await lcRef.get();
  if (!lc.exists) throw new AppError("not_found", "Data siklus pemasok tidak ditemukan.", 404);
  if (actor.role === "customer_success" && lc.data()!.csId !== actor.csId) throw new AppError("forbidden", "Pemasok ini bukan portofolio Anda.", 403);
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("cs_followups").doc();
  const batch = db.batch();
  batch.create(ref, {
    lifecycleId: lcRef.id, companyId: input.companyId, supplierId: input.supplierId, supplierName: lc.data()!.supplierName ?? null,
    csId: lc.data()!.csId ?? null, note: input.note, dueDate: input.dueDate ?? null, done: false, createdBy: caller.uid, createdAt: now,
  });
  batch.update(lcRef, {
    nextFollowUpAt: input.dueDate ?? lc.data()!.nextFollowUpAt ?? null,
    ...(input.needsAssistance != null ? { needsAssistance: input.needsAssistance } : {}), updatedAt: now,
  });
  await batch.commit();
  return { id: ref.id };
}

// ---------- company subscription (separate from supplier stage) ----------

export const companySubSchema = z.object({
  companyId: z.string().regex(/^CMP-[A-Z0-9]+$/),
  status: z.enum(["trial", "awaiting_activation", "active_subscription", "renewal_due", "renewed", "expired"]),
  isNewCompany: z.boolean().optional(),
  trialYear: z.number().int().min(2026).max(2040).optional(),
  confirmation: stageSchema.shape.confirmation,
});

export async function setCompanySubscription(db: Firestore, caller: Caller, raw: z.infer<typeof companySubSchema>) {
  requireAdmin(caller);
  const input = companySubSchema.parse(raw);
  const company = await db.doc(`companies/${input.companyId}`).get();
  if (!company.exists) throw new AppError("not_found", "Perusahaan tidak ditemukan.", 404);
  const ref = db.doc(`company_subscriptions/${input.companyId}`);
  return db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    const from = (cur?.status as LifecycleStage | undefined) ?? null;
    if (from && from !== input.status && !canTransition(from, input.status)) throw new AppError("bad_transition", `Tidak dapat berpindah dari ${from} ke ${input.status}.`, 409);
    const now = FieldValue.serverTimestamp();
    const data: Record<string, unknown> = { companyId: input.companyId, status: input.status, basis: "actual", updatedAt: now };
    if (!cur) data.createdAt = now;
    if (input.isNewCompany != null) data.isNewCompany = input.isNewCompany;
    if (input.status === "trial") {
      const y = input.trialYear ?? cur?.trialYear;
      if (!y) throw new AppError("trial_year_required", "Tahun trial wajib diisi.", 400);
      const w = trialWindow(y);
      Object.assign(data, { trialYear: y, trialStart: w.start, trialEnd: w.end, isNewCompany: input.isNewCompany ?? cur?.isNewCompany ?? true });
    }
    if (NEEDS_CONFIRMATION.includes(input.status)) {
      const c = input.confirmation;
      if (!c) throw new AppError("confirmation_required", "Status berbayar membutuhkan konfirmasi (nomor referensi dan tanggal kontrak).", 400);
      if (c.contractEnd <= c.contractStart) throw new AppError("bad_dates", "Tanggal akhir kontrak harus setelah tanggal mulai.", 400);
      Object.assign(data, { contractStart: c.contractStart, contractEnd: c.contractEnd, renewalDate: c.contractEnd,
        confirmation: { reference: c.reference, confirmedBy: caller.uid, confirmedAt: now } });
    }
    tx.set(ref, data, { merge: true });
    tx.create(db.collection("audit_logs").doc(), { actorUid: caller.uid, action: "company.subscription", target: ref.path, from, to: input.status, createdAt: now });
    return { companyId: input.companyId, from, to: input.status };
  });
}

export const followUpDoneSchema = z.object({ id: z.string().min(1).max(64) });

export async function completeFollowUp(db: Firestore, caller: Caller, raw: z.infer<typeof followUpDoneSchema>) {
  const actor = actorOf(caller);
  const { id } = followUpDoneSchema.parse(raw);
  const ref = db.doc(`cs_followups/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError("not_found", "Tindak lanjut tidak ditemukan.", 404);
  if (actor.role === "customer_success" && snap.data()!.csId !== actor.csId) throw new AppError("forbidden", "Bukan portofolio Anda.", 403);
  await ref.update({ done: true, doneBy: caller.uid, doneAt: FieldValue.serverTimestamp() });
  return { id };
}
