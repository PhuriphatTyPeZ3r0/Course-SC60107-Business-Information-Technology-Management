# Whisper_Backend_API — Cloudflare deployment rules

## Hard constraint: Workers Free plan only

This project's Cloudflare deployment **must stay on the Workers Free plan — $0/month, no exceptions**. Every resource choice below must fit inside free-tier limits. Do not select a paid-tier-only model, enable a paid add-on, or design a flow that assumes Workers Paid, even if it would be simpler or more capable.

Known free-tier limits relevant to this project (verified against Cloudflare docs, 2026-09):
- **Workers AI**: 10,000 Neurons/day shared across *all* models — transcription (Whisper) and summarization (LLM) draw from the same daily pool. Some resource-intensive models (e.g. Kimi K2, GLM-5.2) now require Workers Paid — confirm any model choice is still listed as free-plan-eligible in the Workers AI model catalog before using it.
- **D1**: serverless SQLite, free-tier row read/write and storage caps apply — schema uses SQLite dialect (`TEXT` UUID PKs, no stored procedures/functions — all business logic lives in the Worker's TypeScript code).
- **R2**: used for storing uploaded meeting audio; free tier includes 10GB storage with no egress fees.
- **Queues**: available on Workers Free plan since 2026-02-04 — 10,000 operations/day, 24h message retention (vs 14 days on paid). Used for async processing of long transcription jobs so they don't hit the Worker's per-request execution time limit.

## Architecture decisions made for the Cloudflare port

- Diarization: **stereo-channel-split only** (no ML, matches the original `audio_channels.py` logic). Mono-file `pyannote` diarization from the original Docker/GPU pipeline is **dropped** — Workers AI has no diarization model.
- Transcription: `@cf/openai/whisper-large-v3-turbo` via Workers AI (replaces self-hosted WhisperX).
- Summarization: `@cf/meta/llama-3.1-8b-instruct` via Workers AI — chosen specifically to conserve the shared 10,000 Neurons/day free budget (a 70B-class model burns through it far faster). Re-verify this model is still free-plan-eligible before relying on it long-term; Cloudflare has moved other large models behind Paid over time.
- Runtime: TypeScript (native Workers), camelCase function naming (`createMeeting`, `getTeam`, etc.) — no `usp_` prefix in this layer, that convention is Postgres-specific.
- Password hashing: PBKDF2 via Web Crypto API (no pgcrypto on D1).
- Full-text search: SQLite FTS5 virtual table (replaces Postgres `TSVECTOR`/GIN).
- Long transcription jobs (30–60+ min meetings) run through Cloudflare Queues (upload → R2 → enqueue → consumer Worker → update `tbl_job`/D1 equivalent status) instead of a single synchronous request, to stay under Worker execution time limits.

## Relationship to the existing Postgres setup

`schema.sql` and `stored_procedures.sql` (PostgreSQL, 51 stored procedures/functions) are **kept as a parallel local-dev path** — not deprecated. They are not the source of truth for the Cloudflare deployment; the D1 schema is a separate, SQLite-dialect port of the same 11-table design.
