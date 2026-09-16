# Whisper Backend API

FastAPI backend that transcribes, diarizes, and summarizes Thai audio. Wraps
[WhisperX](https://github.com/m-bain/whisperX) (large-v3, word-level alignment)
for transcription, [pyannote.audio](https://github.com/pyannote/pyannote-audio)
for mono-file speaker diarization, and a local [Ollama](https://ollama.com/)
model for summarization — packaged to run as two Docker containers on a
single GPU with a tight VRAM budget.

## Structure

```text
Whisper_Backend_API/
├── main.py                      # Entry point: loads config, runs uvicorn (workers=1, see below)
├── config.yaml                  # Model, device, and serving configuration
├── .env.example                 # Template for .env (HF_TOKEN); copy and fill in, never commit .env
├── requirements.txt             # Python dependencies
├── docker-compose.yaml          # whisper-api + ollama services
├── Dockerfile                   # whisper-api image
├── Dockerfile.ollama            # ollama image (CPU-only, pulls qwen2.5:3b)
├── .dockerignore
├── Process/
│   ├── Service.py               # FastAPI app: routes, request gating, error handling
│   ├── Process.py               # WhisperPipeline: transcribe + word-level alignment
│   ├── diarization_pipeline.py  # Lazy-loaded pyannote pipeline (mono-file diarization)
│   ├── diarize.py               # Merges channel/speaker turns into a diarized transcript
│   ├── audio_channels.py        # Channel probing and stereo-channel splitting
│   ├── summarize.py             # OllamaSummarizer: talks to the Ollama container
│   ├── vram_guard.py            # Free-VRAM check used to admission-gate GPU requests
│   └── errors.py                # Typed API errors mapped to HTTP status codes
├── scripts/
│   └── prefetch_models.py       # Pre-downloads whisper/align/diarization models at build time
└── utils/
    └── load_utils.py            # Config loading and model loading helpers
```

## What it does

- **`POST /transcribe`** — upload an audio file, get back a full transcript
  with word-level timestamps (WhisperX, Thai by default).
- **`POST /diarize`** — speaker-attributed transcript. Stereo (2-channel)
  files are split by channel (labeled `A`/`B`, no ML needed); mono files fall
  back to pyannote speaker diarization (dynamic speaker count, labeled
  `SPEAKER_1`, `SPEAKER_2`, ...). Anything else (3+ channels) is rejected.
- **`POST /summarize`** — transcribes, then summarizes the text via the
  Ollama container.
- **`GET /health`** — `{"status": "ok"}` once the models are loaded,
  `{"status": "loading"}` before that.

Allowed formats, size/duration caps, timeouts, and queue depth are all set in
`config.yaml`. Requests are served one GPU job at a time through a bounded
FIFO queue (`BoundedSerialGate` in `Process/Service.py`); once the queue is
full, new requests get a `QueueFullError` instead of piling up. A free-VRAM
check gates admission so a burst of requests can't crash the process with a
CUDA out-of-memory error.

## Setup

1. Copy the env template and fill in the Hugging Face token (only needed for
   mono-file `/diarize`; stereo `/diarize`, `/transcribe`, and `/summarize`
   all work without it):
   ```bash
   cp .env.example .env
   ```
   Get a token at https://huggingface.co/settings/tokens, and while logged
   in accept the license on both:
   - https://huggingface.co/pyannote/speaker-diarization-3.1
   - https://huggingface.co/pyannote/segmentation-3.0

2. Review `config.yaml` — notably `device`/`compute_type` (defaults assume an
   NVIDIA GPU with a tight VRAM budget: `int8` compute keeps large-v3 to
   ~1.5–1.7GB) and `min_free_vram_mb` (the whole card's free VRAM, not just
   this container's usage).

## Run

```bash
docker compose up --build
```

This builds and starts two containers:
- `whisper-api` — the FastAPI service (GPU-reserved), on `http://localhost:8050`
- `ollama` — CPU-only, auto-pulls `qwen2.5:3b` on build; `whisper-api` waits
  for its healthcheck before starting

`workers` is pinned to `1` in `main.py` — the model is loaded once per
process and the request queue/lock in `Service.py` is per-process state, not
shared across workers, so it cannot be scaled via extra uvicorn workers.

## Notes

- `.env` is gitignored at the project level — never commit real tokens.
- Audio files (`*.mp3`, `*.wav`, `*.flac`) are gitignored at the repo root.
- Ollama runs CPU-only by design; the GPU budget is fully committed to
  whisper (see the `compute_type`/`align_device` comments in `config.yaml`).
