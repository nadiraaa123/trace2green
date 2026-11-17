import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { reviewReport } from "@/server/verification";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await reviewReport(getAdminDb(), caller, await req.json()));
  } catch (err) {
    return handleError(err);
  }
}
