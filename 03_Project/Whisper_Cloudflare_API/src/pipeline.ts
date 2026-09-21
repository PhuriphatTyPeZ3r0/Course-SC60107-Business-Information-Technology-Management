import * as db from "./db";
import { parseWavHeader, splitStereoWav } from "./wav";
import type { Env, JobType } from "./types";

const SUMMARY_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

const SUMMARY_PROMPT =
  "สรุปใจความสำคัญของบทสนทนาต่อไปนี้โดยเน้นประเด็นสำคัญและข้อสรุปเป็นข้อความสั้นๆ:\n\n";

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}
interface WhisperResult {
  text: string;
  segments?: WhisperSegment[];
  duration?: number;
}

interface DiarizedSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function transcribe(ai: Ai, audio: ArrayBuffer): Promise<WhisperResult> {
  const result = (await ai.run(WHISPER_MODEL, { audio: toBase64(audio) } as never)) as unknown as WhisperResult;
  return result;
}

function segmentsFromWhisperResult(result: WhisperResult, speaker: string): DiarizedSegment[] {
  if (result.segments && result.segments.length > 0) {
    return result.segments.map((s) => ({ speaker, start: s.start, end: s.end, text: s.text.trim() }));
  }
  // No per-segment timing available - fall back to one segment spanning the
  // whole clip (or a nominal length when duration isn't reported either).
  return [{ speaker, start: 0, end: result.duration ?? 0, text: result.text.trim() }];
}

/** Detects a 2-channel WAV file; anything else (including unparseable/non-WAV
 * audio, which Workers AI's Whisper model decodes server-side regardless of
 * container) is treated as single-speaker. See src/wav.ts for why: without
 * ffmpeg, only raw PCM WAV can be split into channels on the Workers side. */
function isStereoWav(buffer: ArrayBuffer): boolean {
  try {
    return parseWavHeader(buffer).numChannels === 2;
  } catch {
    return false;
  }
}

async function runDiarizedTranscription(
  ai: Ai,
  audio: ArrayBuffer,
): Promise<{ segments: DiarizedSegment[]; language: string }> {
  if (isStereoWav(audio)) {
    const { left, right } = splitStereoWav(audio);
    const [a, b] = await Promise.all([transcribe(ai, left), transcribe(ai, right)]);
    const segments = [...segmentsFromWhisperResult(a, "A"), ...segmentsFromWhisperResult(b, "B")].sort(
      (x, y) => x.start - y.start,
    );
    return { segments, language: "unknown" };
  }

  const result = await transcribe(ai, audio);
  return { segments: segmentsFromWhisperResult(result, "A"), language: "unknown" };
}

export interface PipelineJobIds {
  transcribe: string;
  diarize: string;
  summarize: string;
}

/** Mirrors Whisper_Backend_API's _run_meeting_pipeline: transcribe -> diarize
 * (stereo-split only here, see runDiarizedTranscription) -> summarize,
 * updating each job's D1 row as it progresses so the frontend's polling UI
 * reflects real work. Called from a ctx.waitUntil() in src/index.ts so it
 * keeps running after the POST /api/meetings response is sent. */
export async function runMeetingPipeline(
  env: Env,
  meetingId: string,
  jobIds: PipelineJobIds,
  audio: ArrayBuffer,
): Promise<void> {
  try {
    await db.setJobStatus(env.DB, jobIds.transcribe, "running");
    await db.setJobStatus(env.DB, jobIds.diarize, "running");

    const { segments } = await runDiarizedTranscription(env.AI, audio);

    await db.setJobStatus(env.DB, jobIds.transcribe, "completed");
    await db.setJobStatus(env.DB, jobIds.diarize, "completed");

    const fullText = segments
      .map((s) => s.text)
      .join(" ")
      .trim();
    await db.saveTranscript(env.DB, jobIds.transcribe, fullText, "th", segments);

    const speakerLabels = [...new Set(segments.map((s) => s.speaker))].sort();
    await db.ensureSpeakerParticipants(env.DB, meetingId, speakerLabels);

    await db.setJobStatus(env.DB, jobIds.summarize, "running");
    const summaryResponse = (await env.AI.run(SUMMARY_MODEL, {
      messages: [{ role: "user", content: SUMMARY_PROMPT + fullText }],
    } as never)) as unknown as { response: string };
    await db.saveSummary(env.DB, jobIds.summarize, summaryResponse.response.trim(), SUMMARY_MODEL);
    await db.setJobStatus(env.DB, jobIds.summarize, "completed");

    await db.setMeetingStatus(env.DB, meetingId, "completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed unexpectedly";
    await db.failPendingJobs(env.DB, meetingId, message);
    await db.setMeetingStatus(env.DB, meetingId, "failed");
  }
}

export const JOB_TYPES: JobType[] = ["transcribe", "diarize", "summarize"];
