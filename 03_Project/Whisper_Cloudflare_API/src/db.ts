import { decryptPII, emailLookupHash, encryptPII } from "./auth";
import type {
  ActionItem,
  ActionItemStatus,
  Job,
  JobStatus,
  JobType,
  Meeting,
  MeetingStatus,
  Participant,
  Summary,
  Transcript,
  User,
} from "./types";

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** Finds a user by their Google `sub` (stable even if their Google email
 * ever changes - see DESIGN_SYSTEM.md 5b-i), creating one plus a personal
 * team (5b-ii) on first login. Legacy `email`/`password_hash`/`display_name`
 * columns (pre-dating Google SSO, kept per 5b-iii rather than a destructive
 * migration) still have NOT NULL/UNIQUE constraints from the original
 * schema, so new rows get inert placeholders there - real data only ever
 * lives in the *_encrypted columns from here on. */
export async function findOrCreateGoogleUser(
  db: D1Database,
  input: { googleSub: string; email: string; displayName: string },
  keys: { encryptionKey: string; hmacKey: string },
): Promise<{ id: string; teamId: string; email: string; displayName: string }> {
  const existing = await db
    .prepare("SELECT user_account_id FROM user_account WHERE google_sub = ?")
    .bind(input.googleSub)
    .first<{ user_account_id: string }>();

  let userId: string;
  if (existing) {
    userId = existing.user_account_id;
  } else {
    userId = newId("user");
    const ts = now();
    const [emailEncrypted, emailHash, displayNameEncrypted] = await Promise.all([
      encryptPII(input.email, keys.encryptionKey),
      emailLookupHash(input.email, keys.hmacKey),
      encryptPII(input.displayName, keys.encryptionKey),
    ]);
    await db
      .prepare(
        "INSERT INTO user_account (user_account_id, email, password_hash, display_name, " +
          "email_encrypted, email_lookup_hash, display_name_encrypted, google_sub, created_at, updated_at) " +
          "VALUES (?, ?, '', '', ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        userId,
        `${input.googleSub}@google-sso.invalid`, // legacy column placeholder, never read
        emailEncrypted,
        emailHash,
        displayNameEncrypted,
        input.googleSub,
        ts,
        ts,
      )
      .run();
  }

  const teamId = await ensurePersonalTeam(db, userId, input.displayName);
  return { id: userId, teamId, email: input.email, displayName: input.displayName };
}

