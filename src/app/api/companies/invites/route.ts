import { NextResponse } from "next/server";
import { z } from "zod";
import { SUPPLIER_ID_RE } from "@/lib/constants";
import { adminDb } from "@/lib/firebase/admin";
import { handleError, requireCaller } from "@/server/http";
import { createInvite } from "@/server/suppliers";

// supplierId given → claim invite for that listed supplier; omitted → connect invite.
const schema = z.object({ supplierId: z.string().regex(SUPPLIER_ID_RE).nullish() });

export async function POST(req: Request) {
  try {
    const caller = await requireCaller(req);
    const { supplierId } = schema.parse(await req.json());
    return NextResponse.json(await createInvite(adminDb, caller, supplierId ?? null), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
