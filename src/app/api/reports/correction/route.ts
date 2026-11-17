import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { correctionSchema, requestCorrection } from "@/server/reports";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await requestCorrection(adminDb, caller, correctionSchema.parse(await req.json())));
  } catch (err) {
    return handleError(err);
  }
}
