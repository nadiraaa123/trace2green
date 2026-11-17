import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { runSheetsSync } from "@/server/sheets";

const schema = z.object({ companyId: z.string().regex(/^CMP-[A-Z0-9]+$/).optional(), force: z.boolean().optional() });

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await runSheetsSync(getAdminDb(), caller, schema.parse(await req.json().catch(() => ({})))));
  } catch (err) {
    return handleError(err);
  }
}
