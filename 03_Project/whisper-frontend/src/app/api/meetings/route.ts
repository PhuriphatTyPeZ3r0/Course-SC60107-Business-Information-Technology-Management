import { NextResponse } from "next/server";
import { createMeeting, listMeetings } from "@/lib/server/mockStore";

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
  const meeting = createMeeting({ title, sourceFileName });

  return NextResponse.json({ meeting }, { status: 201 });
}
