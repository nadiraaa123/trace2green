"use client";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

/** False when the deployment has no Firebase web config (e.g. Vercel env vars not set yet). */
export const firebaseConfigured = useEmulator || !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

const config: FirebaseOptions = {
  // A placeholder keeps getAuth() from throwing at import/prerender time when the
  // config is missing; every call then fails at runtime and the UI shows a notice.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (useEmulator ? "demo-key" : "firebase-config-missing"),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-trace2green",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);

const g = globalThis as unknown as { __t2gEmu?: boolean };
if (useEmulator && typeof window !== "undefined" && !g.__t2gEmu) {
  g.__t2gEmu = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
