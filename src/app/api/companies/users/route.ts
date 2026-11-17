import { connection, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { listCompanyUsers } from "@/server/company";
import { handleError, requireCaller } from "@/server/http";

export async function GET(req: Request) {
  await connection(); // request-time only: never prerender an authenticated endpoint
  try {
    return NextResponse.json({ users: await listCompanyUsers(getAdminDb(), getAdminAuth(), await requireCaller(req)) });
  } catch (err) {
    return handleError(err);
  }
}
