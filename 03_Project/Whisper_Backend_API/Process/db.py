"""Persistence layer for the meetings/teams/jobs/action-items API the
frontend expects (see FRONTEND_HANDOFF.md). Calls the stored procedures in
stored_procedures.sql for writes and simple single-row reads; composite
reads that need a join across tables (meeting detail, action items with
assignee names) use plain SQL instead, since none of the usp_list_* procs
project everything the frontend's JSON contract needs in one call.

Field names returned from this module are already camelCase, matching
src/lib/types.ts in whisper-frontend exactly, so Service.py can serialize
these dicts straight to JSON.
"""

import json
import logging
import os
from datetime import date, datetime

import asyncpg

logger = logging.getLogger("whisper_api.db")

_pool: asyncpg.Pool | None = None

DEMO_USER_EMAIL = "demo@whisper.app"
DEMO_USER_DISPLAY_NAME = "Demo User"
DEMO_TEAM_NAME = "Demo Team"

# The single team every user belongs to (see the "single default team, no
# switcher" scope decision). Populated by ensure_demo_seed() at startup.
_demo_team_id: str | None = None


class DuplicateEmailError(Exception):
    pass


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value is not None else None


async def init_pool() -> None:
    global _pool
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    _pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=10)


async def close_pool() -> None:
    if _pool is not None:
        await _pool.close()


def get_demo_team_id() -> str:
    if _demo_team_id is None:
        raise RuntimeError("ensure_demo_seed() has not run yet")
    return _demo_team_id


async def ensure_demo_seed() -> None:
    """Idempotently seeds one demo user + one demo team, and makes sure
    every existing user is a member of that team (single-team demo)."""
    global _demo_team_id
    assert _pool is not None
    async with _pool.acquire() as conn:
        team_id = await conn.fetchval(
            "SELECT team_id FROM tbl_team WHERE team_name = $1 AND deleted_at IS NULL", DEMO_TEAM_NAME
        )
        if team_id is None:
            team_id = await conn.fetchval("SELECT usp_create_team($1)", DEMO_TEAM_NAME)
        _demo_team_id = str(team_id)

        user_id = await conn.fetchval(
            "SELECT user_account_id FROM tbl_user_account WHERE email = $1", DEMO_USER_EMAIL
        )
        if user_id is None:
            user_id = await conn.fetchval(
                "SELECT usp_create_user_account($1, $2, $3)",
                DEMO_USER_EMAIL, "demo", DEMO_USER_DISPLAY_NAME,
            )
        await conn.execute(
            """
            INSERT INTO tbl_team_member (team_id, user_account_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT DO NOTHING
            """,
            team_id, user_id,
        )
    logger.info("Demo seed ready: team=%s user=%s", _demo_team_id, DEMO_USER_EMAIL)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


async def get_user_by_email(email: str) -> dict | None:
    assert _pool is not None
    row = await _pool.fetchrow(
        "SELECT user_account_id, email, display_name FROM tbl_user_account "
        "WHERE lower(email) = lower($1) AND is_active",
        email,
    )
    if row is None:
        return None
    return {"id": str(row["user_account_id"]), "email": row["email"], "displayName": row["display_name"]}


async def create_user_account(email: str, password: str, display_name: str) -> dict:
    assert _pool is not None
    team_id = get_demo_team_id()
    async with _pool.acquire() as conn:
        try:
            user_id = await conn.fetchval(
                "SELECT usp_create_user_account($1, $2, $3)", email, password, display_name
            )
        except asyncpg.UniqueViolationError:
            raise DuplicateEmailError(email) from None
        await conn.execute(
            "INSERT INTO tbl_team_member (team_id, user_account_id, role) VALUES ($1, $2, 'member')",
            team_id, user_id,
        )
    return {"id": str(user_id), "email": email, "displayName": display_name}


# ---------------------------------------------------------------------------
# Meetings + jobs
# ---------------------------------------------------------------------------


async def create_meeting_with_jobs(owner_user_id: str, title: str, source_file_name: str | None) -> dict:
    assert _pool is not None
    team_id = get_demo_team_id()
    async with _pool.acquire() as conn:
        async with conn.transaction():
            meeting_id = await conn.fetchval(
                "SELECT usp_create_meeting($1, $2, $3, now(), 'th')", team_id, owner_user_id, title
            )
            await conn.execute("CALL usp_update_meeting($1, NULL, NULL, 'processing')", meeting_id)
            if source_file_name:
                await conn.execute(
                    "UPDATE tbl_meeting SET source_file_name = $2 WHERE meeting_id = $1",
                    meeting_id, source_file_name,
                )
            job_ids = {}
            for job_type in ("transcribe", "diarize", "summarize"):
                job_ids[job_type] = await conn.fetchval(
                    "SELECT usp_create_job($1, $2, $3)", meeting_id, owner_user_id, job_type
                )
    return {"meetingId": str(meeting_id), "jobIds": {k: str(v) for k, v in job_ids.items()}}


