// Domain types mirroring the Cloudflare port's planned schema
// (tbl_user_account, tbl_team, tbl_meeting, tbl_job, tbl_transcript,
// tbl_speaker_segment, tbl_summary, tbl_action_item — see
// Whisper_Backend_API/schema.sql). Field names are camelCase per the
// documented Worker convention; ids are strings (UUID-shaped) to match D1.

export type MeetingStatus = "draft" | "processing" | "completed" | "failed";
export type JobType = "transcribe" | "diarize" | "summarize";
export type JobStatus = "queued" | "running" | "completed" | "failed";
export type ActionItemStatus = "open" | "in_progress" | "done" | "cancelled";

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Team {
  id: string;
  name: string;
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
  wordCount: number;
  // "stereo-split" when the upload was a 2-channel file with real speaker
  // separation; "single-speaker-fallback" when the backend couldn't split
  // channels (unsupported/unparseable file) and everything is one speaker.
  // Only ever set by the Cloudflare-backed deployment; absent/null elsewhere.
  diarizationMethod?: "stereo-split" | "single-speaker-fallback" | null;
  segments: SpeakerSegment[];
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

export interface MeetingSummaryView {
  id: string;
  title: string;
  meetingDate: string;
  status: MeetingStatus;
  createdAt: string;
  participantCount: number;
  actionItemOpenCount: number;
}
