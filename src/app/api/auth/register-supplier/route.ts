import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { registerSupplier, registerSupplierSchema } from "@/server/suppliers";

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    const input = registerSupplierSchema.parse(await req.json());
    const result = await registerSupplier(getAdminDb(), getAdminAuth(), caller, input, "trial");
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return handleError(err);
  }
}
