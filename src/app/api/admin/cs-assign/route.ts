import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { assignCs } from "@/server/lifecycle";

// Internal (Platform Admin / Customer Success). Authorization is enforced in assignCs.
export async function POST(req: Request) {
  try {
    return NextResponse.json(await assignCs(getAdminDb(), await requireCaller(req), await req.json()));
  } catch (err) {
    return handleError(err);
  }
}
