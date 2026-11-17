import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { reviewReport } from "@/server/verification";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await reviewReport(adminDb, caller, await req.json()));
  } catch (err) {
    return handleError(err);
  }
}
