import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { completeFollowUp } from "@/server/lifecycle";

// Internal (Platform Admin / Customer Success). Authorization is enforced in completeFollowUp.
export async function POST(req: Request) {
  try {
    return NextResponse.json(await completeFollowUp(getAdminDb(), await requireCaller(req), await req.json()));
  } catch (err) {
    return handleError(err);
  }
}
