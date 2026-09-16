import whisperx

from Process.errors import AudioTooLongError, LanguageMismatchError

SAMPLE_RATE = 16000


class WhisperPipeline:
    """Transcribe (+ optionally word-align) a single audio file.

    One instance wraps model weights already resident on the GPU, so callers
    must serialize access themselves (see Service.py's BoundedSerialGate)
    rather than relying on this class for concurrency safety.
    """

    def __init__(
        self,
        model,
        align_model,
        align_metadata,
        device: str,
        align_device: str,
        language: str,
        batch_size: int = 16,
    ):
        self.model = model
        self.align_model = align_model
        self.align_metadata = align_metadata
        self.device = device
        # Alignment runs on a separate device (CPU) from the whisper model
        # (GPU) on purpose — see config.yaml's align_device comment for why.
        self.align_device = align_device
        self.language = language
        self.batch_size = batch_size

    def _transcribe_raw(self, audio_path: str, max_duration_sec: float | None):
        audio = whisperx.load_audio(audio_path)
        duration_sec = len(audio) / SAMPLE_RATE
        if max_duration_sec is not None and duration_sec > max_duration_sec:
            raise AudioTooLongError(duration_sec, max_duration_sec)

        # No `language=` kwarg here on purpose: detection must run every time
        # so a mismatch against the configured language can be caught before
        # we spend GPU time on alignment.
        result = self.model.transcribe(audio, batch_size=self.batch_size)
        detected_language = result.get("language")
        if detected_language != self.language:
            raise LanguageMismatchError(detected_language, self.language)

        return result, audio, duration_sec

    def transcribe(self, audio_path: str, max_duration_sec: float | None = None) -> dict:
        """Full pipeline: transcribe + word-level forced alignment."""
        result, audio, duration_sec = self._transcribe_raw(audio_path, max_duration_sec)

        aligned = whisperx.align(
            result["segments"],
            self.align_model,
            self.align_metadata,
            audio,
            self.align_device,
            return_char_alignments=False,
        )
        return self._format_aligned(aligned, duration_sec)

    def transcribe_text_only(self, audio_path: str, max_duration_sec: float | None = None) -> dict:
        """Segment-level transcript without forced alignment.

        For callers (summarize, diarize) that only need text and coarse
        timing and would rather skip the extra GPU alignment pass.
        """
        result, _audio, duration_sec = self._transcribe_raw(audio_path, max_duration_sec)

        segments = [
            {
                "start": seg.get("start"),
                "end": seg.get("end"),
                "text": seg.get("text", "").strip(),
            }
            for seg in result["segments"]
        ]
        text = " ".join(seg["text"] for seg in segments).strip()
        return {"text": text, "language": self.language, "duration_sec": duration_sec, "segments": segments}

    def _format_aligned(self, aligned: dict, duration_sec: float) -> dict:
        segments = []
        text_parts = []

        for seg in aligned.get("segments", []):
            text = seg.get("text", "").strip()
            words = [
                {
                    "word": w.get("word"),
                    "start": w.get("start"),
                    "end": w.get("end"),
                    "score": w.get("score"),
                }
                for w in seg.get("words", [])
            ]
            segments.append(
                {
                    "start": seg.get("start"),
                    "end": seg.get("end"),
                    "text": text,
                    "words": words,
                }
            )
            text_parts.append(text)

        return {
            "text": " ".join(text_parts).strip(),
            "language": self.language,
            "duration_sec": duration_sec,
            "segments": segments,
        }
