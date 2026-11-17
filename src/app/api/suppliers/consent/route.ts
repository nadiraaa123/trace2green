import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { consentSchema, setConsent } from "@/server/sharing";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await setConsent(getAdminDb(), caller, consentSchema.parse(await req.json())));
  } catch (err) {
    return handleError(err);
  }
}
