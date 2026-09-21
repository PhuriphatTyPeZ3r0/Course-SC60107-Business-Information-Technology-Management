import { NextResponse } from "next/server";
import { updateActionItem } from "@/lib/server/mockStore";
import type { ActionItemStatus } from "@/lib/types";

const VALID_STATUSES: ActionItemStatus[] = ["open", "in_progress", "done", "cancelled"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const meetingId = typeof body?.meetingId === "string" ? body.meetingId : "";
  const status = body?.status as ActionItemStatus | undefined;

  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const item = updateActionItem(meetingId, id, {
    description: typeof body?.description === "string" ? body.description.trim() : undefined,
    assigneeName:
      body?.assigneeName === undefined
        ? undefined
        : typeof body.assigneeName === "string"
          ? body.assigneeName.trim() || null
          : null,
    dueDate: body?.dueDate === undefined ? undefined : (body.dueDate ?? null),
    status,
  });
  if (!item) {
    return NextResponse.json({ error: "Action item not found" }, { status: 404 });
  }

  return NextResponse.json({ actionItem: item });
}
