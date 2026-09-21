import asyncio
import logging
import os
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import torch
import whisperx
from fastapi import BackgroundTasks, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from Process import db
from Process.audio_channels import probe_channel_count, split_stereo_channels
from Process.diarization_pipeline import LazyDiarizationPipeline
from Process.diarize import build_mono_diarized_transcript, merge_channel_transcripts
from Process.errors import (
    ApiError,
    FileTooLargeError,
    ModelNotReadyError,
    ProcessingTimeoutError,
    QueueFullError,
    UnsupportedChannelLayoutError,
    UnsupportedFormatError,
    VramExhaustedError,
)
from Process.Process import WhisperPipeline
from Process.summarize import OllamaSummarizer
from Process.vram_guard import free_vram_mb
from utils.load_utils import load_config, load_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whisper_api")

CONFIG_PATH = os.environ.get("CONFIG_PATH", "config.yaml")

pipeline: WhisperPipeline | None = None
summarizer: OllamaSummarizer | None = None
diarization_pipeline: LazyDiarizationPipeline | None = None
config: dict = {}


class BoundedSerialGate:
    """Serializes GPU access to one request at a time behind a bounded FIFO queue.

    The capacity check and slot increment happen with no `await` between them,
    so they're atomic on the single-threaded event loop; `async with gate`
    then waits its turn on an asyncio.Lock, whose waiter list is FIFO.

    A VRAM check gates admission (before any slot is reserved or the lock is
    awaited): a best-effort snapshot at admission time, not a guarantee for
    whenever this request's turn actually comes, but simple and correct to
    reason about with no risk of a partial acquire/release mismatch.
    """

    def __init__(self, max_queue_size: int, min_free_vram_mb: float | None = None):
        self._lock = asyncio.Lock()
        self._max_waiting = max_queue_size
        self._occupied = 0  # 1 running + up to max_waiting queued
        self._min_free_vram_mb = min_free_vram_mb

    async def __aenter__(self):
        if self._occupied >= self._max_waiting + 1:
            raise QueueFullError("เซิร์ฟเวอร์กำลังประมวลผลเต็มคิว กรุณาลองใหม่ภายหลัง")

        if self._min_free_vram_mb is not None:
            free_mb = await asyncio.to_thread(free_vram_mb)
            if free_mb is not None and free_mb < self._min_free_vram_mb:
                raise VramExhaustedError(free_mb, self._min_free_vram_mb)

        self._occupied += 1
        await self._lock.acquire()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        self._lock.release()
        self._occupied -= 1


gate: BoundedSerialGate | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline, config, gate, summarizer, diarization_pipeline

    config = load_config(CONFIG_PATH)
    device = config.get("device", "cuda")
    align_device = config.get("align_device", "cpu")

    await db.init_pool()
    await db.ensure_demo_seed()

    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("config.yaml ระบุ device: cuda แต่ไม่พบ GPU บนเครื่องนี้")

    logger.info(
        "Loading whisper model '%s' on %s (compute_type=%s) ...",
        config["model_name"], device, config.get("compute_type", "int8"),
    )
    model = load_model(config["model_name"], device, config.get("compute_type", "int8"))

    pipeline = WhisperPipeline(
        model=model,
        align_models=config.get("align_models", {}),
        device=device,
        align_device=align_device,
        batch_size=config.get("batch_size", 16),
    )
    # Aligners for other languages load on first use; these are just ready up front.
    for language in config.get("warm_align_languages", []):
        pipeline.load_aligner(language)

    gate = BoundedSerialGate(
        config.get("max_queue_size", 10), min_free_vram_mb=config.get("min_free_vram_mb")
    )

    summarizer = OllamaSummarizer(
        base_url=os.environ.get("OLLAMA_BASE_URL", config.get("ollama_base_url", "http://ollama:11434")),
        model=config.get("ollama_model", "qwen2.5:3b"),
    )

    # Just constructs the wrapper; the SpeechBrain speaker model loads lazily
    # on the first mono /diarize request.
    diarization_pipeline = LazyDiarizationPipeline(
        device="cpu", num_speakers=config.get("diarize_num_speakers", 2) or None
    )

    logger.info("Model ready, serving requests.")

    yield

    logger.info("Shutting down.")
    await db.close_pool()