async def set_job_status(job_id: str, status: str, error_message: str | None = None) -> None:
    assert _pool is not None
    await _pool.execute("CALL usp_update_job_status($1, $2, $3)", job_id, status, error_message)


async def fail_pending_jobs(meeting_id: str, error_message: str) -> None:
    """Marks every job on this meeting that isn't already completed as failed."""
    assert _pool is not None
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT job_id FROM tbl_job WHERE meeting_id = $1 AND status NOT IN ('completed', 'failed') "
            "AND deleted_at IS NULL",
            meeting_id,
        )
        for row in rows:
            await conn.execute(
                "CALL usp_update_job_status($1, 'failed', $2)", row["job_id"], error_message[:500]
            )


async def set_meeting_status(meeting_id: str, status: str) -> None:
    assert _pool is not None
    await _pool.execute("CALL usp_update_meeting($1, NULL, NULL, $2)", meeting_id, status)


async def save_transcript(
    job_id: str, full_text: str, language_code: str, segments: list[dict], chunk_count: int = 1
) -> str:
    """segments: [{"speaker": str, "start": seconds, "end": seconds, "text": str}, ...]

    chunk_count: how many audio chunks (Process/audio_split.py) this transcript
    was assembled from; 1 for the ordinary single-pass path.
    """
    assert _pool is not None
    payload = [
        {
            "speaker_label": seg["speaker"],
            "start_time_ms": round(seg["start"] * 1000),
            "end_time_ms": round(seg["end"] * 1000),
            "segment_text": seg["text"],
        }
        for seg in segments
    ]
    async with _pool.acquire() as conn:
        transcript_id = await conn.fetchval(
            "SELECT usp_create_transcript($1, $2, $3, NULL, $4)", job_id, full_text, language_code, chunk_count
        )
        if payload:
            await conn.fetchval(
                "SELECT usp_create_speaker_segment_batch($1, $2::jsonb)",
                transcript_id, json.dumps(payload),
            )
    return str(transcript_id)


async def save_summary(job_id: str, text: str, model_used: str) -> str:
    assert _pool is not None
    summary_id = await _pool.fetchval("SELECT usp_create_summary($1, $2, $3)", job_id, text, model_used)
    return str(summary_id)


async def ensure_speaker_participants(meeting_id: str, speaker_labels: list[str]) -> None:
    """One fresh tbl_participant per unique speaker label for this meeting —
    there's no real speaker-identity step in this integration, so the label
    itself (e.g. "SPEAKER_1", "A") is the participant's display name."""
    assert _pool is not None
    async with _pool.acquire() as conn:
        for label in speaker_labels:
            participant_id = await conn.fetchval("SELECT usp_create_participant($1)", label)
            await conn.execute(
                "CALL usp_add_meeting_participant($1, $2, $3, NULL)", meeting_id, participant_id, label
            )


# ---------------------------------------------------------------------------
# Composite reads
# ---------------------------------------------------------------------------


async def list_team_meetings() -> list[dict]:
    """Lean listing for the dashboard (MeetingSummaryView on the frontend) —
    one query, not one round trip per meeting. Deliberately doesn't touch
    transcript/segments: the list view never renders them, only
    get_meeting_full() (single-meeting detail) needs the full shape."""
    assert _pool is not None
    rows = await _pool.fetch(
        """
        SELECT
            m.meeting_id,
            m.title,
            m.meeting_date,
            m.status,
            m.created_at,
            (SELECT count(*) FROM tbl_meeting_participant mp WHERE mp.meeting_id = m.meeting_id)
                AS participant_count,
            (SELECT count(*) FROM tbl_action_item a
                WHERE a.meeting_id = m.meeting_id AND a.deleted_at IS NULL AND a.status != 'done')
                AS action_item_open_count
        FROM tbl_meeting m
        WHERE m.team_id = $1 AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        """,
        get_demo_team_id(),
    )
    return [
        {
            "id": str(r["meeting_id"]),
            "title": r["title"],
            "meetingDate": _iso(r["meeting_date"]),
            "status": r["status"],
            "createdAt": _iso(r["created_at"]),
            "participantCount": r["participant_count"],
            "actionItemOpenCount": r["action_item_open_count"],
        }
        for r in rows
    ]


