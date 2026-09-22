import { NextResponse } from "next/server";
import { getProfile, getUsageStatus, updateDisplayName } from "@/lib/server/mockStore";

export async function GET() {
  return NextResponse.json({ user: getProfile(), usage: getUsageStatus() });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName || displayName.length > 100) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "displayName must be 1-100 characters" } },
      { status: 400 },
    );
  }
  const user = updateDisplayName(displayName);
  return NextResponse.json({ user, usage: getUsageStatus() });
}
