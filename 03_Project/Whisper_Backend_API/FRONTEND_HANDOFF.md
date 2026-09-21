# Frontend integration — architecture & status

The `whisper-frontend` app (Next.js, `03_Project/whisper-frontend/`) was
built against a mocked API before this backend integration existed. This
doc records how the two now fit together for real, what's still
simplified, and what the Cloudflare Workers port (see `CLAUDE.md`) will
eventually need to replace.

Also reflects the backend rewrite pulled in from the team afterward
(Service_Dev branch): diarization moved from pyannote to SpeechBrain
(no HF token needed anymore, any language), and Ollama moved out to its
own `03_Project/Summarize_Model` project joined over an external Docker
network. See `API_SPEC.md` for the transcribe/diarize/summarize contract
itself — this doc only covers the new persistence/meetings layer.

## How to run the integrated stack

```bash
cd 03_Project/Summarize_Model
docker compose up -d --build   # start this first - creates the summarize-net network

cd ../Whisper_Backend_API
cp .env.example .env           # defaults are fine for local dev
docker compose up --build      # postgres + whisper-api (joins summarize-net)
```

```bash
cd 03_Project/whisper-frontend
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8050" > .env.local
npm run dev
```

Without `.env.local`, the frontend falls back to its own mocked
`app/api/**` route handlers (canned Thai transcript, instant "processing" —
see that folder for the mock implementation). Setting
`NEXT_PUBLIC_API_BASE_URL` switches every call in
`whisper-frontend/src/lib/api/client.ts` to the real backend below —
no other frontend code changes needed.

## What's real now

- **Database**: Postgres, added as a `postgres` service in
  `docker-compose.yaml`, initialized from the existing `schema.sql` +
  `stored_procedures.sql` (kept as-is, plus one new column — see below).
  Host port `5433` (not `5432` — this machine already has a native Postgres
  on `5432`); containers talk to each other over the internal Docker
  network at `postgres:5432` regardless.
- **New REST routes** in `Process/Service.py`, matching the frontend's
  contract exactly (paths, camelCase JSON):
  - `POST /api/auth/login`, `POST /api/auth/signup`
  - `GET /api/meetings`, `POST /api/meetings` (multipart: `title` + `file`)
  - `GET /api/meetings/{id}`
  - `PATCH /api/action-items/{id}`
- **Persistence layer**: `Process/db.py`, an asyncpg pool calling the
  existing stored procedures for writes and simple reads. Composite reads
  (full meeting detail, action items with assignee names) use plain joined
  SQL instead, since none of the `usp_list_*` procs project everything the
  frontend needs in one call — the procs remain the way every write
  happens.
- **Real async pipeline**: `POST /api/meetings` creates the meeting + three
  `tbl_job` rows (`transcribe`/`diarize`/`summarize`, all `queued`), then
  runs `_run_meeting_pipeline()` as a FastAPI background task — the actual
  WhisperX transcription, stereo-split-or-SpeechBrain diarization, and
  Ollama summarization, updating each job's status in Postgres as it
  progresses. This is the same GPU-serialization (`BoundedSerialGate`) and
  stereo/mono branching the existing `/transcribe`, `/diarize`,
  `/summarize` endpoints already use (mono uses `transcribe_with_chars` +
  `build_mono_diarized_transcript`, matching `/diarize`'s own mono path) —
  nothing about those three endpoints changed.
- **CORS**: `CORSMiddleware` added, origin from `CORS_ORIGIN` env var
  (defaults to `http://localhost:3000`).
- **Schema change**: added `tbl_meeting.source_file_name VARCHAR(255)` —
  wasn't in the original design, needed so the frontend can show the
  uploaded filename. Not yet reflected in a Cloudflare/D1 equivalent.

## Known simplifications (by design, given the deadline)

- **Auth has no real password check.** `usp_create_user_account` does
  store a real bcrypt hash (via pgcrypto), but `POST /api/auth/login` only
  looks the account up by email and ignores the password entirely. The
  frontend never sends its token back on later requests either, so there's
  no bearer-token verification anywhere. Fine for a single-tenant demo;
  not fine for anything real — actual verification (`crypt(password,
  password_hash) = password_hash`) is a small, contained follow-up.
- **Single shared team.** Every signed-up user is added to one seeded
  "Demo Team" (`db.ensure_demo_seed()`); there's no team creation, invites,
  or switching, matching the frontend's own "single default team, no
  switcher" scope.
- **Participants have no real identity.** There's no speaker-recognition
  step, so each meeting's participants are just its detected speaker labels
  (`A`, `B`, `C`, ... for both stereo and mono now) turned into
  `tbl_participant` rows named after the label itself. Real named
  participants would need a "who is speaker A" UI that doesn't exist yet.
- **No action-item extraction.** The Ollama summarizer produces a prose
  summary only — nothing parses it into structured action items, and the
  frontend has no "add action item" UI either. Real meetings currently
  finish with an empty action-items list (the frontend's empty state
  already handles this). Getting real action items means a second LLM
  call asking for structured JSON output, plus a UI to create/edit them
  manually.
- **No audio playback / long-term file storage.** The uploaded file is
  read into a temp path for processing and deleted afterward — matches the
  frontend's "text only, no audio player" scope decision.

## Relationship to the Cloudflare Workers port

This integration is a **parallel path**, not a replacement for the
Cloudflare plan in `CLAUDE.md` — it exists to have something fully real and
demoable given the 2026-09-23 deadline, while the from-scratch Workers/D1/
R2/Queues/Workers-AI build (zero code written yet, as of this writing)
remains future work. When picking that back up:

- The REST contract this backend now implements (routes, camelCase shapes)
  is the same one the Worker needs to implement — this Postgres/FastAPI
  version is effectively a reference implementation of that contract.
- `schema.sql`'s new `source_file_name` column needs porting into the D1
  schema too.
- The auth/participants/action-items simplifications above apply equally
  to the Cloudflare version — they're product scope decisions, not
  Postgres-specific shortcuts.
