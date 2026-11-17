// Supplier identity integration tests (Tests A, B partial and E) — Admin SDK on emulator.
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import {
  claimSupplier,
  createInvite,
  registerSupplier,
} from "@/server/suppliers";

const PROJECT = "demo-trace2green";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Run via `npm test` so the Firebase emulators are started.");
}
const app = getApps().find((a) => a.name === "identity") ?? initializeApp({ projectId: PROJECT }, "identity");
const db = getFirestore(app);
const auth = getAuth(app);

async function resetEmulators() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

async function seedHundredSuppliers() {
  const batch = db.batch();
  for (let i = 1; i <= 100; i++) {
    const id = `SUP-${String(i).padStart(3, "0")}`;
    const companyId = i <= 50 ? "CMP-A" : "CMP-B";
    batch.set(db.doc(`suppliers/${id}`), {
      supplierId: id, businessName: `Pemasok ${String(i).padStart(2, "0")}`, ownerUid: null,
      claimStatus: "unclaimed", linkedCompanies: [companyId], dataSource: "demo", isSimulated: true,
    });
    batch.set(db.doc(`company_supplier_relationships/${companyId}_${id}`), { companyId, supplierId: id });
  }
  batch.set(db.doc("meta/counters"), { nextSupplierNumber: 101 });
  await batch.commit();
}

async function newUser(email: string) {
  const u = await auth.createUser({ email, password: "rahasia123" });
  return { uid: u.uid, email, claims: {} as Record<string, unknown> };
}

const supplierCount = async () => (await db.collection("suppliers").count().get()).data().count;
const profile = { picName: "Siti Aminah", businessName: "Kue Bu Siti", whatsapp: "081234567890", privacyConsent: true as const };
const companyA = { uid: "adminA", email: "a@mitra.test", claims: { role: "company_admin", companyId: "CMP-A" } };
const companyB = { uid: "adminB", email: "b@mitra.test", claims: { role: "company_admin", companyId: "CMP-B" } };

beforeEach(async () => {
  await resetEmulators();
  await seedHundredSuppliers();
});

describe("Test A — new supplier registration", () => {
  it("creates exactly one new supplier (100 → 101) with SUP-101 and sets claims", async () => {
    expect(await supplierCount()).toBe(100);
    const caller = await newUser("siti@umkm.test");
    const res = await registerSupplier(db, auth, caller, profile);
    expect(res).toEqual({ supplierId: "SUP-101", created: true });
    expect(await supplierCount()).toBe(101);
    const s = (await db.doc("suppliers/SUP-101").get()).data()!;
    expect(s.ownerUid).toBe(caller.uid);
    expect(s.dataSource).toBe("trial");
    expect(s.sector).toBeNull(); // not invented
    expect((await auth.getUser(caller.uid)).customClaims).toEqual({ role: "supplier", supplierId: "SUP-101" });
    const logs = await db.collection("audit_logs").where("action", "==", "supplier.register").get();
    expect(logs.size).toBe(1);
  });
});

describe("Test B — existing supplier logs in again", () => {
  it("repeated registration calls never create a second profile", async () => {
    const caller = await newUser("siti@umkm.test");
    await registerSupplier(db, auth, caller, profile);
    const again = await registerSupplier(db, auth, caller, profile);
    expect(again).toEqual({ supplierId: "SUP-101", created: false });
    expect(await supplierCount()).toBe(101);
  });
  it("concurrent duplicate requests still create one profile", async () => {
    const caller = await newUser("dobel@umkm.test");
    const results = await Promise.all([1, 2, 3].map(() => registerSupplier(db, auth, caller, profile)));
    expect(new Set(results.map((r) => r.supplierId)).size).toBe(1);
    expect(await supplierCount()).toBe(101);
  });
  it("two different new suppliers get distinct sequential IDs", async () => {
    const [a, b] = await Promise.all([newUser("a@umkm.test"), newUser("b@umkm.test")]);
    const ra = await registerSupplier(db, auth, a, profile);
    const rb = await registerSupplier(db, auth, b, { ...profile, businessName: "Kue Bu Siti" }); // same name on purpose
    expect(ra.supplierId).not.toBe(rb.supplierId);
    expect(await supplierCount()).toBe(102);
  });
  it("a company admin cannot register as a supplier", async () => {
    await expect(registerSupplier(db, auth, companyA, profile)).rejects.toMatchObject({ code: "role_conflict" });
  });
});

describe("Test E — seeded supplier claiming", () => {
  it("a random user cannot claim a seeded supplier without a valid invite", async () => {
    const caller = await newUser("rnd@umkm.test");
    await expect(
      claimSupplier(db, auth, caller, { inviteCode: "ABCDEFGH", picName: "X Y", whatsapp: "081234567890", privacyConsent: true }),
    ).rejects.toMatchObject({ code: "invite_invalid" });
    expect((await db.doc("suppliers/SUP-010").get()).data()!.ownerUid).toBeNull();
  });
  it("a company cannot issue invites for another company's supplier", async () => {
    await expect(createInvite(db, companyB, "SUP-010")).rejects.toMatchObject({ code: "not_related" });
    const fakeSupplier = { uid: "s", email: null, claims: { role: "supplier", supplierId: "SUP-010" } };
    await expect(createInvite(db, fakeSupplier, "SUP-010")).rejects.toMatchObject({ code: "forbidden" });
  });
  it("valid invite links exactly one account; code is single-use; count unchanged", async () => {
    const { code } = await createInvite(db, companyA, "SUP-010");
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    const stored = await db.collection("supplier_invites").get();
    expect(stored.docs[0].id).not.toContain(code); // only the hash is stored

    const owner = await newUser("pemilik10@umkm.test");
    const res = await claimSupplier(db, auth, owner, { inviteCode: code.toLowerCase(), picName: "Budi", whatsapp: "081298765432", privacyConsent: true });
    expect(res.supplierId).toBe("SUP-010");
    const s = (await db.doc("suppliers/SUP-010").get()).data()!;
    expect(s.ownerUid).toBe(owner.uid);
    expect(s.claimStatus).toBe("claimed");
    expect(await supplierCount()).toBe(100);
    expect((await auth.getUser(owner.uid)).customClaims).toEqual({ role: "supplier", supplierId: "SUP-010" });

    const intruder = await newUser("intruder@umkm.test");
    await expect(
      claimSupplier(db, auth, intruder, { inviteCode: code, picName: "Mal", whatsapp: "081211112222", privacyConsent: true }),
    ).rejects.toMatchObject({ code: "invite_used" });
    await expect(createInvite(db, companyA, "SUP-010")).rejects.toMatchObject({ code: "already_claimed" });
  });
  it("an account already linked to a supplier cannot claim a second one", async () => {
    const caller = await newUser("punya@umkm.test");
    await registerSupplier(db, auth, caller, profile);
    const { code } = await createInvite(db, companyA, "SUP-011");
    await expect(
      claimSupplier(db, auth, caller, { inviteCode: code, picName: "Siti", whatsapp: "081234567890", privacyConsent: true }),
    ).rejects.toMatchObject({ code: "already_linked" });
  });
  it("expired invites are rejected", async () => {
    const { code } = await createInvite(db, companyA, "SUP-012", -1);
    const caller = await newUser("telat@umkm.test");
    await expect(
      claimSupplier(db, auth, caller, { inviteCode: code, picName: "Telat", whatsapp: "081234567890", privacyConsent: true }),
    ).rejects.toMatchObject({ code: "invite_expired" });
  });
});

