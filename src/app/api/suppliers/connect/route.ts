import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { connectSchema, connectWithInvite } from "@/server/sharing";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    return NextResponse.json(await connectWithInvite(getAdminDb(), caller, connectSchema.parse(await req.json())));
  } catch (err) {
    return handleError(err);
  }
}
