import { connection, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError } from "@/server/http";
import { runScheduledSync } from "@/server/sheets";

// Called by Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  await connection(); // request-time only
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runScheduledSync(getAdminDb()));
  } catch (err) {
    return handleError(err);
  }
}
