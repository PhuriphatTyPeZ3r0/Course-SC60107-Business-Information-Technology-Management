import logging

import whisperx

from Process.errors import AudioTooLongError
from utils.load_utils import seed_everything

logger = logging.getLogger(__name__)

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
        align_models: dict[str, str],
        device: str,
        align_device: str,
        batch_size: int = 16,
        chunk_size_sec: int = 30,
        seed: int | None = None,
    ):
        self.model = model
        # Language code -> wav2vec2 model name, for languages whisperx has no
        # built-in aligner for (e.g. Thai). Any other language uses whisperx's default.
        self.align_model_names = align_models
        # Language code -> (align_model, align_metadata), or None when no
        # aligner exists for that language. Filled lazily by _get_aligner().
        self._aligners: dict[str, tuple | None] = {}
        self.device = device
        # Alignment runs on a separate device (CPU) from the whisper model
        # (GPU) on purpose — see config.yaml's align_device comment for why.
        self.align_device = align_device
        self.batch_size = batch_size
        # Longest audio slice Whisper decodes in one go; see config.yaml's chunk_size_sec.
        self.chunk_size_sec = chunk_size_sec
        # Re-applied before every request (see _transcribe_raw) so RNG state left
        # over from earlier requests can't change this one's output. None = don't seed.
        self.seed = seed

    def _transcribe_raw(self, audio_path: str, max_duration_sec: float | None):
        audio = whisperx.load_audio(audio_path)
        duration_sec = len(audio) / SAMPLE_RATE
        if max_duration_sec is not None and duration_sec > max_duration_sec:
            raise AudioTooLongError(duration_sec, max_duration_sec)

        if self.seed is not None:
            seed_everything(self.seed)

        # No `language=` kwarg on purpose: the language is detected per
        # request, so any language Whisper knows can be sent in.
        result = self.model.transcribe(audio, batch_size=self.batch_size, chunk_size=self.chunk_size_sec)
        return result, audio, duration_sec, result.get("language")

    def load_aligner(self, language: str):
        """Loads (once) the forced-alignment model for `language`; None if none can be loaded."""
        if language not in self._aligners:
            try:
                logger.info("Loading alignment model for language '%s' on %s ...", language, self.align_device)
                self._aligners[language] = whisperx.load_align_model(
                    language_code=language,
                    device=self.align_device,
                    model_name=self.align_model_names.get(language),
                )
            except Exception as e:
                logger.warning("No alignment model for language '%s' (%s); continuing without alignment.", language, e)
                self._aligners[language] = None
        return self._aligners[language]

    def _align(self, result: dict, audio, language: str, return_char_alignments: bool) -> dict:
        """Forced-aligns `result`; without an aligner for the language the segments come back untimed per word."""
        aligner = self.load_aligner(language)
        if aligner is None:
            return {"segments": result["segments"]}
        align_model, align_metadata = aligner
        return whisperx.align(
            result["segments"],
            align_model,
            align_metadata,
            audio,
            self.align_device,
            return_char_alignments=return_char_alignments,
        )

    def transcribe(self, audio_path: str, max_duration_sec: float | None = None) -> dict:
        """Full pipeline: transcribe + word-level forced alignment."""
        result, audio, duration_sec, language = self._transcribe_raw(audio_path, max_duration_sec)
        aligned = self._align(result, audio, language, return_char_alignments=False)
        return self._format_aligned(aligned, duration_sec, language)

    def transcribe_text_only(self, audio_path: str, max_duration_sec: float | None = None) -> dict:
        """Segment-level transcript without forced alignment.

        For callers (summarize, diarize) that only need text and coarse
        timing and would rather skip the extra GPU alignment pass.
        """
        result, _audio, duration_sec, language = self._transcribe_raw(audio_path, max_duration_sec)

        segments = [
            {
                "start": seg.get("start"),
                "end": seg.get("end"),
                "text": seg.get("text", "").strip(),
            }
            for seg in result["segments"]
        ]
        text = " ".join(seg["text"] for seg in segments).strip()
        return {"text": text, "language": language, "duration_sec": duration_sec, "segments": segments}

    def transcribe_with_chars(self, audio_path: str, max_duration_sec: float | None = None) -> dict:
        """Transcript with per-character timing, for splitting one segment across speakers.

        Runs the same forced alignment as transcribe() but keeps the character
        level, which is what lets /diarize cut a single long Whisper segment
        at speaker changes.
        """
        result, audio, duration_sec, language = self._transcribe_raw(audio_path, max_duration_sec)
        aligned = self._align(result, audio, language, return_char_alignments=True)
        segments = [
            {
                "start": seg.get("start"),
                "end": seg.get("end"),
                "text": seg.get("text", "").strip(),
                "chars": seg.get("chars") or [],
            }
            for seg in aligned.get("segments", [])
        ]
        return {"language": language, "duration_sec": duration_sec, "segments": segments}

    def _format_aligned(self, aligned: dict, duration_sec: float, language: str) -> dict:
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
            "language": language,
            "duration_sec": duration_sec,
            "segments": segments,
        }
