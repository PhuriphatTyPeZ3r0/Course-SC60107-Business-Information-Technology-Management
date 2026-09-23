import "server-only";
import type {
  ActionItem,
  Job,
  JobType,
  Meeting,
  MeetingSummaryView,
  Participant,
  SpeakerSegment,
  Team,
  UsageStatus,
  User,
} from "@/lib/types";

// Mirrors the real backend's caps (see Whisper_Cloudflare_API/src/db.ts) so
// the local mock demos the same rate-limit UX without needing a real
// Cloudflare deployment.
const PERSONAL_DAILY_LIMIT = 2;
const GLOBAL_DAILY_LIMIT = 6;

// In-memory mock backend. Lives for the lifetime of the Next.js dev/server
// process — good enough to demo the full flow locally (see the "local dev
// is enough for the 3-day deadline" decision). Once the real Cloudflare
// Worker API exists, swap NEXT_PUBLIC_API_BASE_URL and delete this file;
// the route handlers in app/api/** are the only thing that import it.

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const DEMO_USER: User = {
  id: "user_demo",
  email: "demo@whisper.app",
  displayName: "Demo User",
  avatarUrl: null,
};

export const DEMO_TEAM: Team = {
  id: "team_demo",
  name: "ทีมผลิตภัณฑ์ (Product Team)",
};

const PARTICIPANTS: Participant[] = [
  { id: "p1", displayName: "คุณสมชาย ใจดี", speakerLabel: "SPEAKER_1" },
  { id: "p2", displayName: "คุณสมหญิง รักงาน", speakerLabel: "SPEAKER_2" },
  { id: "p3", displayName: "คุณวิชัย มั่นคง", speakerLabel: "SPEAKER_3" },
];

const TRANSCRIPT_LINES: Array<{ speaker: number; text: string; durationMs: number }> = [
  { speaker: 0, text: "สวัสดีครับทุกคน วันนี้เรามาสรุปความคืบหน้าของโปรเจกต์กัน", durationMs: 4200 },
  { speaker: 1, text: "ทีมออกแบบทำหน้าจอหลักเสร็จแล้วค่ะ กำลังรอฟีดแบ็กจากทีมพัฒนา", durationMs: 4800 },
  { speaker: 2, text: "ฝั่ง backend ผมเจอปัญหาเรื่อง VRAM ตอนรันโมเดลตัวใหญ่ กำลังแก้อยู่ครับ", durationMs: 5100 },
  { speaker: 0, text: "โอเค งั้นเราลด scope เรื่องนั้นไปก่อน แล้วโฟกัสที่ demo วันศุกร์นี้แทน", durationMs: 4600 },
  { speaker: 1, text: "รับทราบค่ะ ดิฉันจะอัปเดตหน้า dashboard ให้เสร็จภายในพรุ่งนี้", durationMs: 4300 },
  { speaker: 2, text: "ผมจะส่ง API endpoint ให้ทีม frontend ทดสอบภายในบ่ายวันนี้ครับ", durationMs: 4400 },
  { speaker: 0, text: "เยี่ยมเลยครับ งั้นสรุปนัดถัดไปวันพฤหัสบดี บ่ายสองโมงนะครับ", durationMs: 4000 },
];

function buildTranscriptSegments(): SpeakerSegment[] {
  let cursor = 0;
  return TRANSCRIPT_LINES.map((line, index) => {
    const start = cursor;
    const end = start + line.durationMs;
    cursor = end + 600;
    return {
      id: `seg_${index}`,
      speakerLabel: PARTICIPANTS[line.speaker].speakerLabel,
      startTimeMs: start,
      endTimeMs: end,
      text: line.text,
    };
  });
}

// DEF-005: mirrors the markdown-lite shape the real summarize prompt now
// asks for (see Whisper_Cloudflare_API/src/pipeline.ts), so local dev
// previews the fixed formatting instead of the old run-on paragraph.
const SUMMARY_TEXT = `**สรุปโดยย่อ**
ทีมรายงานความคืบหน้า 3 ด้าน ได้แก่ UI หน้าหลัก ฝั่ง backend และแผนเตรียม demo โดยตกลงโฟกัสที่การเตรียม demo ให้ทันวันศุกร์

**ประเด็นสำคัญ**
- UI หน้าหลักเสร็จแล้ว อยู่ระหว่างรอฟีดแบ็ก
- ฝั่ง backend พบปัญหา VRAM ระหว่างรันโมเดลขนาดใหญ่ ตัดสินใจลด scope ชั่วคราว

**ข้อสรุปหรือมติ**
- ทีมตกลงโฟกัสที่การเตรียม demo ให้ทันวันศุกร์

**สิ่งที่ต้องดำเนินการ**
- นัดประชุมติดตามผล — ทีมทั้งหมด — วันพฤหัสบดี เวลา 14:00 น.`;

