// Admin SDK for CLI scripts (seed, provisioning). Emulator if FIRESTORE_EMULATOR_HOST is set.
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID || "demo-trace2green";
if (!getApps().length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId });
  } else {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error("Set FIRESTORE_EMULATOR_HOST or FIREBASE_SERVICE_ACCOUNT_KEY");
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    initializeApp({ credential: cert(json), projectId: json.project_id });
  }
}
export const db = getFirestore();
export const auth = getAuth();
export const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator (${projectId})` : `PRODUCTION project`;
