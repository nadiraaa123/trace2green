import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Server-only Admin SDK, initialised lazily on first use (never at import time),
 * so `next build` succeeds without credentials and a missing key surfaces as a
 * clear runtime error on the API call instead of a build failure.
 * Emulator when FIRESTORE_EMULATOR_HOST is set, otherwise a service account from
 * FIREBASE_SERVICE_ACCOUNT_KEY (base64 JSON). Never import this from client code.
 */
function init(): App {
  if (getApps().length) return getApp();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "demo-trace2green";
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId });
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not configured");
  const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  return initializeApp({ credential: cert(json), projectId: json.project_id });
}

export const getAdminDb = (): Firestore => getFirestore(init());
export const getAdminAuth = (): Auth => getAuth(init());
