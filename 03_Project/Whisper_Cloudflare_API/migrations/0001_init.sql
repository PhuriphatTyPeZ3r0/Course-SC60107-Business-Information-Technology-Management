-- D1 (SQLite) port of ../Whisper_Backend_API/schema.sql's 11-table design.
-- See CLAUDE.md for why this differs from the Postgres original:
--   * TEXT ids (crypto.randomUUID() in the Worker), not native UUID
--   * No pgcrypto/bcrypt - password_hash holds a PBKDF2 hash (see src/auth.ts)
--   * No triggers - updated_at is set explicitly by each UPDATE statement
--   * No stored procedures/functions - all business logic lives in src/*.ts
--   * INTEGER PRIMARY KEY AUTOINCREMENT instead of BIGSERIAL
--   * No TSVECTOR/FTS full-text search yet (future work, not in the
--     frontend's current contract)

CREATE TABLE user_account (
    user_account_id TEXT PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE team (
    team_id     TEXT PRIMARY KEY,
    team_name   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);

CREATE TABLE team_member (
    team_id         TEXT NOT NULL REFERENCES team (team_id) ON DELETE CASCADE,
    user_account_id TEXT NOT NULL REFERENCES user_account (user_account_id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at       TEXT NOT NULL,
    PRIMARY KEY (team_id, user_account_id)
);
CREATE INDEX idx_team_member_user_account_id ON team_member (user_account_id);

CREATE TABLE meeting (
    meeting_id            TEXT PRIMARY KEY,
    team_id               TEXT NOT NULL REFERENCES team (team_id),
    owner_user_account_id TEXT NOT NULL REFERENCES user_account (user_account_id),
    title                 TEXT NOT NULL,
    meeting_date          TEXT NOT NULL,
    language_code         TEXT NOT NULL DEFAULT 'th',
    status                TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
    source_file_name      TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    deleted_at            TEXT
);
CREATE INDEX idx_meeting_team_id ON meeting (team_id);

CREATE TABLE participant (
    participant_id TEXT PRIMARY KEY,
    display_name   TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    deleted_at     TEXT
);

CREATE TABLE meeting_participant (
    meeting_id     TEXT NOT NULL REFERENCES meeting (meeting_id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES participant (participant_id) ON DELETE CASCADE,
    speaker_label  TEXT,
    PRIMARY KEY (meeting_id, participant_id)
);

CREATE TABLE job (
    job_id                       TEXT PRIMARY KEY,
    meeting_id                   TEXT NOT NULL REFERENCES meeting (meeting_id) ON DELETE CASCADE,
    requested_by_user_account_id TEXT NOT NULL REFERENCES user_account (user_account_id),
    job_type                     TEXT NOT NULL CHECK (job_type IN ('transcribe', 'diarize', 'summarize')),
    status                       TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    error_message                TEXT,
    queued_at                    TEXT NOT NULL,
    started_at                   TEXT,
    completed_at                 TEXT,
    deleted_at                   TEXT
);
CREATE INDEX idx_job_meeting_id ON job (meeting_id);

CREATE TABLE transcript (
    transcript_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        TEXT NOT NULL UNIQUE REFERENCES job (job_id) ON DELETE CASCADE,
    full_text     TEXT NOT NULL,
    language_code TEXT NOT NULL,
    word_count    INTEGER,
    created_at    TEXT NOT NULL
);

CREATE TABLE speaker_segment (
    speaker_segment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    transcript_id       INTEGER NOT NULL REFERENCES transcript (transcript_id) ON DELETE CASCADE,
    speaker_label        TEXT NOT NULL,
    start_time_ms         INTEGER NOT NULL,
    end_time_ms           INTEGER NOT NULL,
    segment_text          TEXT NOT NULL
);
CREATE INDEX idx_speaker_segment_transcript_id ON speaker_segment (transcript_id, start_time_ms);

CREATE TABLE summary (
    summary_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       TEXT NOT NULL UNIQUE REFERENCES job (job_id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    model_used   TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE TABLE action_item (
    action_item_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id              TEXT NOT NULL REFERENCES meeting (meeting_id) ON DELETE CASCADE,
    summary_id              INTEGER REFERENCES summary (summary_id) ON DELETE SET NULL,
    assignee_participant_id TEXT REFERENCES participant (participant_id) ON DELETE SET NULL,
    description             TEXT NOT NULL,
    due_date                TEXT,
    status                  TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    deleted_at              TEXT
);
CREATE INDEX idx_action_item_meeting_id ON action_item (meeting_id);
