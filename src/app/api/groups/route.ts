import { NextResponse } from "next/server";
import { guardWriteRequest } from "@/lib/api/write-guard";
import { createGroupSchema } from "@/lib/receipt/schemas";
import { createGroup } from "@/lib/groups/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = guardWriteRequest(request, "groups-create");
  if (blocked) return blocked;

  const parsed = createGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid group payload" }, { status: 400 });
  }

  try {
    const group = await createGroup(parsed.data.name, parsed.data.currency);
    return NextResponse.json({ id: group.id });
  } catch (error) {
    console.error("[groups] create failed", error);
    return NextResponse.json({ error: "Could not create group" }, { status: 500 });
  }
}