async def get_meeting_full(meeting_id: str) -> dict | None:
    assert _pool is not None
    async with _pool.acquire() as conn:
        meeting = await conn.fetchrow(
            "SELECT meeting_id, team_id, owner_user_account_id, title, meeting_date, "
            "language_code, status, created_at, source_file_name FROM tbl_meeting "
            "WHERE meeting_id = $1 AND deleted_at IS NULL",
            meeting_id,
        )
        if meeting is None:
            return None

        job_rows = await conn.fetch(
            "SELECT job_id, job_type, status, error_message, queued_at, started_at, completed_at "
            "FROM tbl_job WHERE meeting_id = $1 AND deleted_at IS NULL ORDER BY queued_at",
            meeting_id,
        )
        jobs = [
            {
                "id": str(j["job_id"]),
                "meetingId": meeting_id,
                "jobType": j["job_type"],
                "status": j["status"],
                "queuedAt": _iso(j["queued_at"]),
                "startedAt": _iso(j["started_at"]),
                "completedAt": _iso(j["completed_at"]),
                "errorMessage": j["error_message"],
            }
            for j in job_rows
        ]

        transcribe_job = next((j for j in job_rows if j["job_type"] == "transcribe"), None)
        summarize_job = next((j for j in job_rows if j["job_type"] == "summarize"), None)

        transcript = None
        if transcribe_job is not None and transcribe_job["status"] == "completed":
            t_row = await conn.fetchrow(
                "SELECT transcript_id, full_text, language_code, word_count, chunk_count FROM tbl_transcript "
                "WHERE job_id = $1",
                transcribe_job["job_id"],
            )
            if t_row is not None:
                seg_rows = await conn.fetch(
                    "SELECT speaker_segment_id, speaker_label, start_time_ms, end_time_ms, segment_text "
                    "FROM tbl_speaker_segment WHERE transcript_id = $1 ORDER BY start_time_ms",
                    t_row["transcript_id"],
                )
                transcript = {
                    "id": str(t_row["transcript_id"]),
                    "fullText": t_row["full_text"],
                    "languageCode": t_row["language_code"],
                    "wordCount": t_row["word_count"],
                    # True when the source audio exceeded max_duration_sec/
                    # max_file_size_mb and had to be split (Process/audio_split.py)
                    # before transcription; purely informational for debugging.
                    "chunked": t_row["chunk_count"] > 1,
                    "chunkCount": t_row["chunk_count"],
                    "segments": [
                        {
                            "id": str(s["speaker_segment_id"]),
                            "speakerLabel": s["speaker_label"],
                            "startTimeMs": s["start_time_ms"],
                            "endTimeMs": s["end_time_ms"],
                            "text": s["segment_text"],
                        }
                        for s in seg_rows
                    ],
                }

        summary = None
        if summarize_job is not None and summarize_job["status"] == "completed":
            s_row = await conn.fetchrow(
                "SELECT summary_id, summary_text, model_used FROM tbl_summary WHERE job_id = $1",
                summarize_job["job_id"],
            )
            if s_row is not None:
                summary = {
                    "id": str(s_row["summary_id"]),
                    "text": s_row["summary_text"],
                    "modelUsed": s_row["model_used"],
                }

        participant_rows = await conn.fetch(
            "SELECT p.participant_id, p.display_name, mp.speaker_label FROM tbl_meeting_participant mp "
            "JOIN tbl_participant p ON p.participant_id = mp.participant_id "
            "WHERE mp.meeting_id = $1",
            meeting_id,
        )
        participants = [
            {"id": str(p["participant_id"]), "displayName": p["display_name"], "speakerLabel": p["speaker_label"]}
            for p in participant_rows
        ]

        action_item_rows = await conn.fetch(
            "SELECT a.action_item_id, a.description, a.due_date, a.status, p.display_name AS assignee_name "
            "FROM tbl_action_item a LEFT JOIN tbl_participant p ON p.participant_id = a.assignee_participant_id "
            "WHERE a.meeting_id = $1 AND a.deleted_at IS NULL "
            "ORDER BY a.due_date NULLS LAST, a.created_at",
            meeting_id,
        )
        action_items = [
            {
                "id": str(a["action_item_id"]),
                "meetingId": meeting_id,
                "description": a["description"],
                "assigneeName": a["assignee_name"],
                "dueDate": _iso(a["due_date"]),
                "status": a["status"],
            }
            for a in action_item_rows
        ]

        return {
            "id": str(meeting["meeting_id"]),
            "teamId": str(meeting["team_id"]),
            "ownerUserId": str(meeting["owner_user_account_id"]),
            "title": meeting["title"],
            "meetingDate": _iso(meeting["meeting_date"]),
            "languageCode": meeting["language_code"],
            "status": meeting["status"],
            "createdAt": _iso(meeting["created_at"]),
            "sourceFileName": meeting["source_file_name"],
            "participants": participants,
            "jobs": jobs,
            "transcript": transcript,
            "summary": summary,
            "actionItems": action_items,
        }


async def update_action_item_status(action_item_id: str, status: str) -> dict | None:
    assert _pool is not None
    await _pool.execute(
        "CALL usp_update_action_item($1, NULL, NULL, NULL, $2)", action_item_id, status
    )
    row = await _pool.fetchrow(
        "SELECT action_item_id, meeting_id, description, due_date, status FROM tbl_action_item "
        "WHERE action_item_id = $1",
        action_item_id,
    )
    if row is None:
        return None
    return {
        "id": str(row["action_item_id"]),
        "meetingId": str(row["meeting_id"]),
        "description": row["description"],
        "dueDate": _iso(row["due_date"]),
        "status": row["status"],
    }
