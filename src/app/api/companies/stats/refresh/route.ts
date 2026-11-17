import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { refreshCompanyStats } from "@/server/company";
import { handleError, requireCaller } from "@/server/http";

export async function POST(req: Request) {
  try {
    return NextResponse.json(await refreshCompanyStats(getAdminDb(), await requireCaller(req)));
  } catch (err) {
    return handleError(err);
  }
}
