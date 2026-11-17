import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { connectSchema, connectWithInvite } from "@/server/sharing";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await connectWithInvite(adminDb, caller, connectSchema.parse(await req.json())));
  } catch (err) {
    return handleError(err);
  }
}
