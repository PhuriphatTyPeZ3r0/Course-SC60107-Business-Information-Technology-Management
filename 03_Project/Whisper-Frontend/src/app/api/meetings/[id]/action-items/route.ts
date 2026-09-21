import { NextResponse } from "next/server";
import { createActionItem } from "@/lib/server/mockStore";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!description) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  const actionItem = createActionItem(id, {
    description,
    assigneeName: typeof body?.assigneeName === "string" ? body.assigneeName.trim() || null : null,
    dueDate: typeof body?.dueDate === "string" ? body.dueDate : null,
  });
  if (!actionItem) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  return NextResponse.json({ actionItem }, { status: 201 });
}