async function ensurePersonalTeam(db: D1Database, userId: string, displayName: string): Promise<string> {
  const existing = await db
    .prepare(
      "SELECT tm.team_id FROM team_member tm JOIN team t ON t.team_id = tm.team_id " +
        "WHERE tm.user_account_id = ? AND t.deleted_at IS NULL LIMIT 1",
    )
    .bind(userId)
    .first<{ team_id: string }>();
  if (existing) return existing.team_id;

  const teamId = newId("team");
  const ts = now();
  await db.batch([
    db
      .prepare("INSERT INTO team (team_id, team_name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(teamId, `${displayName}'s workspace`, ts, ts),
    db
      .prepare("INSERT INTO team_member (team_id, user_account_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .bind(teamId, userId, ts),
  ]);
  return teamId;
}

export async function getUserById(
  db: D1Database,
  userId: string,
  encryptionKey: string,
): Promise<User | null> {
  const row = await db
    .prepare("SELECT user_account_id, email_encrypted, display_name_encrypted FROM user_account WHERE user_account_id = ? AND is_active")
    .bind(userId)
    .first<{ user_account_id: string; email_encrypted: string | null; display_name_encrypted: string | null }>();
  if (!row || !row.email_encrypted || !row.display_name_encrypted) return null;
  const [email, displayName] = await Promise.all([
    decryptPII(row.email_encrypted, encryptionKey),
    decryptPII(row.display_name_encrypted, encryptionKey),
  ]);
  return { id: row.user_account_id, email, displayName };
}

export async function createMeetingWithJobs(
  db: D1Database,
  teamId: string,
  ownerUserId: string,
  title: string,
  sourceFileName: string | null,
): Promise<{ meetingId: string; jobIds: Record<JobType, string> }> {
  const meetingId = newId("meeting");
  const ts = now();
  const jobIds = {
    transcribe: newId("job"),
    diarize: newId("job"),
    summarize: newId("job"),
  } as Record<JobType, string>;

  await db.batch([
    db
      .prepare(
        "INSERT INTO meeting (meeting_id, team_id, owner_user_account_id, title, meeting_date, language_code, " +
          "status, source_file_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'th', 'processing', ?, ?, ?)",
      )
      .bind(meetingId, teamId, ownerUserId, title, ts, sourceFileName, ts, ts),
    ...(Object.entries(jobIds) as [JobType, string][]).map(([jobType, jobId]) =>
      db
        .prepare(
          "INSERT INTO job (job_id, meeting_id, requested_by_user_account_id, job_type, status, queued_at) " +
            "VALUES (?, ?, ?, ?, 'queued', ?)",
        )
        .bind(jobId, meetingId, ownerUserId, jobType, ts),
    ),
  ]);

  return { meetingId, jobIds };
}

export async function setJobStatus(
  db: D1Database,
  jobId: string,
  status: JobStatus,
  errorMessage: string | null = null,
): Promise<void> {
  const ts = now();
  await db
    .prepare(
      "UPDATE job SET status = ?, error_message = COALESCE(?, error_message), " +
        "started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN ? ELSE started_at END, " +
        "completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END " +
        "WHERE job_id = ?",
    )
    .bind(status, errorMessage, status, ts, status, ts, jobId)
    .run();
}

export async function failPendingJobs(db: D1Database, meetingId: string, errorMessage: string): Promise<void> {
  await db
    .prepare(
      "UPDATE job SET status = 'failed', error_message = ?, completed_at = ? " +
        "WHERE meeting_id = ? AND status NOT IN ('completed', 'failed') AND deleted_at IS NULL",
    )
    .bind(errorMessage.slice(0, 500), now(), meetingId)
    .run();
}

export async function setMeetingStatus(db: D1Database, meetingId: string, status: MeetingStatus): Promise<void> {
  await db
    .prepare("UPDATE meeting SET status = ?, updated_at = ? WHERE meeting_id = ?")
    .bind(status, now(), meetingId)
    .run();
}

export async function saveTranscript(
  db: D1Database,
  jobId: string,
  fullText: string,
  languageCode: string,
  segments: Array<{ speaker: string; start: number; end: number; text: string }>,
  diarizationMethod: "stereo-split" | "single-speaker-fallback",
): Promise<string> {
  const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
  const result = await db
    .prepare(
      "INSERT INTO transcript (job_id, full_text, language_code, word_count, diarization_method, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(jobId, fullText, languageCode, wordCount, diarizationMethod, now())
    .run();
  const transcriptId = result.meta.last_row_id;

  if (segments.length > 0) {
    await db.batch(
      segments.map((seg) =>
        db
          .prepare(
            "INSERT INTO speaker_segment (transcript_id, speaker_label, start_time_ms, end_time_ms, segment_text) " +
              "VALUES (?, ?, ?, ?, ?)",
          )
          .bind(transcriptId, seg.speaker, Math.round(seg.start * 1000), Math.round(seg.end * 1000), seg.text),
      ),
    );
  }

  return String(transcriptId);
}

export async function saveSummary(db: D1Database, jobId: string, text: string, modelUsed: string): Promise<string> {
  const result = await db
    .prepare("INSERT INTO summary (job_id, summary_text, model_used, created_at) VALUES (?, ?, ?, ?)")
    .bind(jobId, text, modelUsed, now())
    .run();
  return String(result.meta.last_row_id);
}

export async function ensureSpeakerParticipants(
  db: D1Database,
  meetingId: string,
  speakerLabels: string[],
): Promise<void> {
  const ts = now();
  const statements = speakerLabels.flatMap((label) => {
    const participantId = newId("participant");
    return [
      db
        .prepare("INSERT INTO participant (participant_id, display_name, created_at) VALUES (?, ?, ?)")
        .bind(participantId, label, ts),
      db
        .prepare("INSERT INTO meeting_participant (meeting_id, participant_id, speaker_label) VALUES (?, ?, ?)")
        .bind(meetingId, participantId, label),
    ];
  });
  if (statements.length > 0) await db.batch(statements);
}

interface MeetingRow {
  meeting_id: string;
  team_id: string;
  owner_user_account_id: string;
  title: string;
  meeting_date: string;
  language_code: string;
  status: MeetingStatus;
  created_at: string;
  source_file_name: string | null;
}

async function fetchMeetingFullFromRow(db: D1Database, meeting: MeetingRow): Promise<Meeting> {
  const meetingId = meeting.meeting_id;

  const { results: jobRows } = await db
    .prepare(
      "SELECT job_id, job_type, status, error_message, queued_at, started_at, completed_at FROM job " +
        "WHERE meeting_id = ? AND deleted_at IS NULL ORDER BY queued_at",
    )
    .bind(meetingId)
    .all<{
      job_id: string;
      job_type: JobType;
      status: JobStatus;
      error_message: string | null;
      queued_at: string;
      started_at: string | null;
      completed_at: string | null;
    }>();

  const jobs: Job[] = jobRows.map((j) => ({
    id: j.job_id,
    meetingId,
    jobType: j.job_type,
    status: j.status,
    queuedAt: j.queued_at,
    startedAt: j.started_at,
    completedAt: j.completed_at,
    errorMessage: j.error_message,
  }));

  const transcribeJob = jobRows.find((j) => j.job_type === "transcribe");
  const summarizeJob = jobRows.find((j) => j.job_type === "summarize");

  let transcript: Transcript | null = null;
  if (transcribeJob?.status === "completed") {
    const tRow = await db
      .prepare(
        "SELECT transcript_id, full_text, language_code, word_count, diarization_method FROM transcript " +
          "WHERE job_id = ?",
      )
      .bind(transcribeJob.job_id)
      .first<{
        transcript_id: number;
        full_text: string;
        language_code: string;
        word_count: number | null;
        diarization_method: "stereo-split" | "single-speaker-fallback" | null;
      }>();
    if (tRow) {
      const { results: segRows } = await db
        .prepare(
          "SELECT speaker_segment_id, speaker_label, start_time_ms, end_time_ms, segment_text FROM speaker_segment " +
            "WHERE transcript_id = ? ORDER BY start_time_ms",
        )
        .bind(tRow.transcript_id)
        .all<{
          speaker_segment_id: number;
          speaker_label: string;
          start_time_ms: number;
          end_time_ms: number;
          segment_text: string;
        }>();
      transcript = {
        id: String(tRow.transcript_id),
        fullText: tRow.full_text,
        languageCode: tRow.language_code,
        wordCount: tRow.word_count,
        diarizationMethod: tRow.diarization_method,
        segments: segRows.map((s) => ({
          id: String(s.speaker_segment_id),
          speakerLabel: s.speaker_label,
          startTimeMs: s.start_time_ms,
          endTimeMs: s.end_time_ms,
          text: s.segment_text,
        })),
      };
    }
  }

  let summary: Summary | null = null;
  if (summarizeJob?.status === "completed") {
    const sRow = await db
      .prepare("SELECT summary_id, summary_text, model_used FROM summary WHERE job_id = ?")
      .bind(summarizeJob.job_id)
      .first<{ summary_id: number; summary_text: string; model_used: string }>();
    if (sRow) {
      summary = { id: String(sRow.summary_id), text: sRow.summary_text, modelUsed: sRow.model_used };
    }
  }

  const { results: participantRows } = await db
    .prepare(
      "SELECT p.participant_id, p.display_name, mp.speaker_label FROM meeting_participant mp " +
        "JOIN participant p ON p.participant_id = mp.participant_id WHERE mp.meeting_id = ?",
    )
    .bind(meetingId)
    .all<{ participant_id: string; display_name: string; speaker_label: string }>();
  const participants: Participant[] = participantRows.map((p) => ({
    id: p.participant_id,
    displayName: p.display_name,
    speakerLabel: p.speaker_label,
  }));

  const { results: actionItemRows } = await db
    .prepare(
      "SELECT a.action_item_id, a.description, a.due_date, a.status, a.assignee_name " +
        "FROM action_item a " +
        "WHERE a.meeting_id = ? AND a.deleted_at IS NULL ORDER BY a.due_date IS NULL, a.due_date, a.created_at",
    )
    .bind(meetingId)
    .all<{
      action_item_id: number;
      description: string;
      due_date: string | null;
      status: ActionItemStatus;
      assignee_name: string | null;
    }>();
  const actionItems: ActionItem[] = actionItemRows.map((a) => ({
    id: String(a.action_item_id),
    meetingId,
    description: a.description,
    assigneeName: a.assignee_name,
    dueDate: a.due_date,
    status: a.status,
  }));

  return {
    id: meetingId,
    teamId: meeting.team_id,
    ownerUserId: meeting.owner_user_account_id,
    title: meeting.title,
    meetingDate: meeting.meeting_date,
    languageCode: meeting.language_code,
    status: meeting.status,
    createdAt: meeting.created_at,
    sourceFileName: meeting.source_file_name,
    participants,
    jobs,
    transcript,
    summary,
    actionItems,
  };
}

/** teamId is required and checked in the WHERE clause, not just by the
 * caller - this is what actually enforces per-user data isolation (see
 * DESIGN_SYSTEM.md 5b-ii). A meeting that exists but belongs to a
 * different team returns null here, same as a meeting that doesn't exist
 * at all, so the API's 404 never leaks which case it was. */
export async function getMeetingFull(db: D1Database, meetingId: string, teamId: string): Promise<Meeting | null> {
  const meeting = await db
    .prepare(
      "SELECT meeting_id, team_id, owner_user_account_id, title, meeting_date, language_code, status, " +
        "created_at, source_file_name FROM meeting WHERE meeting_id = ? AND team_id = ? AND deleted_at IS NULL",
    )
    .bind(meetingId, teamId)
    .first<MeetingRow>();
  if (!meeting) return null;
  return fetchMeetingFullFromRow(db, meeting);
}

export async function listTeamMeetings(db: D1Database, teamId: string): Promise<Meeting[]> {
  const { results } = await db
    .prepare(
      "SELECT meeting_id, team_id, owner_user_account_id, title, meeting_date, language_code, status, " +
        "created_at, source_file_name FROM meeting WHERE team_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
    )
    .bind(teamId)
    .all<MeetingRow>();
  return Promise.all(results.map((row) => fetchMeetingFullFromRow(db, row)));
}

/** Joins to meeting to enforce the same per-team isolation as
 * getMeetingFull() - an action item ID alone isn't enough, it must also
 * belong to a meeting owned by teamId. */
async function fetchActionItemById(db: D1Database, actionItemId: string, teamId: string): Promise<ActionItem | null> {
  const row = await db
    .prepare(
      "SELECT a.action_item_id, a.meeting_id, a.description, a.due_date, a.status, a.assignee_name " +
        "FROM action_item a JOIN meeting m ON m.meeting_id = a.meeting_id " +
        "WHERE a.action_item_id = ? AND a.deleted_at IS NULL AND m.team_id = ?",
    )
    .bind(actionItemId, teamId)
    .first<{
      action_item_id: number;
      meeting_id: string;
      description: string;
      due_date: string | null;
      status: ActionItemStatus;
      assignee_name: string | null;
    }>();
  if (!row) return null;
  return {
    id: String(row.action_item_id),
    meetingId: row.meeting_id,
    description: row.description,
    assigneeName: row.assignee_name,
    dueDate: row.due_date,
    status: row.status,
  };
}

/** Caller (index.ts) must have already verified meetingId belongs to
 * teamId via getMeetingFull() before calling this - teamId is only taken
 * here so fetchActionItemById()'s join check has something to match. */
export async function createActionItem(
  db: D1Database,
  meetingId: string,
  teamId: string,
  input: { description: string; assigneeName: string | null; dueDate: string | null },
): Promise<ActionItem> {
  const ts = now();
  const result = await db
    .prepare(
      "INSERT INTO action_item (meeting_id, description, assignee_name, due_date, status, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, 'open', ?, ?)",
    )
    .bind(meetingId, input.description, input.assigneeName, input.dueDate, ts, ts)
    .run();
  const actionItem = await fetchActionItemById(db, String(result.meta.last_row_id), teamId);
  if (!actionItem) throw new Error("createActionItem: insert succeeded but row not found");
  return actionItem;
}

export async function updateActionItem(
  db: D1Database,
  actionItemId: string,
  teamId: string,
  patch: { description?: string; assigneeName?: string | null; dueDate?: string | null; status?: ActionItemStatus },
): Promise<ActionItem | null> {
  // Ownership check happens here, before any write - not just when reading
  // the result back afterward, otherwise a guessed ID from another team
  // could be modified even though it could never be read back.
  const existing = await fetchActionItemById(db, actionItemId, teamId);
  if (!existing) return null;
  if (
    patch.description === undefined &&
    patch.assigneeName === undefined &&
    patch.dueDate === undefined &&
    patch.status === undefined
  ) {
    return existing;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.description !== undefined) {
    fields.push("description = ?");
    values.push(patch.description);
  }
  if (patch.assigneeName !== undefined) {
    fields.push("assignee_name = ?");
    values.push(patch.assigneeName);
  }
  if (patch.dueDate !== undefined) {
    fields.push("due_date = ?");
    values.push(patch.dueDate);
  }
  if (patch.status !== undefined) {
    fields.push("status = ?");
    values.push(patch.status);
  }

  fields.push("updated_at = ?");
  values.push(now());
  values.push(actionItemId);
  await db
    .prepare(`UPDATE action_item SET ${fields.join(", ")} WHERE action_item_id = ?`)
    .bind(...values)
    .run();
  return fetchActionItemById(db, actionItemId, teamId);
}

/** Returns false (no-op) if meetingId doesn't exist or isn't owned by
 * teamId - the team check is enforced right in the WHERE clause. */
export async function updateMeetingTitle(
  db: D1Database,
  meetingId: string,
  teamId: string,
  title: string,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE meeting SET title = ?, updated_at = ? WHERE meeting_id = ? AND team_id = ?")
    .bind(title, now(), meetingId, teamId)
    .run();
  return result.meta.changes > 0;
}
