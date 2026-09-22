import { NextResponse } from "next/server";
import { createMeeting, getUsageStatus, listMeetings, MockRateLimitError } from "@/lib/server/mockStore";

export async function GET() {
  return NextResponse.json({ meetings: listMeetings() });
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const title = typeof formData?.get("title") === "string" ? (formData!.get("title") as string).trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const file = formData?.get("file");
  const sourceFileName = file instanceof File ? file.name : null;

  // The mock never actually needs the audio bytes — it simulates the job
  // pipeline with canned Thai transcript/summary content regardless. The
  // real backend (Process/Service.py) reads this same multipart body and
  // actually transcribes it.
  try {
    const meeting = createMeeting({ title, sourceFileName });
    return NextResponse.json({ meeting }, { status: 201 });
  } catch (err) {
    if (err instanceof MockRateLimitError) {
      const message =
        err.reason === "global"
          ? "ระบบเต็มชั่วคราว โควตาการประมวลผลของวันนี้หมดแล้ว กรุณาลองใหม่พรุ่งนี้"
          : "คุณใช้โควตาการประชุมของวันนี้ครบแล้ว กรุณาลองใหม่พรุ่งนี้";
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", reason: err.reason, message }, usage: getUsageStatus() },
        { status: 429 },
      );
    }
    throw err;
  }
}
