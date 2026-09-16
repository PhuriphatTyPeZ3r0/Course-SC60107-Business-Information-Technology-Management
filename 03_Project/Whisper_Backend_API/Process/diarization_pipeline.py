from pyannote.audio import Pipeline

from Process.errors import MonoDiarizationUnavailableError

DIARIZATION_MODEL = "pyannote/speaker-diarization-3.1"


class LazyDiarizationPipeline:
    """Wraps pyannote's speaker-diarization pipeline for mono audio.

    Loaded lazily on the first mono /diarize request (not at startup like
    whisper/alignment) because it needs a gated-model Hugging Face token
    that may be missing or invalid; failing here must not take down
    transcribe/summarize/stereo-diarize, which need no token at all.
    """

    def __init__(self, hf_token: str | None, device: str = "cpu"):
        self._hf_token = hf_token
        self._device = device
        self._pipeline = None
        self._load_failed = False

    def _ensure_loaded(self):
        if self._pipeline is not None:
            return
        if self._load_failed:
            raise MonoDiarizationUnavailableError(
                "ตัวแยกผู้พูดสำหรับไฟล์ mono โหลดไม่สำเร็จก่อนหน้านี้ ตรวจสอบ HF_TOKEN แล้วรีสตาร์ท service"
            )
        if not self._hf_token:
            self._load_failed = True
            raise MonoDiarizationUnavailableError(
                "ไม่ได้ตั้งค่า HF_TOKEN — จำเป็นสำหรับการแยกผู้พูดในไฟล์ mono (ไฟล์ stereo ยังใช้งานได้ปกติ)"
            )
        try:
            import torch

            pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, token=self._hf_token)
            pipeline.to(torch.device(self._device))
        except Exception as e:
            self._load_failed = True
            raise MonoDiarizationUnavailableError(f"โหลดตัวแยกผู้พูดไม่สำเร็จ: {e}") from e
        self._pipeline = pipeline

    def diarize(self, audio_path: str) -> list[dict]:
        """Returns [{"start": float, "end": float, "speaker": str}, ...] turns.

        `speaker` is pyannote's native label (e.g. "SPEAKER_00"); callers
        that want a stable, readable numbering should relabel themselves.
        """
        self._ensure_loaded()
        annotation = self._pipeline(audio_path)
        turns = [
            {"start": float(segment.start), "end": float(segment.end), "speaker": str(speaker)}
            for segment, _track, speaker in annotation.itertracks(yield_label=True)
        ]
        turns.sort(key=lambda t: t["start"])
        return turns
