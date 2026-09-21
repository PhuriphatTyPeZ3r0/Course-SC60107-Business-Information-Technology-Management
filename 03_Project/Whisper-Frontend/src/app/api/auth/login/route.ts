import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/server/mockStore";

// Mock auth: any email/password combination succeeds. This exists so the
// full app shell (login screen, protected routes) can be demoed before the
// real Cloudflare-backed auth is built. Replace with a real credential
// check against tbl_user_account once the Worker API exists.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  return NextResponse.json({
    token: `mock-token-${Date.now()}`,
    user: { ...DEMO_USER, email: body.email },
  });
}
