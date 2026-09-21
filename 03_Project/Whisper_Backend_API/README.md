# Whisper Backend API

FastAPI backend that transcribes, diarizes, and summarizes audio in any language Whisper supports (Thai and English are
warmed up by default). Wraps
[WhisperX](https://github.com/m-bain/whisperX) (large-v3, word-level alignment)
for transcription, [SpeechBrain](https://speechbrain.github.io/) (ECAPA speaker embeddings)
for mono-file speaker diarization, and the [Gemini API](https://ai.google.dev/)
for summarization —
packaged as Docker containers for a single GPU with a tight VRAM budget.

## Structure

```text
Whisper_Backend_API/
├── main.py                      # Entry point: loads config, runs uvicorn (workers=1, see below)
├── config.yaml                  # Model, device, and serving configuration
├── API_SPEC.md                  # API reference: endpoints, schemas, errors, examples
├── requirements.txt             # Python dependencies
├── docker-compose.yaml          # whisper-api service + postgres
├── Dockerfile                   # whisper-api image
├── .dockerignore
├── Process/
│   ├── Service.py               # FastAPI app: routes, request gating, error handling
│   ├── Process.py               # WhisperPipeline: transcribe + word-level alignment
│   ├── diarization_pipeline.py  # Lazy-loaded SpeechBrain pipeline (mono-file diarization)
│   ├── diarize.py               # Merges channel/speaker turns into a diarized transcript
│   ├── audio_channels.py        # Channel probing and stereo-channel splitting
│   ├── summarize.py             # GeminiSummarizer: calls the Gemini API
│   ├── vram_guard.py            # Free-VRAM check used to admission-gate GPU requests
│   └── errors.py                # Typed API errors mapped to HTTP status codes
├── scripts/
│   └── prefetch_models.py       # Pre-downloads whisper/align/diarization models at build time
└── utils/
    ├── load_utils.py            # Config loading and model loading helpers
    └── speaker_model.py         # Loads the SpeechBrain speaker model (shared by service and build)
```

## What it does

- **`POST /transcribe`** — upload an audio file, get back a full transcript
  with word-level timestamps (WhisperX). The language is detected
  automatically per request — nothing to configure; see `align_models` in
  `config.yaml` for languages needing an explicit alignment model.
- **`POST /diarize`** — speaker-attributed transcript. Stereo (2-channel)
  files are split by channel (labeled `A`/`B`, no ML needed); mono files fall
  back to SpeechBrain speaker diarization (no token needed; two speakers by
  default via `diarize_num_speakers`, labeled `A`, `B`, `C`, ... by first
  appearance). Each segment is returned as `start`, `end`, `speaker`, `text`.
  Anything else (3+ channels) is rejected.
- **`POST /summarize`** — transcribes, then summarizes the text via the
  Gemini API.
- **`GET /health`** — `{"status": "ok"}` once the models are loaded,
  `{"status": "loading"}` before that.

Allowed formats, size/duration caps, timeouts, and queue depth are all set in
`config.yaml`. Requests are served one GPU job at a time through a bounded
FIFO queue (`BoundedSerialGate` in `Process/Service.py`); once the queue is
full, new requests get a `QueueFullError` instead of piling up. A free-VRAM
check gates admission so a burst of requests can't crash the process with a
CUDA out-of-memory error.

Full request/response reference: [API_SPEC.md](API_SPEC.md).

## Setup

1. Review `config.yaml` — notably `device`/`compute_type` (defaults assume an
   NVIDIA GPU with a tight VRAM budget: `int8` compute keeps large-v3 to
   ~1.5–1.7GB) and `min_free_vram_mb` (the whole card's free VRAM, not just
   this container's usage).

## Run

```bash
docker compose up --build
```

This starts `whisper-api` — the FastAPI service (GPU-reserved), on
`http://localhost:8050`.

Summarization calls the Gemini API, so set `GEMINI_API_KEY` in `.env`
(see `.env.example`) before starting.

`workers` is pinned to `1` in `main.py` — the model is loaded once per
process and the request queue/lock in `Service.py` is per-process state, not
shared across workers, so it cannot be scaled via extra uvicorn workers.

## Notes

- `.env` is gitignored at the project level — never commit real tokens.
- Audio files (`*.mp3`, `*.wav`, `*.flac`) are gitignored at the repo root.
- The GPU budget is fully committed to whisper (see the
  `compute_type`/`align_device` comments in `config.yaml`); summarization runs
  remotely on Gemini.
- Speaker separation for mono files and the alignment models also run on CPU.
- Not yet verified end to end: a full `docker compose up --build` and mono
  `/diarize` against real audio.
