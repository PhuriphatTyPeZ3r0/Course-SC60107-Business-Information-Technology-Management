import { parseSummary, type SummaryBlock } from "@/components/summary-view";
import type { Meeting } from "@/lib/types";

export interface MinutesActionItem {
  description: string;
  assigneeName: string;
  dueDate: string;
  statusLabel: string;
}

export interface MinutesTranscriptLine {
  speakerLabel: string;
  timestamp: string;
  text: string;
}

export interface MinutesData {
  title: string;
  meetingDateLabel: string;
  durationLabel: string | null;
  participants: string[];
  summaryBlocks: SummaryBlock[];
  actionItems: MinutesActionItem[];
  transcript: MinutesTranscriptLine[];
}

const ACTION_ITEM_STATUS_LABEL: Record<string, string> = {
  open: "ยังไม่เริ่ม",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Minutes are inherently a Thai-language document type here (Thai meeting
// audio, Thai org context) - always formatted in th-TH regardless of the
// UI's currently selected language, unlike the rest of the app.
const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeStyle: "short" });

// Both the Word and PDF exporters build from this one shape, so the two
// documents can't drift apart in what data they include.
export function buildMinutesData(meeting: Meeting): MinutesData {
  const segments = meeting.transcript?.segments ?? [];
  const durationMs = segments.length > 0 ? Math.max(...segments.map((s) => s.endTimeMs)) : 0;

  return {
    title: meeting.title,
    meetingDateLabel: dateFormatter.format(new Date(meeting.meetingDate)),
    durationLabel: durationMs > 0 ? formatTimestamp(durationMs) : null,
    participants: meeting.participants.map((p) => `${p.displayName} (${p.speakerLabel})`),
    summaryBlocks: meeting.summary ? parseSummary(meeting.summary.text) : [],
    actionItems: meeting.actionItems.map((item) => ({
      description: item.description,
      assigneeName: item.assigneeName ?? "-",
      dueDate: item.dueDate ?? "-",
      statusLabel: ACTION_ITEM_STATUS_LABEL[item.status] ?? item.status,
    })),
    transcript: segments.map((s) => ({
      speakerLabel: s.speakerLabel,
      timestamp: formatTimestamp(s.startTimeMs),
      text: s.text,
    })),
  };
}

export function minutesFileBaseName(meeting: Meeting): string {
  const safeTitle = meeting.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "meeting";
  return `${safeTitle}-minutes`;
}
