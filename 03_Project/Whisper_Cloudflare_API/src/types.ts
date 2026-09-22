// Mirrors whisper-frontend/src/lib/types.ts exactly - this is the contract
// the frontend already speaks (see FRONTEND_HANDOFF.md in Whisper_Backend_API).

export type MeetingStatus = "draft" | "processing" | "completed" | "failed";
export type JobType = "transcribe" | "diarize" | "summarize";
export type JobStatus = "queued" | "running" | "completed" | "failed";
export type ActionItemStatus = "open" | "in_progress" | "done" | "cancelled";

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Participant {
  id: string;
  displayName: string;
  speakerLabel: string;
}

export interface Job {
  id: string;
  meetingId: string;
  jobType: JobType;
  status: JobStatus;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface SpeakerSegment {
  id: string;
  speakerLabel: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
}

export interface Transcript {
  id: string;
  fullText: string;
  languageCode: string;
  wordCount: number | null;
  segments: SpeakerSegment[];
  // "stereo-split" when the upload was a 2-channel WAV split into A/B;
  // "single-speaker-fallback" when it wasn't (any non-WAV format, or a WAV
  // header src/wav.ts couldn't parse) and everything got labeled "A".
  // null for transcripts saved before this field existed.
  diarizationMethod: "stereo-split" | "single-speaker-fallback" | null;
}

export interface Summary {
  id: string;
  text: string;
  modelUsed: string;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  description: string;
  assigneeName: string | null;
  dueDate: string | null;
  status: ActionItemStatus;
}

export interface Meeting {
  id: string;
  teamId: string;
  ownerUserId: string;
  title: string;
  meetingDate: string;
  languageCode: string;
  status: MeetingStatus;
  createdAt: string;
  sourceFileName: string | null;
  participants: Participant[];
  jobs: Job[];
  transcript: Transcript | null;
  summary: Summary | null;
  actionItems: ActionItem[];
}

export interface Env {
  DB: D1Database;
  // R2 not bound yet - needs enabling via the Cloudflare dashboard first,
  // and isn't used by the pipeline yet anyway. See wrangler.jsonc.
  AI: Ai;
  CORS_ORIGIN: string;
  // Google OAuth2 (see DESIGN_SYSTEM.md's "Real authentication" section).
  // Client ID is not secret (it's embedded in the frontend bundle too);
  // the rest are `wrangler secret put`.
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_SECRET: string;
  PII_ENCRYPTION_KEY: string;
  PII_LOOKUP_HMAC_KEY: string;
}
