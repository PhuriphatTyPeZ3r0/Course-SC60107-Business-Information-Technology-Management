# Whisper Backend API — Specification

Reference for calling the API. For deployment and project structure see [README.md](README.md).

- **Base URL:** `http://localhost:8050` (port set by `port` in `config.yaml`)
- **Interactive docs:** `http://localhost:8050/docs` (FastAPI's generated Swagger UI)
- **Format:** every endpoint except `/health` takes a `multipart/form-data` upload with one field, `file`, and answers with JSON (UTF-8).
- **Auth:** none. Do not expose the port to untrusted networks.
- **Times:** all `start`/`end`/`duration_sec` values are seconds (floats) from the start of the audio.

| Method | Path          | Purpose                                                        |
| ------ | ------------- | -------------------------------------------------------------- |
| GET    | `/health`     | Service status                                                 |
| POST   | `/transcribe` | Transcript with word-level timestamps                          |
| POST   | `/diarize`    | Transcript split by speaker (A, B, C, ...)                     |
| POST   | `/summarize`  | Transcript plus a short summary (via the Gemini API) |

## Input rules (all upload endpoints)

Defaults from `config.yaml`; check the deployed file if they were changed.

| Rule                | Value                                            | Error when violated               |
| ------------------- | ------------------------------------------------ | --------------------------------- |
| File extension      | `.wav .mp3 .m4a .flac .ogg .webm`                | `415 UNSUPPORTED_FORMAT`          |
| File size           | at most 25 MB                                    | `413 FILE_TOO_LARGE`              |
| Audio duration      | at most 1800 s (30 min)                          | `413 AUDIO_TOO_LONG`              |
| Processing time     | at most 600 s for transcription (`request_timeout_sec`) | `504 PROCESSING_TIMEOUT`   |

**Language:** detected automatically from the audio (Whisper large-v3, from roughly the first 30 s). Nothing to send or configure. Thai and English are set up and warmed at startup; other languages are still transcribed, but their alignment model downloads on first use and, if none exists, `/transcribe` returns no word-level timing. A call that switches language part-way is handled as its opening language.

**Concurrency:** requests run one GPU job at a time through a queue of at most 10. Beyond that you get `429 QUEUE_FULL`; retry later.

---

## `GET /health`

`200`
```json
{ "status": "ok" }
```
`status` is `"ok"` once the models are loaded. While the service is still starting up it does not accept connections yet, so a refused connection means "not ready".

```bash
curl http://localhost:8050/health
```

---

## `POST /transcribe`

Full transcript with word-level timestamps (Whisper + forced alignment).

**Request:** `file` = the audio file.

**Response `200`**
```json
{
  "text": "สวัสดีค่ะ สยามไฟเบอร์ ...",
  "language": "th",
  "duration_sec": 26.09,
  "segments": [
    {
      "start": 0.03,
      "end": 6.1,
      "text": "สวัสดีค่ะ สยามไฟเบอร์ ยินดีให้บริการ",
      "words": [
        { "word": "สวัสดีค่ะ", "start": 0.03, "end": 0.9, "score": 0.91 }
      ]
    }
  ]
}
```

| Field                  | Type         | Notes                                                                 |
| ---------------------- | ------------ | --------------------------------------------------------------------- |
| `text`                 | string       | All segment texts joined by spaces                                    |
| `language`             | string       | Detected ISO code, e.g. `th`, `en`                                    |
| `duration_sec`         | number       | Length of the audio                                                   |
| `segments[].start/end` | number       | Segment time range                                                    |
| `segments[].text`      | string       | Segment text                                                          |
| `segments[].words[]`   | array        | `word`, `start`, `end`, `score` (alignment confidence). `start`/`end`/`score` can be `null` for tokens alignment could not time (for example digits). Empty when no alignment model exists for the language |

```bash
curl -F "file=@call.mp3" http://localhost:8050/transcribe
```

---

## `POST /diarize`

Transcript attributed to speakers. Behaviour depends on the number of audio channels:

| Channels        | Method                                                                                          | Speakers               |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| 2 (stereo)      | Left and right channels are transcribed separately and merged by time. No ML separation needed. | `A` = left, `B` = right |
| 1 (mono)        | SpeechBrain ECAPA speaker embeddings + clustering (no token needed). Text is cut at speaker changes using character-level timing. | `A`, `B`, `C`, ... in order of first appearance |
| 3 or more       | Rejected: `422 UNSUPPORTED_CHANNEL_LAYOUT`                                                       | —                      |

For call recordings, stereo with staff and customer on separate channels is the most accurate input.

**Request:** `file` = the audio file.

**Response `200`**
```json
{
  "language": "th",
  "duration_sec": 26.09,
  "segments": [
    { "start": 0.1,  "end": 6.1,  "speaker": "A", "text": "สวัสดีค่ะ สยามไฟเบอร์ ยินดีให้บริการ" },
    { "start": 7.1,  "end": 15.0, "speaker": "B", "text": "อินเทอร์เน็ตที่บ้านใช้งานไม่ได้ตั้งแต่ช่วงเช้า" }
  ]
}
```

Each segment has the fields in this order: `start`, `end`, `speaker`, `text`.

Notes:
- Mono diarization assumes **two speakers** by default (`diarize_num_speakers` in `config.yaml`; `0` lets the model guess, which tends to over-split). To get `C` and beyond, raise that number.
- Speaker labels are per response: `A` is simply the first voice heard. They do not identify a role (staff or customer).
- Turn boundaries in mono files can be off by about one second and may cut a word at a speaker change.
- `speaker` can be `UNKNOWN` for text that falls where no speaker was detected.
- The speaker-separation step for mono files runs on CPU and is not covered by the 600 s timeout, so long mono files take longer.
- If the speaker model cannot load: `503 MONO_DIARIZATION_UNAVAILABLE` (stereo files are unaffected).

```bash
curl -F "file=@call.mp3" http://localhost:8050/diarize
```

---

## `POST /summarize`

Transcribes the audio (segment-level, no alignment), then asks the Gemini API (`gemini-2.5-flash` by default, see `gemini_model` in `config.yaml`) for a short summary. The prompt is in Thai, so summaries come back in Thai.

**Request:** `file` = the audio file.

**Response `200`**
```json
{
  "summary": "ลูกค้าแจ้งว่าอินเทอร์เน็ตที่บ้านใช้ไม่ได้ตั้งแต่เช้า ...",
  "transcript": "สวัสดีค่ะ สยามไฟเบอร์ ...",
  "language": "th",
  "duration_sec": 26.09
}
```

Requires `GEMINI_API_KEY` to be set. If Gemini cannot be reached or rejects the request: `502 SUMMARIZER_UNAVAILABLE`.

```bash
curl -F "file=@call.mp3" http://localhost:8050/summarize
```

---

## Errors

Application errors share one shape:

```json
{ "error": { "code": "FILE_TOO_LARGE", "message": "ไฟล์ใหญ่เกิน 25 MB" } }
```

Messages may be in Thai or English; match on `code`, not `message`.

| HTTP | `code`                        | Cause                                                              |
| ---- | ----------------------------- | ------------------------------------------------------------------ |
| 413  | `FILE_TOO_LARGE`              | Upload larger than `max_file_size_mb`                              |
| 413  | `AUDIO_TOO_LONG`              | Audio longer than `max_duration_sec`                               |
| 415  | `UNSUPPORTED_FORMAT`          | Extension not in `allowed_extensions`                              |
| 422  | `UNSUPPORTED_CHANNEL_LAYOUT`  | `/diarize` given audio with 3 or more channels                     |
| 429  | `QUEUE_FULL`                  | Request queue is full; retry later                                 |
| 502  | `SUMMARIZER_UNAVAILABLE`      | `/summarize` could not reach Gemini                                |
| 503  | `MODEL_NOT_READY`             | Models are not loaded yet                                          |
| 503  | `VRAM_EXHAUSTED`              | Free GPU memory below `min_free_vram_mb`; retry later              |
| 503  | `MONO_DIARIZATION_UNAVAILABLE`| The speaker-separation model could not be loaded (mono `/diarize`) |
| 504  | `PROCESSING_TIMEOUT`          | Transcription exceeded `request_timeout_sec`                       |

Any other unexpected failure surfaces as a plain `500` from the server (not the shape above). A request that does not send the `file` field is rejected by FastAPI itself with `422` and its own body (`{"detail": [...]}`), not the shape above.

## Example: calling from Python

```python
import httpx

with open("call.mp3", "rb") as f:
    r = httpx.post(
        "http://localhost:8050/diarize",
        files={"file": ("call.mp3", f, "audio/mpeg")},
        timeout=700,  # a bit above request_timeout_sec
    )

if r.status_code == 200:
    for seg in r.json()["segments"]:
        print(f'{seg["start"]:.1f} - {seg["end"]:.1f} {seg["speaker"]} : {seg["text"]}')
else:
    print(r.status_code, r.json()["error"]["code"])
```
