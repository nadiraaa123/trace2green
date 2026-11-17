import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { correctionSchema, requestCorrection } from "@/server/reports";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await requestCorrection(getAdminDb(), caller, correctionSchema.parse(await req.json())));
  } catch (err) {
    return handleError(err);
  }
}
