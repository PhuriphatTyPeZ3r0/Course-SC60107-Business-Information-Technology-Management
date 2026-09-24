-- Whisper_DB stored procedures (PostgreSQL)
-- Everything named usp_<verb>_<entity>, but the underlying object kind is
-- picked per Postgres's real constraints, not a single blanket choice:
--   * CREATE PROCEDURE (called via CALL) for anything that returns nothing
--     — usp_create/remove/add/delete/update actions with no result to hand
--     back. Postgres procedures cannot RETURN a value or RETURNS TABLE at
--     all, so this is the only bucket eligible for a true procedure.
--   * CREATE FUNCTION (called via SELECT) for everything that must hand
--     back an id, a row, or multiple rows (usp_get_*, usp_list_*, and the
--     usp_create_* that return the new row's id) — Postgres procedures
--     cannot do this, only functions can.
-- In pgAdmin this means: void-returning routines show under
-- Schemas -> public -> Procedures, everything else under -> Functions.
--
-- Conventions used throughout:
--   * usp_<verb>_<entity> naming
--   * Called by the Whisper_Backend_API service role only (no RLS)
--   * Reads return TABLE / scalar ids; writes RAISE EXCEPTION on failure
--   * usp_update_* takes every column as an optional (DEFAULT NULL)
--     parameter and applies COALESCE(param, existing_value) — partial update
--   * usp_delete_* soft-deletes (sets deleted_at) on tbl_team, tbl_meeting,
--     tbl_participant, tbl_job, tbl_action_item; hard-deletes elsewhere
--   * List procs: LIMIT/OFFSET pagination, filtered to deleted_at IS NULL
--   * A FUNCTION calling a void PROCEDURE uses CALL, not PERFORM (see
--     usp_complete_job calling usp_update_job_status)

-- =====================================================================
-- tbl_user_account
-- =====================================================================
CREATE FUNCTION usp_create_user_account(
    p_email         VARCHAR(255),
    p_password      TEXT,
    p_display_name  VARCHAR(120)
) RETURNS UUID AS $$
DECLARE
    v_user_account_id UUID;
BEGIN
    INSERT INTO tbl_user_account (email, password_hash, display_name)
    VALUES (p_email, crypt(p_password, gen_salt('bf')), p_display_name)
    RETURNING user_account_id INTO v_user_account_id;
    RETURN v_user_account_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'tbl_user_account: email already exists: %', p_email
            USING ERRCODE = '23505';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_user_account(p_user_account_id UUID)
RETURNS TABLE (
    user_account_id UUID, email VARCHAR, display_name VARCHAR,
    is_active BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT u.user_account_id, u.email, u.display_name, u.is_active, u.created_at, u.updated_at
    FROM tbl_user_account u
    WHERE u.user_account_id = p_user_account_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_user_account(
    p_limit INT DEFAULT 50, p_offset INT DEFAULT 0, p_active_only BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
    user_account_id UUID, email VARCHAR, display_name VARCHAR,
    is_active BOOLEAN, created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT u.user_account_id, u.email, u.display_name, u.is_active, u.created_at
    FROM tbl_user_account u
    WHERE (NOT p_active_only OR u.is_active)
    ORDER BY u.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_user_account(
    p_user_account_id UUID,
    p_email         VARCHAR(255) DEFAULT NULL,
    p_display_name  VARCHAR(120) DEFAULT NULL,
    p_password      TEXT DEFAULT NULL
) AS $$
BEGIN
    UPDATE tbl_user_account SET
        email = COALESCE(p_email, email),
        display_name = COALESCE(p_display_name, display_name),
        password_hash = CASE WHEN p_password IS NOT NULL
                              THEN crypt(p_password, gen_salt('bf'))
                              ELSE password_hash END
    WHERE user_account_id = p_user_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_user_account not found: %', p_user_account_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_deactivate_user_account(p_user_account_id UUID) AS $$
BEGIN
    UPDATE tbl_user_account SET is_active = FALSE WHERE user_account_id = p_user_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_user_account not found: %', p_user_account_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_team
-- =====================================================================
CREATE FUNCTION usp_create_team(p_team_name VARCHAR(150))
RETURNS UUID AS $$
DECLARE
    v_team_id UUID;
BEGIN
    INSERT INTO tbl_team (team_name) VALUES (p_team_name)
    RETURNING team_id INTO v_team_id;
    RETURN v_team_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_team(p_team_id UUID)
RETURNS TABLE (
    team_id UUID, team_name VARCHAR, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT t.team_id, t.team_name, t.created_at, t.updated_at
    FROM tbl_team t
    WHERE t.team_id = p_team_id AND t.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_team(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (team_id UUID, team_name VARCHAR, created_at TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT t.team_id, t.team_name, t.created_at
    FROM tbl_team t
    WHERE t.deleted_at IS NULL
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_team(p_team_id UUID, p_team_name VARCHAR(150) DEFAULT NULL) AS $$
BEGIN
    UPDATE tbl_team SET team_name = COALESCE(p_team_name, team_name)
    WHERE team_id = p_team_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_team not found or deleted: %', p_team_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_delete_team(p_team_id UUID) AS $$
BEGIN
    UPDATE tbl_team SET deleted_at = now()
    WHERE team_id = p_team_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_team not found or already deleted: %', p_team_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_team_member
-- =====================================================================
CREATE PROCEDURE usp_add_team_member(
    p_team_id UUID, p_user_account_id UUID, p_role VARCHAR(30) DEFAULT 'member'
) AS $$
BEGIN
    INSERT INTO tbl_team_member (team_id, user_account_id, role)
    VALUES (p_team_id, p_user_account_id, p_role);
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'tbl_team_member: user % already in team %', p_user_account_id, p_team_id
            USING ERRCODE = '23505';
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_remove_team_member(p_team_id UUID, p_user_account_id UUID) AS $$
BEGIN
    DELETE FROM tbl_team_member WHERE team_id = p_team_id AND user_account_id = p_user_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_team_member not found: team % / user %', p_team_id, p_user_account_id
            USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_team_member_by_team(
    p_team_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS TABLE (
    team_id UUID, user_account_id UUID, role VARCHAR, joined_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.team_id, m.user_account_id, m.role, m.joined_at
    FROM tbl_team_member m
    WHERE m.team_id = p_team_id
    ORDER BY m.joined_at
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_team_member_by_user(
    p_user_account_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS TABLE (
    team_id UUID, user_account_id UUID, role VARCHAR, joined_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.team_id, m.user_account_id, m.role, m.joined_at
    FROM tbl_team_member m
    WHERE m.user_account_id = p_user_account_id
    ORDER BY m.joined_at
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_team_member_role(
    p_team_id UUID, p_user_account_id UUID, p_role VARCHAR(30)
) AS $$
BEGIN
    UPDATE tbl_team_member SET role = p_role
    WHERE team_id = p_team_id AND user_account_id = p_user_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_team_member not found: team % / user %', p_team_id, p_user_account_id
            USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_meeting
-- =====================================================================
CREATE FUNCTION usp_create_meeting(
    p_team_id UUID, p_owner_user_account_id UUID, p_title VARCHAR(255),
    p_meeting_date TIMESTAMPTZ, p_language_code CHAR(2) DEFAULT 'th'
) RETURNS UUID AS $$
DECLARE
    v_meeting_id UUID;
BEGIN
    INSERT INTO tbl_meeting (team_id, owner_user_account_id, title, meeting_date, language_code)
    VALUES (p_team_id, p_owner_user_account_id, p_title, p_meeting_date, p_language_code)
    RETURNING meeting_id INTO v_meeting_id;
    RETURN v_meeting_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_meeting(p_meeting_id UUID)
RETURNS TABLE (
    meeting_id UUID, team_id UUID, owner_user_account_id UUID, title VARCHAR,
    meeting_date TIMESTAMPTZ, language_code CHAR(2), status VARCHAR,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.meeting_id, m.team_id, m.owner_user_account_id, m.title, m.meeting_date,
           m.language_code, m.status, m.created_at, m.updated_at
    FROM tbl_meeting m
    WHERE m.meeting_id = p_meeting_id AND m.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_meeting_by_team(
    p_team_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS TABLE (
    meeting_id UUID, title VARCHAR, meeting_date TIMESTAMPTZ, status VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.meeting_id, m.title, m.meeting_date, m.status
    FROM tbl_meeting m
    WHERE m.team_id = p_team_id AND m.deleted_at IS NULL
    ORDER BY m.meeting_date DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_meeting(
    p_meeting_id UUID, p_title VARCHAR(255) DEFAULT NULL,
    p_meeting_date TIMESTAMPTZ DEFAULT NULL, p_status VARCHAR(20) DEFAULT NULL
) AS $$
BEGIN
    UPDATE tbl_meeting SET
        title = COALESCE(p_title, title),
        meeting_date = COALESCE(p_meeting_date, meeting_date),
        status = COALESCE(p_status, status)
    WHERE meeting_id = p_meeting_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_meeting not found or deleted: %', p_meeting_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_delete_meeting(p_meeting_id UUID) AS $$
BEGIN
    UPDATE tbl_meeting SET deleted_at = now()
    WHERE meeting_id = p_meeting_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_meeting not found or already deleted: %', p_meeting_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_participant
-- =====================================================================
CREATE FUNCTION usp_create_participant(
    p_display_name VARCHAR(120), p_email VARCHAR(255) DEFAULT NULL,
    p_linked_user_account_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_participant_id UUID;
BEGIN
    INSERT INTO tbl_participant (display_name, email, linked_user_account_id)
    VALUES (p_display_name, p_email, p_linked_user_account_id)
    RETURNING participant_id INTO v_participant_id;
    RETURN v_participant_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_participant(p_participant_id UUID)
RETURNS TABLE (
    participant_id UUID, display_name VARCHAR, email VARCHAR,
    linked_user_account_id UUID, created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.participant_id, p.display_name, p.email, p.linked_user_account_id, p.created_at
    FROM tbl_participant p
    WHERE p.participant_id = p_participant_id AND p.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_participant(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (participant_id UUID, display_name VARCHAR, email VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT p.participant_id, p.display_name, p.email
    FROM tbl_participant p
    WHERE p.deleted_at IS NULL
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_participant(
    p_participant_id UUID, p_display_name VARCHAR(120) DEFAULT NULL,
    p_email VARCHAR(255) DEFAULT NULL
) AS $$
BEGIN
    UPDATE tbl_participant SET
        display_name = COALESCE(p_display_name, display_name),
        email = COALESCE(p_email, email)
    WHERE participant_id = p_participant_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_participant not found or deleted: %', p_participant_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_delete_participant(p_participant_id UUID) AS $$
BEGIN
    UPDATE tbl_participant SET deleted_at = now()
    WHERE participant_id = p_participant_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_participant not found or already deleted: %', p_participant_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_meeting_participant
-- =====================================================================
CREATE PROCEDURE usp_add_meeting_participant(
    p_meeting_id UUID, p_participant_id UUID,
    p_speaker_label VARCHAR(20) DEFAULT NULL, p_role VARCHAR(30) DEFAULT NULL
) AS $$
BEGIN
    INSERT INTO tbl_meeting_participant (meeting_id, participant_id, speaker_label, role)
    VALUES (p_meeting_id, p_participant_id, p_speaker_label, p_role);
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'tbl_meeting_participant: participant % already in meeting %',
            p_participant_id, p_meeting_id USING ERRCODE = '23505';
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_remove_meeting_participant(p_meeting_id UUID, p_participant_id UUID) AS $$
BEGIN
    DELETE FROM tbl_meeting_participant
    WHERE meeting_id = p_meeting_id AND participant_id = p_participant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_meeting_participant not found: meeting % / participant %',
            p_meeting_id, p_participant_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_meeting_participant_by_meeting(
    p_meeting_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS TABLE (
    meeting_id UUID, participant_id UUID, speaker_label VARCHAR, role VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT mp.meeting_id, mp.participant_id, mp.speaker_label, mp.role
    FROM tbl_meeting_participant mp
    WHERE mp.meeting_id = p_meeting_id
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_meeting_participant(
    p_meeting_id UUID, p_participant_id UUID,
    p_speaker_label VARCHAR(20) DEFAULT NULL, p_role VARCHAR(30) DEFAULT NULL
) AS $$
BEGIN
    UPDATE tbl_meeting_participant SET
        speaker_label = COALESCE(p_speaker_label, speaker_label),
        role = COALESCE(p_role, role)
    WHERE meeting_id = p_meeting_id AND participant_id = p_participant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_meeting_participant not found: meeting % / participant %',
            p_meeting_id, p_participant_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_job
-- =====================================================================
CREATE FUNCTION usp_create_job(
    p_meeting_id UUID, p_requested_by_user_account_id UUID, p_job_type VARCHAR(20)
) RETURNS UUID AS $$
DECLARE
    v_job_id UUID;
BEGIN
    INSERT INTO tbl_job (meeting_id, requested_by_user_account_id, job_type)
    VALUES (p_meeting_id, p_requested_by_user_account_id, p_job_type)
    RETURNING job_id INTO v_job_id;
    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_job(p_job_id UUID)
RETURNS TABLE (
    job_id UUID, meeting_id UUID, requested_by_user_account_id UUID, job_type VARCHAR,
    status VARCHAR, error_message TEXT, queued_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT j.job_id, j.meeting_id, j.requested_by_user_account_id, j.job_type, j.status,
           j.error_message, j.queued_at, j.started_at, j.completed_at
    FROM tbl_job j
    WHERE j.job_id = p_job_id AND j.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_job_by_meeting(
    p_meeting_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0
) RETURNS TABLE (
    job_id UUID, job_type VARCHAR, status VARCHAR, queued_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT j.job_id, j.job_type, j.status, j.queued_at
    FROM tbl_job j
    WHERE j.meeting_id = p_meeting_id AND j.deleted_at IS NULL
    ORDER BY j.queued_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Handles the queued -> running -> completed/failed lifecycle: stamps
-- started_at / completed_at automatically on the matching transitions.
CREATE PROCEDURE usp_update_job_status(
    p_job_id UUID, p_status VARCHAR(20), p_error_message TEXT DEFAULT NULL
) AS $$
BEGIN
    UPDATE tbl_job SET
        status = p_status,
        error_message = COALESCE(p_error_message, error_message),
        started_at = CASE WHEN p_status = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
        completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END
    WHERE job_id = p_job_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_job not found or deleted: %', p_job_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_delete_job(p_job_id UUID) AS $$
BEGIN
    UPDATE tbl_job SET deleted_at = now()
    WHERE job_id = p_job_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_job not found or already deleted: %', p_job_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_transcript
-- =====================================================================
CREATE FUNCTION usp_create_transcript(
    p_job_id UUID, p_full_text TEXT, p_language_code CHAR(2), p_word_count INT DEFAULT NULL,
    p_chunk_count INT DEFAULT 1
) RETURNS BIGINT AS $$
DECLARE
    v_transcript_id BIGINT;
BEGIN
    INSERT INTO tbl_transcript (job_id, full_text, language_code, word_count, chunk_count)
    VALUES (p_job_id, p_full_text, p_language_code, COALESCE(p_word_count, array_length(regexp_split_to_array(trim(p_full_text), '\s+'), 1)), COALESCE(p_chunk_count, 1))
    RETURNING transcript_id INTO v_transcript_id;
    RETURN v_transcript_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'tbl_transcript: job % already has a transcript', p_job_id USING ERRCODE = '23505';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_transcript_by_job(p_job_id UUID)
RETURNS TABLE (
    transcript_id BIGINT, job_id UUID, full_text TEXT, language_code CHAR(2),
    word_count INT, created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT t.transcript_id, t.job_id, t.full_text, t.language_code, t.word_count, t.created_at
    FROM tbl_transcript t
    WHERE t.job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_transcript(p_transcript_id BIGINT, p_full_text TEXT DEFAULT NULL) AS $$
BEGIN
    UPDATE tbl_transcript SET
        full_text = COALESCE(p_full_text, full_text),
        word_count = CASE WHEN p_full_text IS NOT NULL
                          THEN array_length(regexp_split_to_array(trim(p_full_text), '\s+'), 1)
                          ELSE word_count END
    WHERE transcript_id = p_transcript_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_transcript not found: %', p_transcript_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_delete_transcript(p_transcript_id BIGINT) AS $$
BEGIN
    DELETE FROM tbl_transcript WHERE transcript_id = p_transcript_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_transcript not found: %', p_transcript_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_speaker_segment
-- =====================================================================
-- p_segments: JSONB array of {"speaker_label": "...", "start_time_ms": n,
-- "end_time_ms": n, "segment_text": "..."}. Bulk insert in one round trip.
CREATE FUNCTION usp_create_speaker_segment_batch(p_transcript_id BIGINT, p_segments JSONB)
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    INSERT INTO tbl_speaker_segment (transcript_id, speaker_label, start_time_ms, end_time_ms, segment_text)
    SELECT
        p_transcript_id,
        seg->>'speaker_label',
        (seg->>'start_time_ms')::INT,
        (seg->>'end_time_ms')::INT,
        seg->>'segment_text'
    FROM jsonb_array_elements(p_segments) AS seg;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_speaker_segment_by_transcript(
    p_transcript_id BIGINT, p_limit INT DEFAULT 500, p_offset INT DEFAULT 0
) RETURNS TABLE (
    speaker_segment_id BIGINT, speaker_label VARCHAR, start_time_ms INT,
    end_time_ms INT, segment_text TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.speaker_segment_id, s.speaker_label, s.start_time_ms, s.end_time_ms, s.segment_text
    FROM tbl_speaker_segment s
    WHERE s.transcript_id = p_transcript_id
    ORDER BY s.start_time_ms
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_delete_speaker_segment_by_transcript(p_transcript_id BIGINT)
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM tbl_speaker_segment WHERE transcript_id = p_transcript_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_summary
-- =====================================================================
CREATE FUNCTION usp_create_summary(
    p_job_id UUID, p_summary_text TEXT, p_model_used VARCHAR(60) DEFAULT 'qwen2.5:3b'
) RETURNS BIGINT AS $$
DECLARE
    v_summary_id BIGINT;
BEGIN
    INSERT INTO tbl_summary (job_id, summary_text, model_used)
    VALUES (p_job_id, p_summary_text, p_model_used)
    RETURNING summary_id INTO v_summary_id;
    RETURN v_summary_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'tbl_summary: job % already has a summary', p_job_id USING ERRCODE = '23505';
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_summary_by_job(p_job_id UUID)
RETURNS TABLE (
    summary_id BIGINT, job_id UUID, summary_text TEXT, model_used VARCHAR, created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.summary_id, s.job_id, s.summary_text, s.model_used, s.created_at
    FROM tbl_summary s
    WHERE s.job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_summary(p_summary_id BIGINT, p_summary_text TEXT DEFAULT NULL) AS $$
BEGIN
    UPDATE tbl_summary SET summary_text = COALESCE(p_summary_text, summary_text)
    WHERE summary_id = p_summary_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_summary not found: %', p_summary_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_delete_summary(p_summary_id BIGINT) AS $$
BEGIN
    DELETE FROM tbl_summary WHERE summary_id = p_summary_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_summary not found: %', p_summary_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_action_item
-- =====================================================================
CREATE FUNCTION usp_create_action_item(
    p_meeting_id UUID, p_description TEXT, p_summary_id BIGINT DEFAULT NULL,
    p_assignee_participant_id UUID DEFAULT NULL, p_due_date DATE DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_action_item_id BIGINT;
BEGIN
    INSERT INTO tbl_action_item (meeting_id, description, summary_id, assignee_participant_id, due_date)
    VALUES (p_meeting_id, p_description, p_summary_id, p_assignee_participant_id, p_due_date)
    RETURNING action_item_id INTO v_action_item_id;
    RETURN v_action_item_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_get_action_item(p_action_item_id BIGINT)
RETURNS TABLE (
    action_item_id BIGINT, meeting_id UUID, summary_id BIGINT, assignee_participant_id UUID,
    description TEXT, due_date DATE, status VARCHAR, created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.action_item_id, a.meeting_id, a.summary_id, a.assignee_participant_id,
           a.description, a.due_date, a.status, a.created_at
    FROM tbl_action_item a
    WHERE a.action_item_id = p_action_item_id AND a.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION usp_list_action_item_by_meeting(
    p_meeting_id UUID, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0,
    p_open_only BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
    action_item_id BIGINT, description TEXT, assignee_participant_id UUID,
    due_date DATE, status VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.action_item_id, a.description, a.assignee_participant_id, a.due_date, a.status
    FROM tbl_action_item a
    WHERE a.meeting_id = p_meeting_id
      AND a.deleted_at IS NULL
      AND (NOT p_open_only OR a.status NOT IN ('done', 'cancelled'))
    ORDER BY a.due_date NULLS LAST, a.created_at
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_update_action_item(
    p_action_item_id BIGINT, p_description TEXT DEFAULT NULL,
    p_assignee_participant_id UUID DEFAULT NULL, p_due_date DATE DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL
) AS $$
BEGIN
    UPDATE tbl_action_item SET
        description = COALESCE(p_description, description),
        assignee_participant_id = COALESCE(p_assignee_participant_id, assignee_participant_id),
        due_date = COALESCE(p_due_date, due_date),
        status = COALESCE(p_status, status)
    WHERE action_item_id = p_action_item_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_action_item not found or deleted: %', p_action_item_id USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE PROCEDURE usp_delete_action_item(p_action_item_id BIGINT) AS $$
BEGIN
    UPDATE tbl_action_item SET deleted_at = now()
    WHERE action_item_id = p_action_item_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'tbl_action_item not found or already deleted: %', p_action_item_id
            USING ERRCODE = 'P0002';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- usp_complete_job — atomic composite operation
-- Writes transcript + speaker segments (bulk) + summary, then marks the
-- job 'completed', all inside the single implicit transaction of this
-- function call. Any failure rolls back every part.
-- =====================================================================
CREATE FUNCTION usp_complete_job(
    p_job_id UUID,
    p_full_text TEXT,
    p_language_code CHAR(2),
    p_segments JSONB,
    p_summary_text TEXT,
    p_model_used VARCHAR(60) DEFAULT 'qwen2.5:3b'
) RETURNS TABLE (transcript_id BIGINT, summary_id BIGINT, segment_count INT) AS $$
DECLARE
    v_transcript_id BIGINT;
    v_summary_id BIGINT;
    v_segment_count INT;
BEGIN
    v_transcript_id := usp_create_transcript(p_job_id, p_full_text, p_language_code);
    v_segment_count := usp_create_speaker_segment_batch(v_transcript_id, p_segments);
    v_summary_id := usp_create_summary(p_job_id, p_summary_text, p_model_used);
    CALL usp_update_job_status(p_job_id, 'completed');

    RETURN QUERY SELECT v_transcript_id, v_summary_id, v_segment_count;
END;
$$ LANGUAGE plpgsql;
