import { NextResponse } from "next/server";
import { getUsageStatus } from "@/lib/server/mockStore";

export async function GET() {
  return NextResponse.json({ usage: getUsageStatus() });
}
