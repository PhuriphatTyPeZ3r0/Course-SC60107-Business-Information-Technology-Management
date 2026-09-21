import { NextResponse } from "next/server";
import { updateActionItemStatus } from "@/lib/server/mockStore";
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

  if (!meetingId || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "meetingId and a valid status are required" }, { status: 400 });
  }

  const item = updateActionItemStatus(meetingId, id, status);
  if (!item) {
    return NextResponse.json({ error: "Action item not found" }, { status: 404 });
  }

  return NextResponse.json({ actionItem: item });
}
