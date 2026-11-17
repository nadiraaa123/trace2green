// Privileged supplier identity logic. Runs only on the server with the Admin SDK.
// Kept free of `server-only` so tests can call it against the emulator.
import { createHash, randomBytes } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { formatSupplierId } from "@/lib/constants";
import type { DataSource } from "@/lib/types";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const phone = z
  .string()
  .trim()
  .regex(/^(\+62|62|0)8\d{7,12}$/, "Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)");

export const registerSupplierSchema = z.object({
  picName: z.string().trim().min(2, "Nama penanggung jawab wajib diisi").max(80),
  businessName: z.string().trim().min(2, "Nama usaha wajib diisi").max(120),
  whatsapp: phone,
  privacyConsent: z.literal(true, { message: "Persetujuan privasi wajib dicentang" }),
});

export const claimSupplierSchema = z.object({
  inviteCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/, "Kode undangan harus 8 karakter"),
  picName: z.string().trim().min(2).max(80),
  whatsapp: phone,
  privacyConsent: z.literal(true, { message: "Persetujuan privasi wajib dicentang" }),
});

export const hashInvite = (code: string) =>
  createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

interface Caller {
  uid: string;
  email: string | null;
  claims: Record<string, unknown>;
}

function assertNotOtherRole(caller: Caller) {
  const role = caller.claims.role;
  if (role && role !== "supplier") {
    throw new AppError("role_conflict", "Akun ini bukan akun pemasok.", 403);
  }
}

/**
 * Creates a new supplier profile for a freshly registered Firebase user.
 * Idempotent per uid: a second call returns the existing supplier and never
 * creates another one, so re-login or a retried request cannot inflate counts.
 */
