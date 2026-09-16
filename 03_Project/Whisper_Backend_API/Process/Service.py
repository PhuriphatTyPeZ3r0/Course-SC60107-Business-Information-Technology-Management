import asyncio
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import torch
import whisperx
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

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

    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("config.yaml ระบุ device: cuda แต่ไม่พบ GPU บนเครื่องนี้")

    logger.info(
        "Loading whisper model '%s' on %s (compute_type=%s) ...",
        config["model_name"], device, config.get("compute_type", "int8"),
    )
    model = load_model(config["model_name"], device, config.get("compute_type", "int8"))

    language = config["language"]
    logger.info("Loading alignment model for language '%s' on %s ...", language, align_device)
    align_model, align_metadata = whisperx.load_align_model(
        language_code=language, device=align_device, model_name=config.get("align_model")
    )

    pipeline = WhisperPipeline(
        model=model,
        align_model=align_model,
        align_metadata=align_metadata,
        device=device,
        align_device=align_device,
        language=language,
        batch_size=config.get("batch_size", 16),
    )
    gate = BoundedSerialGate(
        config.get("max_queue_size", 10), min_free_vram_mb=config.get("min_free_vram_mb")
    )

    summarizer = OllamaSummarizer(
        base_url=os.environ.get("OLLAMA_BASE_URL", config.get("ollama_base_url", "http://ollama:11434")),
        model=config.get("ollama_model", "qwen2.5:3b"),
    )

    # Just constructs the wrapper; the actual pyannote pipeline (and its HF
    # token check) loads lazily on the first mono /diarize request.
    diarization_pipeline = LazyDiarizationPipeline(hf_token=os.environ.get("HF_TOKEN"), device="cpu")

    logger.info("Model ready, serving requests.")

    yield

    logger.info("Shutting down.")


app = FastAPI(title="Whisper Backend API", lifespan=lifespan)


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
    files fall back to ML speaker diarization (pyannote, dynamic speaker
    count, labeled SPEAKER_1/SPEAKER_2/...) since there's no channel to
    split. Anything else (3+ channels) is rejected.
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
                    pipeline.transcribe_text_only, tmp_path, max_duration_sec, timeout=timeout
                )
            # CPU-only pyannote work runs outside the GPU gate so it doesn't
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
