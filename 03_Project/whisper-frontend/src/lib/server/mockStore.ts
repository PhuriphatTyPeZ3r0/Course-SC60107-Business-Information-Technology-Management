import "server-only";
import type {
  ActionItem,
  Job,
  JobType,
  Meeting,
  Participant,
  SpeakerSegment,
  Team,
  User,
} from "@/lib/types";

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
  email: "demo@sarup.app",
  displayName: "Demo User",
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

const SUMMARY_TEXT =
  "ทีมรายงานความคืบหน้า 3 ด้าน: (1) UI หน้าหลักเสร็จแล้ว รอฟีดแบ็ก (2) ฝั่ง backend พบปัญหา VRAM ระหว่างรันโมเดลขนาดใหญ่ ตัดสินใจลด scope ชั่วคราว (3) ทีมตกลงโฟกัสที่การเตรียม demo ให้ทันวันศุกร์ และนัดประชุมติดตามผลวันพฤหัสบดี เวลา 14:00 น.";

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
}

const globalForStore = globalThis as unknown as { __sarupStore?: Store };

function seedStore(): Store {
  const store: Store = { meetings: new Map() };
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
  if (!globalForStore.__sarupStore) {
    globalForStore.__sarupStore = seedStore();
  }
  return globalForStore.__sarupStore;
}

export function listMeetings(): Meeting[] {
  const store = getStore();
  return [...store.meetings.values()]
    .map(materialize)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMeeting(id: string): Meeting | null {
  const store = getStore();
  const meeting = store.meetings.get(id);
  return meeting ? materialize(meeting) : null;
}

export function createMeeting(input: { title: string; sourceFileName: string | null }): Meeting {
  const store = getStore();
  const meeting = createMeetingInternal(store, input);
  store.meetings.set(meeting.id, meeting);
  return materialize(meeting);
}

export function updateActionItemStatus(
  meetingId: string,
  actionItemId: string,
  status: ActionItem["status"],
): ActionItem | null {
  const store = getStore();
  const meeting = store.meetings.get(meetingId);
  if (!meeting) return null;
  const item = meeting.actionItems.find((a) => a.id === actionItemId);
  if (!item) return null;
  item.status = status;
  return item;
}