app = FastAPI(title="Whisper Backend API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("CORS_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


def _ensure_ready() -> None:
    if pipeline is None or gate is None or summarizer is None or diarization_pipeline is None:
        raise ModelNotReadyError("โมเดลกำลังโหลด กรุณาลองใหม่อีกครั้ง")


def _validate_extension(filename: str | None) -> str:
    ext = Path(filename or "").suffix.lower()
    allowed = config.get("allowed_extensions", [])
    if ext not in allowed:
        raise UnsupportedFormatError(f"ไม่รองรับนามสกุล '{ext}' (รองรับ: {', '.join(allowed)})")
    return ext


async def _save_upload_to_tmp(file: UploadFile, ext: str, max_size_bytes: int) -> str:
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=ext)
    try:
        with os.fdopen(tmp_fd, "wb") as out:
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_size_bytes:
                    raise FileTooLargeError(f"ไฟล์ใหญ่เกิน {max_size_bytes // (1024 * 1024)} MB")
                out.write(chunk)
    except Exception:
        os.remove(tmp_path)
        raise
    return tmp_path


async def _run_with_timeout(func, *args, timeout: float):
    try:
        return await asyncio.wait_for(asyncio.to_thread(func, *args), timeout=timeout)
    except asyncio.TimeoutError:
        raise ProcessingTimeoutError(f"การประมวลผลเกิน {timeout:.0f} วินาที") from None


