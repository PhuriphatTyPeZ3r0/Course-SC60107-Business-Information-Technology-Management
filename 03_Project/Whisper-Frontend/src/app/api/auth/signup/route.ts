import { NextResponse } from "next/server";

// Mock auth: signup always succeeds and logs the user in immediately.
// Replace with a real POST to the Worker's user-creation endpoint later.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.displayName) {
    return NextResponse.json(
      { error: "Email and display name are required" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    token: `mock-token-${Date.now()}`,
    user: { id: `user_${Date.now()}`, email: body.email, displayName: body.displayName },
  });
}
