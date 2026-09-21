-- Whisper_DB schema (PostgreSQL)
-- Naming convention: tbl_/vw_/fn_/usp_/idx_/pk_/fk_/trg_/seq_ prefixes,
-- snake_case, singular table names, <entity>_id primary keys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared trigger function: keeps updated_at current on every UPDATE.
CREATE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- tbl_user_account
-- =====================================================================
CREATE TABLE tbl_user_account (
    user_account_id UUID NOT NULL DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(120) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_tbl_user_account PRIMARY KEY (user_account_id),
    CONSTRAINT uq_tbl_user_account_email UNIQUE (email)
);

CREATE TRIGGER trg_tbl_user_account_set_updated_at
    BEFORE UPDATE ON tbl_user_account
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =====================================================================
-- tbl_team
-- =====================================================================
CREATE TABLE tbl_team (
    team_id     UUID NOT NULL DEFAULT gen_random_uuid(),
    team_name   VARCHAR(150) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT pk_tbl_team PRIMARY KEY (team_id)
);

CREATE TRIGGER trg_tbl_team_set_updated_at
    BEFORE UPDATE ON tbl_team
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =====================================================================
-- tbl_team_member (junction: team <-> user_account)
-- =====================================================================
CREATE TABLE tbl_team_member (
    team_id         UUID NOT NULL,
    user_account_id UUID NOT NULL,
    role            VARCHAR(30) NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_tbl_team_member PRIMARY KEY (team_id, user_account_id),
    CONSTRAINT fk_tbl_team_member_team
        FOREIGN KEY (team_id) REFERENCES tbl_team (team_id) ON DELETE CASCADE,
    CONSTRAINT fk_tbl_team_member_user_account
        FOREIGN KEY (user_account_id) REFERENCES tbl_user_account (user_account_id) ON DELETE CASCADE,
    CONSTRAINT ck_tbl_team_member_role
        CHECK (role IN ('owner', 'admin', 'member'))
);

-- Reverse lookup: teams a given user belongs to (composite PK above only
-- serves team_id-first lookups).
CREATE INDEX idx_tbl_team_member_user_account_id
    ON tbl_team_member (user_account_id);