@app.get("/health")
async def health():
    return {"status": "ok" if pipeline is not None else "loading"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    tmp_path = None
    try:
        _ensure_ready()
        ext = _validate_extension(file.filename)
        tmp_path = await _save_upload_to_tmp(file, ext, config.get("max_file_size_mb", 25) * 1024 * 1024)

        async with gate:
            result = await _run_with_timeout(
                pipeline.transcribe,
                tmp_path,
                config.get("max_duration_sec"),
                timeout=config.get("request_timeout_sec", 300),
            )
        return result
    except ApiError as e:
        return _error(e.status_code, e.code, str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/summarize")
async def summarize(file: UploadFile = File(...)):
    tmp_path = None
    try:
        _ensure_ready()
        ext = _validate_extension(file.filename)
        tmp_path = await _save_upload_to_tmp(file, ext, config.get("max_file_size_mb", 25) * 1024 * 1024)
        timeout = config.get("request_timeout_sec", 300)

        async with gate:
            transcript = await _run_with_timeout(
                pipeline.transcribe_text_only, tmp_path, config.get("max_duration_sec"), timeout=timeout
            )
            summary = await summarizer.summarize(transcript["text"])

        return {
            "summary": summary,
            "transcript": transcript["text"],
            "language": transcript["language"],
            "duration_sec": transcript["duration_sec"],
        }
    except ApiError as e:
        return _error(e.status_code, e.code, str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/diarize")
async def diarize(file: UploadFile = File(...)):
    """Stereo (2ch) files are channel-split (A=left, B=right); mono (1ch)
    files fall back to ML speaker diarization (SpeechBrain ECAPA embeddings +
    clustering, no token needed; speakers labeled A, B, C, ... by first
    appearance) since there's no channel to split. Anything else (3+ channels) is rejected.
    """
    tmp_path = None
    left_path = None
    right_path = None
    try:
        _ensure_ready()
        ext = _validate_extension(file.filename)
        tmp_path = await _save_upload_to_tmp(file, ext, config.get("max_file_size_mb", 25) * 1024 * 1024)

        channels = probe_channel_count(tmp_path)
        timeout = config.get("request_timeout_sec", 300)
        max_duration_sec = config.get("max_duration_sec")

        if channels == 2:
            left_fd, left_path = tempfile.mkstemp(suffix=".wav")
            right_fd, right_path = tempfile.mkstemp(suffix=".wav")
            os.close(left_fd)
            os.close(right_fd)
            split_stereo_channels(tmp_path, left_path, right_path)

            async with gate:
                channel_a = await _run_with_timeout(
                    pipeline.transcribe_text_only, left_path, max_duration_sec, timeout=timeout
                )
                channel_b = await _run_with_timeout(
                    pipeline.transcribe_text_only, right_path, max_duration_sec, timeout=timeout
                )
            return merge_channel_transcripts(channel_a, channel_b, label_a="A", label_b="B")

        if channels == 1:
            async with gate:
                transcript = await _run_with_timeout(
                    pipeline.transcribe_with_chars, tmp_path, max_duration_sec, timeout=timeout
                )
            # CPU-only speaker-separation work runs outside the GPU gate so it doesn't
            # hold up other requests waiting on the GPU.
            turns = await asyncio.to_thread(diarization_pipeline.diarize, tmp_path)
            return build_mono_diarized_transcript(transcript, turns)

        raise UnsupportedChannelLayoutError(channels)
    except ApiError as e:
        return _error(e.status_code, e.code, str(e))
    finally:
        for p in (tmp_path, left_path, right_path):
            if p and os.path.exists(p):
                os.remove(p)


# =============================================================================
# Persistence-backed API: meetings / teams / jobs / action items.
#
# This is the contract whisper-frontend's src/lib/api/client.ts already
# expects (see FRONTEND_HANDOFF.md) - paths, camelCase field names, and
# response shapes are matched exactly so the frontend needs zero changes,
# only NEXT_PUBLIC_API_BASE_URL pointed at this server.
#
# Auth here is intentionally minimal (see FRONTEND_HANDOFF.md): real user
# rows via usp_create_user_account (real bcrypt hash through pgcrypto), but
# login never checks the password - it only looks the account up by email.
# The frontend doesn't send the returned token back on later requests
# either, so there's no bearer-token verification to implement here.
# =============================================================================


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    displayName: str


class ActionItemStatusRequest(BaseModel):
    meetingId: str
    status: str


VALID_ACTION_ITEM_STATUSES = {"open", "in_progress", "done", "cancelled"}


@app.post("/api/auth/login")
async def login(body: LoginRequest):
    user = await db.get_user_by_email(body.email)
    if user is None:
        return _error(401, "INVALID_CREDENTIALS", "Invalid email or password")
    return {"token": uuid.uuid4().hex, "user": user}


@app.post("/api/auth/signup")
async def signup(body: SignupRequest):
    try:
        user = await db.create_user_account(body.email, body.password, body.displayName)
    except db.DuplicateEmailError:
        return _error(409, "EMAIL_EXISTS", f"Email already exists: {body.email}")
    return {"token": uuid.uuid4().hex, "user": user}


@app.get("/api/meetings")
async def list_meetings():
    return {"meetings": await db.list_team_meetings()}


@app.get("/api/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    meeting = await db.get_meeting_full(meeting_id)
    if meeting is None:
        return _error(404, "NOT_FOUND", "Meeting not found")
    return {"meeting": meeting}


@app.post("/api/meetings")
async def create_meeting(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    file: UploadFile = File(...),
):
    tmp_path = None
    try:
        _ensure_ready()
        ext = _validate_extension(file.filename)
        tmp_path = await _save_upload_to_tmp(file, ext, config.get("max_file_size_mb", 25) * 1024 * 1024)

        # Every meeting is attributed to the single seeded demo user,
        # regardless of who's "logged in" on the frontend - it never sends
        # its login token back on later requests (see FRONTEND_HANDOFF.md).
        demo_user = await db.get_user_by_email(db.DEMO_USER_EMAIL)
        created = await db.create_meeting_with_jobs(demo_user["id"], title, file.filename)
        meeting_id = created["meetingId"]
        job_ids = created["jobIds"]

        background_tasks.add_task(_run_meeting_pipeline, meeting_id, job_ids, tmp_path)

        meeting = await db.get_meeting_full(meeting_id)
        return JSONResponse(status_code=201, content={"meeting": meeting})
    except ApiError as e:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
        return _error(e.status_code, e.code, str(e))


@app.patch("/api/action-items/{action_item_id}")
async def patch_action_item(action_item_id: str, body: ActionItemStatusRequest):
    if body.status not in VALID_ACTION_ITEM_STATUSES:
        return _error(400, "INVALID_STATUS", f"Invalid status: {body.status}")
    action_item = await db.update_action_item_status(action_item_id, body.status)
    if action_item is None:
        return _error(404, "NOT_FOUND", "Action item not found")
    return {"actionItem": action_item}


async def _run_meeting_pipeline(meeting_id: str, job_ids: dict[str, str], tmp_path: str) -> None:
    """Runs transcribe -> diarize -> summarize for one uploaded meeting,
    updating each stage's tbl_job row as it progresses so the frontend's
    polling UI (queued -> running -> completed) reflects real work.
    Mirrors the /diarize route's stereo-split-vs-mono-speaker-model
    branching, but interleaved with per-stage DB updates instead of
    returning a single JSON response.
    """
    try:
        _ensure_ready()
        max_duration_sec = config.get("max_duration_sec")
        timeout = config.get("request_timeout_sec", 300)

        await db.set_job_status(job_ids["transcribe"], "running")
        channels = await asyncio.to_thread(probe_channel_count, tmp_path)

        if channels == 2:
            left_fd, left_path = tempfile.mkstemp(suffix=".wav")
            right_fd, right_path = tempfile.mkstemp(suffix=".wav")
            os.close(left_fd)
            os.close(right_fd)
            try:
                await asyncio.to_thread(split_stereo_channels, tmp_path, left_path, right_path)
                async with gate:
                    channel_a = await _run_with_timeout(
                        pipeline.transcribe_text_only, left_path, max_duration_sec, timeout=timeout
                    )
                    channel_b = await _run_with_timeout(
                        pipeline.transcribe_text_only, right_path, max_duration_sec, timeout=timeout
                    )
                await db.set_job_status(job_ids["transcribe"], "completed")
                await db.set_job_status(job_ids["diarize"], "running")
                combined = merge_channel_transcripts(channel_a, channel_b, label_a="A", label_b="B")
                await db.set_job_status(job_ids["diarize"], "completed")
            finally:
                for p in (left_path, right_path):
                    if os.path.exists(p):
                        os.remove(p)
        elif channels == 1:
            async with gate:
                transcript = await _run_with_timeout(
                    pipeline.transcribe_with_chars, tmp_path, max_duration_sec, timeout=timeout
                )
            await db.set_job_status(job_ids["transcribe"], "completed")
            await db.set_job_status(job_ids["diarize"], "running")
            turns = await asyncio.to_thread(diarization_pipeline.diarize, tmp_path)
            combined = build_mono_diarized_transcript(transcript, turns)
            await db.set_job_status(job_ids["diarize"], "completed")
        else:
            raise UnsupportedChannelLayoutError(channels)

        full_text = " ".join(seg["text"] for seg in combined["segments"]).strip()
        await db.save_transcript(job_ids["transcribe"], full_text, combined["language"], combined["segments"])
        speaker_labels = sorted({seg["speaker"] for seg in combined["segments"]})
        await db.ensure_speaker_participants(meeting_id, speaker_labels)

        await db.set_job_status(job_ids["summarize"], "running")
        summary_text = await summarizer.summarize(full_text)
        await db.save_summary(job_ids["summarize"], summary_text, config.get("ollama_model", "qwen2.5:3b"))
        await db.set_job_status(job_ids["summarize"], "completed")

        await db.set_meeting_status(meeting_id, "completed")
    except Exception as e:
        logger.exception("Meeting pipeline failed for meeting %s", meeting_id)
        message = str(e) if isinstance(e, ApiError) else "Processing failed unexpectedly"
        await db.fail_pending_jobs(meeting_id, message)
        await db.set_meeting_status(meeting_id, "failed")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
