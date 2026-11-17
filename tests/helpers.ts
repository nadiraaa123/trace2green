import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { emptyActivity, emptyProfile } from "@/lib/report";

export const PROJECT = "demo-trace2green";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Run via `npm test` so the Firebase emulators are started.");
}
const app = getApps().find((a) => a.name === "helpers") ?? initializeApp({ projectId: PROJECT }, "helpers");
export const db = getFirestore(app);
export const auth = getAuth(app);

export async function resetEmulators() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

export const companyCaller = (companyId: string) => ({ uid: `admin-${companyId}`, email: null, claims: { role: "company_admin", companyId } });
export const supplierCaller = (uid: string, supplierId: string) => ({ uid, email: null, claims: { role: "supplier", supplierId } });

/** Writes a draft the same shape the wizard creates (rules-valid). */
export async function writeDraft(supplierId: string, period: string, over: { profile?: object; activity?: object } = {}) {
  const rid = `${supplierId}_${period}`;
  await db.doc(`monthly_reports/${rid}`).set({
    reportId: rid, supplierId, period, status: "draft",
    profile: { ...emptyProfile(), ...over.profile }, activity: { ...emptyActivity(), ...over.activity },
    draftStep: 1, version: 0, sharedWith: [], submittedAt: null, dataSource: "trial", isSimulated: false,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return rid;
}