-- =====================================================================
-- tbl_meeting
-- =====================================================================
CREATE TABLE tbl_meeting (
    meeting_id              UUID NOT NULL DEFAULT gen_random_uuid(),
    team_id                 UUID NOT NULL,
    owner_user_account_id   UUID NOT NULL,
    title                   VARCHAR(255) NOT NULL,
    meeting_date            TIMESTAMPTZ NOT NULL,
    language_code           CHAR(2) NOT NULL DEFAULT 'th',
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
    -- Original uploaded filename, display-only (see FRONTEND_HANDOFF.md;
    -- added for the frontend integration, not in the original design).
    source_file_name        VARCHAR(255),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT pk_tbl_meeting PRIMARY KEY (meeting_id),
    CONSTRAINT fk_tbl_meeting_team
        FOREIGN KEY (team_id) REFERENCES tbl_team (team_id) ON DELETE RESTRICT,
    CONSTRAINT fk_tbl_meeting_owner_user_account
        FOREIGN KEY (owner_user_account_id) REFERENCES tbl_user_account (user_account_id) ON DELETE RESTRICT,
    CONSTRAINT ck_tbl_meeting_status
        CHECK (status IN ('draft', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_tbl_meeting_team_id ON tbl_meeting (team_id);
CREATE INDEX idx_tbl_meeting_owner_user_account_id ON tbl_meeting (owner_user_account_id);
CREATE INDEX idx_tbl_meeting_meeting_date ON tbl_meeting (meeting_date);

-- Partial index: dashboards poll "not finished yet" far more than history.
CREATE INDEX idx_tbl_meeting_status_active
    ON tbl_meeting (status)
    WHERE status IN ('draft', 'processing');

CREATE TRIGGER trg_tbl_meeting_set_updated_at
    BEFORE UPDATE ON tbl_meeting
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =====================================================================
-- tbl_participant
-- =====================================================================
CREATE TABLE tbl_participant (
    participant_id          UUID NOT NULL DEFAULT gen_random_uuid(),
    display_name            VARCHAR(120) NOT NULL,
    email                   VARCHAR(255),
    linked_user_account_id  UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT pk_tbl_participant PRIMARY KEY (participant_id),
    CONSTRAINT fk_tbl_participant_linked_user_account
        FOREIGN KEY (linked_user_account_id) REFERENCES tbl_user_account (user_account_id) ON DELETE SET NULL
);

-- Partial: most participants are not linked to a login, keep the index small.
CREATE INDEX idx_tbl_participant_linked_user_account_id
    ON tbl_participant (linked_user_account_id)
    WHERE linked_user_account_id IS NOT NULL;

-- =====================================================================
-- tbl_meeting_participant (junction: meeting <-> participant)
-- =====================================================================
CREATE TABLE tbl_meeting_participant (
    meeting_id      UUID NOT NULL,
    participant_id  UUID NOT NULL,
    speaker_label   VARCHAR(20),
    role            VARCHAR(30),
    CONSTRAINT pk_tbl_meeting_participant PRIMARY KEY (meeting_id, participant_id),
    CONSTRAINT fk_tbl_meeting_participant_meeting
        FOREIGN KEY (meeting_id) REFERENCES tbl_meeting (meeting_id) ON DELETE CASCADE,
    CONSTRAINT fk_tbl_meeting_participant_participant
        FOREIGN KEY (participant_id) REFERENCES tbl_participant (participant_id) ON DELETE CASCADE
);

-- Reverse lookup: meetings a given participant attended.
CREATE INDEX idx_tbl_meeting_participant_participant_id
    ON tbl_meeting_participant (participant_id);

-- =====================================================================
-- tbl_job
-- =====================================================================
CREATE TABLE tbl_job (
    job_id                          UUID NOT NULL DEFAULT gen_random_uuid(),
    meeting_id                      UUID NOT NULL,
    requested_by_user_account_id    UUID NOT NULL,
    job_type                        VARCHAR(20) NOT NULL,
    status                          VARCHAR(20) NOT NULL DEFAULT 'queued',
    error_message                   TEXT,
    queued_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at                      TIMESTAMPTZ,
    completed_at                    TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                      TIMESTAMPTZ,
    CONSTRAINT pk_tbl_job PRIMARY KEY (job_id),
    CONSTRAINT fk_tbl_job_meeting
        FOREIGN KEY (meeting_id) REFERENCES tbl_meeting (meeting_id) ON DELETE CASCADE,
    CONSTRAINT fk_tbl_job_requested_by_user_account
        FOREIGN KEY (requested_by_user_account_id) REFERENCES tbl_user_account (user_account_id) ON DELETE RESTRICT,
    CONSTRAINT ck_tbl_job_job_type
        CHECK (job_type IN ('transcribe', 'diarize', 'summarize')),
    CONSTRAINT ck_tbl_job_status
        CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

CREATE INDEX idx_tbl_job_meeting_id ON tbl_job (meeting_id);
CREATE INDEX idx_tbl_job_requested_by_user_account_id ON tbl_job (requested_by_user_account_id);

-- Partial index: mirrors BoundedSerialGate's live-queue polling
-- (Process/Service.py) — most jobs end up 'completed', keep the hot
-- "still in flight" index tiny.
CREATE INDEX idx_tbl_job_status_active
    ON tbl_job (status)
    WHERE status IN ('queued', 'running');

CREATE TRIGGER trg_tbl_job_set_updated_at
    BEFORE UPDATE ON tbl_job
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =====================================================================
-- tbl_transcript
-- =====================================================================
CREATE TABLE tbl_transcript (
    transcript_id   BIGSERIAL NOT NULL,
    job_id          UUID NOT NULL,
    full_text       TEXT NOT NULL,
    language_code   CHAR(2) NOT NULL,
    word_count      INT,
    full_text_tsv   TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', full_text)) STORED,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_tbl_transcript PRIMARY KEY (transcript_id),
    CONSTRAINT fk_tbl_transcript_job
        FOREIGN KEY (job_id) REFERENCES tbl_job (job_id) ON DELETE CASCADE,
    CONSTRAINT uq_tbl_transcript_job_id UNIQUE (job_id)
);

-- Full-text search across meeting history (SME "search past meetings" use case).
CREATE INDEX idx_tbl_transcript_full_text_tsv
    ON tbl_transcript USING GIN (full_text_tsv);

-- =====================================================================
-- tbl_speaker_segment
-- =====================================================================
CREATE TABLE tbl_speaker_segment (
    speaker_segment_id  BIGSERIAL NOT NULL,
    transcript_id       BIGINT NOT NULL,
    speaker_label        VARCHAR(20) NOT NULL,
    start_time_ms        INT NOT NULL,
    end_time_ms          INT NOT NULL,
    segment_text          TEXT NOT NULL,
    CONSTRAINT pk_tbl_speaker_segment PRIMARY KEY (speaker_segment_id),
    CONSTRAINT fk_tbl_speaker_segment_transcript
        FOREIGN KEY (transcript_id) REFERENCES tbl_transcript (transcript_id) ON DELETE CASCADE,
    CONSTRAINT ck_tbl_speaker_segment_time_range
        CHECK (end_time_ms > start_time_ms)
);

-- Composite covering index: "segments of transcript X, ordered by time" is
-- the dominant query pattern; INCLUDE lets it be answered index-only.
CREATE INDEX idx_tbl_speaker_segment_transcript_id_start_time_ms
    ON tbl_speaker_segment (transcript_id, start_time_ms)
    INCLUDE (speaker_label);
-- At larger scale (append-only, insertion-ordered), consider replacing the
-- above with a BRIN index on transcript_id — much smaller, still effective
-- for this access pattern.

-- =====================================================================
-- tbl_summary
-- =====================================================================
CREATE TABLE tbl_summary (
    summary_id    BIGSERIAL NOT NULL,
    job_id        UUID NOT NULL,
    summary_text  TEXT NOT NULL,
    model_used    VARCHAR(60) NOT NULL DEFAULT 'qwen2.5:3b',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_tbl_summary PRIMARY KEY (summary_id),
    CONSTRAINT fk_tbl_summary_job
        FOREIGN KEY (job_id) REFERENCES tbl_job (job_id) ON DELETE CASCADE,
    CONSTRAINT uq_tbl_summary_job_id UNIQUE (job_id)
);

-- =====================================================================
-- tbl_action_item
-- =====================================================================
CREATE TABLE tbl_action_item (
    action_item_id            BIGSERIAL NOT NULL,
    meeting_id                UUID NOT NULL,
    summary_id                BIGINT,
    assignee_participant_id   UUID,
    description                TEXT NOT NULL,
    due_date                   DATE,
    status                     VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                 TIMESTAMPTZ,
    CONSTRAINT pk_tbl_action_item PRIMARY KEY (action_item_id),
    CONSTRAINT fk_tbl_action_item_meeting
        FOREIGN KEY (meeting_id) REFERENCES tbl_meeting (meeting_id) ON DELETE CASCADE,
    CONSTRAINT fk_tbl_action_item_summary
        FOREIGN KEY (summary_id) REFERENCES tbl_summary (summary_id) ON DELETE SET NULL,
    CONSTRAINT fk_tbl_action_item_assignee_participant
        FOREIGN KEY (assignee_participant_id) REFERENCES tbl_participant (participant_id) ON DELETE SET NULL,
    CONSTRAINT ck_tbl_action_item_status
        CHECK (status IN ('open', 'in_progress', 'done', 'cancelled'))
);

CREATE INDEX idx_tbl_action_item_meeting_id ON tbl_action_item (meeting_id);
CREATE INDEX idx_tbl_action_item_assignee_participant_id ON tbl_action_item (assignee_participant_id);

-- Partial index: open-task dashboards are the hottest query on this table.
CREATE INDEX idx_tbl_action_item_status_open
    ON tbl_action_item (status)
    WHERE status NOT IN ('done', 'cancelled');

CREATE TRIGGER trg_tbl_action_item_set_updated_at
    BEFORE UPDATE ON tbl_action_item
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
