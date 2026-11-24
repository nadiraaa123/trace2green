import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { setSupplierStage } from "@/server/lifecycle";

// Internal (Platform Admin / Customer Success). Authorization is enforced in setSupplierStage.
export async function POST(req: Request) {
  try {
    return NextResponse.json(await setSupplierStage(getAdminDb(), await requireCaller(req), await req.json()));
  } catch (err) {
    return handleError(err);
  }
}