function buildActionItems(meetingId: string): ActionItem[] {
  return [
    {
      id: makeId("action"),
      meetingId,
      description: "อัปเดตหน้า dashboard ให้เสร็จสมบูรณ์",
      assigneeName: PARTICIPANTS[1].displayName,
      dueDate: null,
      status: "open",
    },
    {
      id: makeId("action"),
      meetingId,
      description: "ส่ง API endpoint ให้ทีม frontend ทดสอบ",
      assigneeName: PARTICIPANTS[2].displayName,
      dueDate: null,
      status: "open",
    },
    {
      id: makeId("action"),
      meetingId,
      description: "เตรียม demo สำหรับวันศุกร์",
      assigneeName: PARTICIPANTS[0].displayName,
      dueDate: null,
      status: "in_progress",
    },
  ];
}

// Stage timings (ms from meeting creation) for the simulated async pipeline.
const STAGE_TIMELINE: Record<JobType, { startAt: number; endAt: number }> = {
  transcribe: { startAt: 400, endAt: 2600 },
  diarize: { startAt: 2600, endAt: 4000 },
  summarize: { startAt: 4000, endAt: 6400 },
};

function makeJobs(meetingId: string, createdAtMs: number): Job[] {
  const queuedAt = new Date(createdAtMs).toISOString();
  return (["transcribe", "diarize", "summarize"] as JobType[]).map((jobType) => ({
    id: makeId("job"),
    meetingId,
    jobType,
    status: "queued" as const,
    queuedAt,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
  }));
}

/**
 * Derives job/meeting/transcript/summary state from wall-clock time instead
 * of timers, so simulated progress survives Next.js route-handler
 * invocations and hot reloads without needing a persistent setTimeout.
 */
function materialize(meeting: Meeting): Meeting {
  const createdAtMs = new Date(meeting.createdAt).getTime();
  const elapsed = Date.now() - createdAtMs;

  const jobs = meeting.jobs.map((job) => {
    const stage = STAGE_TIMELINE[job.jobType];
    let status: Job["status"] = "queued";
    let startedAt: string | null = null;
    let completedAt: string | null = null;

    if (elapsed >= stage.endAt) {
      status = "completed";
      startedAt = new Date(createdAtMs + stage.startAt).toISOString();
      completedAt = new Date(createdAtMs + stage.endAt).toISOString();
    } else if (elapsed >= stage.startAt) {
      status = "running";
      startedAt = new Date(createdAtMs + stage.startAt).toISOString();
    }

    return { ...job, status, startedAt, completedAt };
  });

  const transcribeDone = jobs.find((j) => j.jobType === "transcribe")?.status === "completed";
  const summarizeDone = jobs.find((j) => j.jobType === "summarize")?.status === "completed";

  // Jobs never fail in this mock (no random-failure simulation — see the
  // grilling-session decision to keep the demo pipeline predictable).
  const status: Meeting["status"] = summarizeDone ? "completed" : "processing";

  return {
    ...meeting,
    status,
    jobs,
    transcript: transcribeDone ? meeting.transcript : null,
    summary: summarizeDone ? meeting.summary : null,
    actionItems: summarizeDone ? meeting.actionItems : [],
  };
}

interface Store {
  meetings: Map<string, Meeting>;
  displayName: string;
  usageDate: string;
  personalUsed: number;
  globalUsed: number;
}

const globalForStore = globalThis as unknown as { __whisperStore?: Store };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function seedStore(): Store {
  const store: Store = {
    meetings: new Map(),
    displayName: DEMO_USER.displayName,
    usageDate: todayUtc(),
    personalUsed: 0,
    globalUsed: 0,
  };
  const seedMeeting = createMeetingInternal(store, {
    title: "ประชุมทีมผลิตภัณฑ์ประจำสัปดาห์",
    sourceFileName: "weekly-sync-2026-09-18.wav",
    backdateMs: 6_400 + 1000, // already fully "completed" on load
  });
  store.meetings.set(seedMeeting.id, seedMeeting);
  return store;
}

