import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { deleteDraft } from "@/server/drafts";
import { handleError, requireCaller } from "@/server/http";
import { periodSchema } from "@/server/reports";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    const { period } = periodSchema.parse(await req.json());
    return NextResponse.json(await deleteDraft(getAdminDb(), caller, period));
  } catch (err) {
    return handleError(err);
  }
}
