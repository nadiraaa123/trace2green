import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAdminAuth } from "@/lib/firebase/admin";
import { AppError } from "./suppliers";

/** Verifies the Firebase ID token from `Authorization: Bearer <token>`. */
export async function requireCaller(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError("unauthenticated", "Silakan masuk terlebih dahulu.", 401);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const { uid, email, ...claims } = decoded;
    return { uid, email: email ?? null, claims: claims as Record<string, unknown> };
  } catch {
    throw new AppError("unauthenticated", "Sesi tidak valid. Silakan masuk ulang.", 401);
  }
}

export function handleError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "invalid_input", message: err.issues[0]?.message ?? "Data tidak valid", issues: err.issues },
      { status: 400 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "internal", message: "Terjadi kesalahan server." }, { status: 500 });
}