export async function registerSupplier(
  db: Firestore,
  auth: Auth,
  caller: Caller,
  input: z.infer<typeof registerSupplierSchema>,
  dataSource: DataSource = "trial",
) {
  assertNotOtherRole(caller);
  const userRef = db.doc(`users/${caller.uid}`);
  const counterRef = db.doc("meta/counters");

  const result = await db.runTransaction(async (tx) => {
    const [userSnap, counterSnap] = await Promise.all([tx.get(userRef), tx.get(counterRef)]);
    const existing = userSnap.data();
    if (existing?.supplierId) {
      return { supplierId: existing.supplierId as string, created: false };
    }
    const next = (counterSnap.data()?.nextSupplierNumber as number | undefined) ?? 101;
    const supplierId = formatSupplierId(next);
    const supplierRef = db.doc(`suppliers/${supplierId}`);
    const supplierSnap = await tx.get(supplierRef);
    if (supplierSnap.exists) {
      // Counter out of sync with data: fail loudly rather than overwrite a supplier.
      throw new AppError("id_collision", `Supplier ID ${supplierId} sudah dipakai`, 409);
    }
    const now = FieldValue.serverTimestamp();
    tx.set(counterRef, { nextSupplierNumber: next + 1 }, { merge: true });
    tx.set(supplierRef, {
      supplierId,
      businessName: input.businessName,
      picName: input.picName,
      whatsapp: input.whatsapp,
      sector: null,
      region: null,
      mainProduct: null,
      employees: null,
      ownerUid: caller.uid,
      claimStatus: "self_registered",
      linkedCompanies: [],
      privacyConsentAt: now,
      dataSource,
      isSimulated: false,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(userRef, {
      uid: caller.uid,
      email: caller.email,
      displayName: input.picName,
      role: "supplier",
      companyId: null,
      supplierId,
      dataSource,
      isSimulated: false,
      createdAt: now,
      updatedAt: now,
    });
    tx.create(db.collection("audit_logs").doc(), {
      actorUid: caller.uid,
      action: "supplier.register",
      target: `suppliers/${supplierId}`,
      dataSource,
      createdAt: now,
    });
    return { supplierId, created: true };
  });

  // Always (re)apply claims so a failure after the transaction self-heals on retry.
  await auth.setCustomUserClaims(caller.uid, { role: "supplier", supplierId: result.supplierId });
  return result;
}

/**
 * Links an authenticated user to an existing (e.g. seeded or company-listed)
 * supplier profile. Requires a single-use invite code issued by a company that
 * has a relationship with that supplier. Name matching is never used.
 */
export async function claimSupplier(
  db: Firestore,
  auth: Auth,
  caller: Caller,
  input: z.infer<typeof claimSupplierSchema>,
) {
  assertNotOtherRole(caller);
  const inviteRef = db.doc(`supplier_invites/${hashInvite(input.inviteCode)}`);
  const userRef = db.doc(`users/${caller.uid}`);

  const supplierId = await db.runTransaction(async (tx) => {
    const [inviteSnap, userSnap] = await Promise.all([tx.get(inviteRef), tx.get(userRef)]);
    if (!inviteSnap.exists) throw new AppError("invite_invalid", "Kode undangan tidak ditemukan.", 404);
    const invite = inviteSnap.data()!;
    if (invite.usedByUid) throw new AppError("invite_used", "Kode undangan sudah dipakai.", 409);
    if ((invite.expiresAt as Timestamp).toMillis() < Date.now()) {
      throw new AppError("invite_expired", "Kode undangan sudah kedaluwarsa.", 410);
    }
    if (userSnap.data()?.supplierId) {
      throw new AppError("already_linked", "Akun ini sudah terhubung ke profil pemasok lain.", 409);
    }
    const supplierRef = db.doc(`suppliers/${invite.supplierId}`);
    const supplierSnap = await tx.get(supplierRef);
    if (!supplierSnap.exists) throw new AppError("supplier_missing", "Profil pemasok tidak ditemukan.", 404);
    if (supplierSnap.data()!.ownerUid) {
      throw new AppError("already_claimed", "Profil pemasok ini sudah diklaim.", 409);
    }
    const now = FieldValue.serverTimestamp();
    tx.update(supplierRef, {
      ownerUid: caller.uid,
      claimStatus: "claimed",
      picName: input.picName,
      whatsapp: input.whatsapp,
      privacyConsentAt: now,
      updatedAt: now,
    });
    tx.update(inviteRef, { usedByUid: caller.uid, usedAt: now });
    tx.set(userRef, {
      uid: caller.uid,
      email: caller.email,
      displayName: input.picName,
      role: "supplier",
      companyId: null,
      supplierId: invite.supplierId,
      dataSource: supplierSnap.data()!.dataSource,
      isSimulated: false,
      createdAt: now,
      updatedAt: now,
    });
    tx.create(db.collection("audit_logs").doc(), {
      actorUid: caller.uid,
      action: "supplier.claim",
      target: `suppliers/${invite.supplierId}`,
      inviteCompanyId: invite.companyId,
      dataSource: supplierSnap.data()!.dataSource,
      createdAt: now,
    });
    return invite.supplierId as string;
  });

  await auth.setCustomUserClaims(caller.uid, { role: "supplier", supplierId });
  return { supplierId };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateInviteCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Company admin issues a single-use code for a supplier it is related to. */
export async function createInvite(
  db: Firestore,
  caller: Caller,
  supplierId: string,
  ttlDays = 14,
) {
  const companyId = caller.claims.companyId as string | undefined;
  if (caller.claims.role !== "company_admin" || !companyId) {
    throw new AppError("forbidden", "Hanya admin perusahaan yang dapat membuat undangan.", 403);
  }
  const rel = await db.doc(`company_supplier_relationships/${companyId}_${supplierId}`).get();
  if (!rel.exists) throw new AppError("not_related", "Pemasok ini tidak terhubung dengan perusahaan Anda.", 403);
  const supplier = await db.doc(`suppliers/${supplierId}`).get();
  if (supplier.data()?.ownerUid) throw new AppError("already_claimed", "Profil pemasok ini sudah diklaim.", 409);

  const code = generateInviteCode();
  await db.doc(`supplier_invites/${hashInvite(code)}`).create({
    supplierId,
    companyId,
    createdByUid: caller.uid,
    expiresAt: Timestamp.fromMillis(Date.now() + ttlDays * 86_400_000),
    usedByUid: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { code, supplierId, expiresInDays: ttlDays };
}
