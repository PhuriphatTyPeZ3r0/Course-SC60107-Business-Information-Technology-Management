import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/server/mockStore";

// Real auth is Google OAuth2 only now (see DESIGN_SYSTEM.md 5b), which
// can't work against localhost - the registered redirect_uri is the
// deployed Worker's. This mock route is client.ts's mockGoogleSignIn()
// local-dev shortcut instead: an instant canned session, no real
// credential check, so the app shell is still demoable without Google
// Cloud credentials wired up locally.
export async function POST() {
  return NextResponse.json({
    token: `mock-token-${Date.now()}`,
    user: DEMO_USER,
  });
}
