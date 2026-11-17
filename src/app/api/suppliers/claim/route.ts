import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { claimSupplier, claimSupplierSchema } from "@/server/suppliers";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    const input = claimSupplierSchema.parse(await req.json());
    return NextResponse.json(await claimSupplier(getAdminDb(), getAdminAuth(), caller, input));
  } catch (err) {
    return handleError(err);
  }
}
