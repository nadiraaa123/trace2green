import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { periodSchema, submitReport } from "@/server/reports";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    const { period } = periodSchema.parse(await req.json());
    return NextResponse.json(await submitReport(adminDb, caller, period));
  } catch (err) {
    return handleError(err);
  }
}
