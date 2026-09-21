# Whisper Cloudflare API

The Cloudflare Workers port planned in `../Whisper_Backend_API/CLAUDE.md`,
implementing the exact same REST contract as that project's local
Postgres/FastAPI integration (see its `FRONTEND_HANDOFF.md`) so
`whisper-frontend` needs zero changes - only `NEXT_PUBLIC_API_BASE_URL`
pointed at this Worker's URL.

**Status: deployed and verified live**, 2026-09-21. Runs entirely on the
free Workers plan by design (see `CLAUDE.md`'s hard constraint); model
free-tier eligibility was re-verified the same day (see "Model status"
below) since Cloudflare moves models behind Paid over time.

- **Live URL**: `https://whisper-api.phuriphathem.workers.dev`
- **Verified end-to-end** via `curl`: signup, login, meeting list, and a
  real upload through the full pipeline (Workers AI Whisper transcription
  -> Workers AI Llama summarization -> D1 persistence) - all jobs completed
  in ~4 seconds for a short test clip. `whisper-frontend/.env.local` is
  currently pointed at this URL.
- **Deployed via the raw Cloudflare API, not `wrangler deploy`** - see
  "Deployment method" below for why and what that changes day-to-day.

## Structure

```text
Whisper_Cloudflare_API/
├── wrangler.jsonc          # Worker config: D1, Workers AI bindings (reference/local-dev; see Deployment method)
├── migrations/0001_init.sql  # D1 (SQLite) port of ../Whisper_Backend_API/schema.sql - already applied to the live D1 database
└── src/
    ├── index.ts             # Routes on the native Request/Response API, matches the frontend's contract exactly (no framework - see Deployment method)
    ├── db.ts                # D1 queries - no stored procedures on D1, all logic here
    ├── pipeline.ts           # Workers AI transcribe + summarize orchestration
    ├── wav.ts                # Pure-TS WAV parsing/channel-splitting (see below)
    ├── auth.ts               # PBKDF2 password hashing via Web Crypto API
    └── types.ts              # Shared types, mirrors whisper-frontend/src/lib/types.ts
```

## Deployment method

This was deployed through the **Cloudflare API directly** (via an
authenticated MCP connection), not `wrangler login` + `wrangler deploy` -
local `wrangler` on this machine was never authenticated. Practically:

- The D1 database (`whisper-cloudflare-db`, id in `wrangler.jsonc`) was
  created and migrated via the D1 HTTP API.
- The Worker script was bundled with esbuild and uploaded via
  `PUT /accounts/{account_id}/workers/scripts/{name}` (multipart, with
  `d1`/`ai`/`plain_text` bindings in the metadata part), then its
  `workers.dev` subdomain route was enabled via the API.
- **`src/index.ts` deliberately has no framework dependency** (originally
  written against Hono): the raw API's multipart script upload takes
  inline module content, and a full Hono bundle was ~2600 lines - too
  large to pass reliably through that path. Rewritten on native
  `Request`/`Response`/`URL` instead, which bundles to ~500 lines/23KB.
- **R2 was never provisioned** - `POST /accounts/{id}/r2/buckets` requires
  R2 to be manually enabled via the dashboard first (one-time,
  account-level, not API-automatable), and R2 isn't used by the pipeline
  yet anyway (see below). `wrangler.jsonc` has no `r2_buckets` binding as
  a result.

**To manage this the normal way going forward** (recommended once someone
runs `wrangler login` on a dev machine): `wrangler.jsonc` and
`migrations/0001_init.sql` already describe the live resources accurately,
so `wrangler deploy` and `wrangler d1 migrations apply --remote` should
work against them without changes - just note the D1 database and Worker
script already exist under those exact names, so wrangler will update
them in place rather than create new ones.

## Setup (once `wrangler login` is available)

```bash
npm install
npx wrangler login
npm run deploy           # updates the existing live Worker
```

For local dev against local (not remote) D1 emulation:

```bash
npm run db:migrate:local
npm run dev
```

## Architecture decisions and known gaps versus the local backend

- **No ffmpeg.** Workers have no subprocess execution. The local FastAPI
  backend shells out to ffmpeg to probe channel count and split stereo
  audio; here, `src/wav.ts` parses/splits **uncompressed PCM WAV** by hand
  instead. Non-WAV files (mp3/m4a/flac/ogg/webm) are still accepted and
  transcribed fine (Workers AI's Whisper model decodes them server-side),
  but stereo speaker-splitting only works for WAV input - a non-WAV stereo
  file degrades to single-speaker transcription. Mono files never got
  ML diarization on Cloudflare anyway (see CLAUDE.md: "Workers AI has no
  diarization model"), so this only narrows the stereo case.
- **Synchronous pipeline, no Queues yet.** `POST /api/meetings` runs
  transcribe -> diarize (stereo split) -> summarize inline and only
  responds once done, rather than the local backend's true background-task
  model. This is deliberate: `waitUntil()` only grants ~30s of extra
  runtime after the response is sent, nowhere near enough for real
  transcription, whereas a Workers Free request has no wall-clock limit
  while the client stays connected. The frontend's queued/running/completed
  polling UI still works, it just sees `processing` for one longer stretch
  instead of granular per-stage updates. **Next slice**: move this behind
  Cloudflare Queues (upload -> R2 -> enqueue -> consumer Worker) so it
  survives past a single request's lifetime and can report granular
  progress - required for genuinely long recordings anyway.
- **Auth, participants, action-items**: same simplifications as the local
  backend (see `../Whisper_Backend_API/FRONTEND_HANDOFF.md`) - real user
  records via PBKDF2 hashing, but login doesn't verify the password; single
  shared demo team; participants are just speaker labels; no action-item
  extraction from the summary yet.
- **R2 bucket is provisioned but unused so far** - the current pipeline
  processes the upload in-memory within the request. Storing the audio in
  R2 becomes necessary once processing moves behind Queues (a consumer
  Worker needs to read the file from somewhere other than the original
  request).

## Model status (re-verified 2026-09-21 against developers.cloudflare.com)

- `@cf/openai/whisper-large-v3-turbo` - confirmed free-plan eligible, no
  paid/beta/deprecation notice.
- `@cf/meta/llama-3.1-8b-instruct` (the model CLAUDE.md originally named) -
  **gone, 404s now.** Use `@cf/meta/llama-3.1-8b-instruct-fp8` instead
  (confirmed free-plan eligible, no restriction notice) - already what
  `src/pipeline.ts` calls.
- Workers Free plan fundamentals confirmed: 10,000 shared Neurons/day;
  10ms CPU-time limit per invocation counts only the Worker's own JS
  execution, not time spent awaiting Workers AI/D1/R2 calls; D1 free tier
  5GB storage / 5M rows read / 100K rows written per day; R2 free tier
  10GB storage; Queues free since 2026-02-04, 10,000 ops/day, 24h retention.
