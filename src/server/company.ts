// Company-admin endpoints that need server reads (data clients may not read directly).
import type { Auth } from "firebase-admin/auth";
import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { recomputeCompanyAll } from "./stats";
import { AppError } from "./suppliers";

interface Caller { uid: string; email: string | null; claims: Record<string, unknown> }

export function requireCompany(caller: Caller): string {
  const cid = caller.claims.companyId;
  if (caller.claims.role !== "company_admin" || typeof cid !== "string") throw new AppError("forbidden", "Hanya admin perusahaan.", 403);
  return cid;
}

export async function refreshCompanyStats(db: Firestore, caller: Caller) {
  const cid = requireCompany(caller);
  return { companyId: cid, summariesWritten: await recomputeCompanyAll(db, cid) };
}

const iso = (t: unknown) => (t && typeof t === "object" && "toDate" in t ? (t as Timestamp).toDate().toISOString() : null);

/** Invite metadata only: codes are stored hashed and are shown once at creation. */
export async function listInvites(db: Firestore, caller: Caller) {
  const cid = requireCompany(caller);
  const snap = await db.collection("supplier_invites").where("companyId", "==", cid).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      type: x.type ?? (x.supplierId ? "claim" : "connect"), supplierId: x.supplierId ?? null,
      createdAt: iso(x.createdAt), expiresAt: iso(x.expiresAt), used: !!x.usedByUid, usedAt: iso(x.usedAt),
    };
  }).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function listCompanyUsers(db: Firestore, auth: Auth, caller: Caller) {
  const cid = requireCompany(caller);
  const snap = await db.collection("users").where("companyId", "==", cid).get();
  const users = await Promise.all(snap.docs.map(async (d) => {
    const u = d.data();
    // Claims are the source of truth for permissions; the users doc is display data.
    const claims = (await auth.getUser(d.id).catch(() => null))?.customClaims ?? {};
    return { email: u.email, displayName: u.displayName, role: claims.role ?? u.role, canVerify: claims.canVerify === true };
  }));
  return users.sort((a, b) => String(a.email).localeCompare(String(b.email)));
}