function createMeetingInternal(
  store: Store,
  input: { title: string; sourceFileName: string | null; backdateMs?: number },
): Meeting {
  const id = makeId("meeting");
  const createdAtMs = Date.now() - (input.backdateMs ?? 0);
  const createdAt = new Date(createdAtMs).toISOString();
  const jobs = makeJobs(id, createdAtMs);

  const meeting: Meeting = {
    id,
    teamId: DEMO_TEAM.id,
    ownerUserId: DEMO_USER.id,
    title: input.title,
    meetingDate: createdAt,
    languageCode: "th",
    status: "processing",
    createdAt,
    sourceFileName: input.sourceFileName,
    participants: PARTICIPANTS,
    jobs,
    transcript: {
      id: makeId("transcript"),
      fullText: TRANSCRIPT_LINES.map((l) => l.text).join(" "),
      languageCode: "th",
      wordCount: TRANSCRIPT_LINES.reduce((sum, l) => sum + l.text.split(" ").length, 0),
      segments: buildTranscriptSegments(),
    },
    summary: { id: makeId("summary"), text: SUMMARY_TEXT, modelUsed: "llama-3.1-8b-instruct" },
    actionItems: buildActionItems(id),
  };

  return meeting;
}

function getStore(): Store {
  if (!globalForStore.__whisperStore) {
    globalForStore.__whisperStore = seedStore();
  }
  return globalForStore.__whisperStore;
}

export function listMeetings(): MeetingSummaryView[] {
  const store = getStore();
  return [...store.meetings.values()]
    .map(materialize)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m) => ({
      id: m.id,
      title: m.title,
      meetingDate: m.meetingDate,
      status: m.status,
      createdAt: m.createdAt,
      participantCount: m.participants.length,
      actionItemOpenCount: m.actionItems.filter((a) => a.status !== "done").length,
    }));
}

export function getMeeting(id: string): Meeting | null {
  const store = getStore();
  const meeting = store.meetings.get(id);
  return meeting ? materialize(meeting) : null;
}

export class MockRateLimitError extends Error {
  reason: "personal" | "global";
  constructor(reason: "personal" | "global") {
    super(`Rate limited: ${reason}`);
    this.reason = reason;
  }
}

function resetUsageIfNewDay(store: Store) {
  const today = todayUtc();
  if (store.usageDate !== today) {
    store.usageDate = today;
    store.personalUsed = 0;
    store.globalUsed = 0;
  }
}

export function getUsageStatus(): UsageStatus {
  const store = getStore();
  resetUsageIfNewDay(store);
  return {
    personal: { used: store.personalUsed, limit: PERSONAL_DAILY_LIMIT },
    global: { used: store.globalUsed, limit: GLOBAL_DAILY_LIMIT },
  };
}

export function getProfile(): User {
  const store = getStore();
  return { ...DEMO_USER, displayName: store.displayName };
}

export function updateDisplayName(displayName: string): User {
  const store = getStore();
  store.displayName = displayName;
  return { ...DEMO_USER, displayName: store.displayName };
}

export function createMeeting(input: { title: string; sourceFileName: string | null }): Meeting {
  const store = getStore();
  resetUsageIfNewDay(store);
  if (store.globalUsed >= GLOBAL_DAILY_LIMIT) throw new MockRateLimitError("global");
  if (store.personalUsed >= PERSONAL_DAILY_LIMIT) throw new MockRateLimitError("personal");
  store.globalUsed += 1;
  store.personalUsed += 1;

  const meeting = createMeetingInternal(store, input);
  store.meetings.set(meeting.id, meeting);
  return materialize(meeting);
}

export function renameMeeting(id: string, title: string): Meeting | null {
  const store = getStore();
  const meeting = store.meetings.get(id);
  if (!meeting) return null;
  meeting.title = title;
  return materialize(meeting);
}

/** DEF-001: soft delete - mirrors the real backend's deleted_at semantics
 * by just removing it from the mock's in-memory map (no undo needed here,
 * this store isn't persisted anyway). */
export function deleteMeeting(id: string): boolean {
  const store = getStore();
  return store.meetings.delete(id);
}

export function createActionItem(
  meetingId: string,
  input: { description: string; assigneeName: string | null; dueDate: string | null },
): ActionItem | null {
  const store = getStore();
  const meeting = store.meetings.get(meetingId);
  if (!meeting) return null;
  const item: ActionItem = {
    id: makeId("action"),
    meetingId,
    description: input.description,
    assigneeName: input.assigneeName,
    dueDate: input.dueDate,
    status: "open",
  };
  meeting.actionItems.push(item);
  return item;
}

export function updateActionItem(
  meetingId: string,
  actionItemId: string,
  patch: {
    description?: string;
    assigneeName?: string | null;
    dueDate?: string | null;
    status?: ActionItem["status"];
  },
): ActionItem | null {
  const store = getStore();
  const meeting = store.meetings.get(meetingId);
  if (!meeting) return null;
  const item = meeting.actionItems.find((a) => a.id === actionItemId);
  if (!item) return null;
  if (patch.description !== undefined) item.description = patch.description;
  if (patch.assigneeName !== undefined) item.assigneeName = patch.assigneeName;
  if (patch.dueDate !== undefined) item.dueDate = patch.dueDate;
  if (patch.status !== undefined) item.status = patch.status;
  return item;
}
