import subprocess

import numpy as np

from Process.errors import MonoDiarizationUnavailableError
from utils.speaker_model import load_speaker_classifier

SAMPLE_RATE = 16000
WINDOW_SEC, HOP_SEC = 1.5, 0.75  # embedding window / hop
MIN_WINDOW_SEC = 0.6             # shortest speech piece worth embedding
MERGE_GAP_SEC = 0.3              # silences shorter than this stay inside one speech region
SILENCE_TOP_DB = 30              # frames this far below the loudest frame count as silence
DISTANCE_THRESHOLD = 0.5         # cosine distance; used only when num_speakers is None


def _load_audio(audio_path: str) -> np.ndarray:
    """Decodes any ffmpeg-readable file to 16 kHz mono float32."""
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", audio_path, "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"],
        capture_output=True,
        check=True,
    )
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def _speech_regions(y: np.ndarray) -> list[tuple[float, float]]:
    """Energy-based speech/silence split; returns (start_sec, end_sec) regions."""
    frame, hop = 1024, 256
    if len(y) < frame:
        return []
    starts = np.arange(0, len(y) - frame + 1, hop)
    rms = np.sqrt(np.array([np.mean(y[i:i + frame] ** 2) for i in starts]))
    peak = rms.max()
    if peak <= 0:
        return []
    voiced = rms > peak * 10 ** (-SILENCE_TOP_DB / 20)

    regions: list[tuple[float, float]] = []
    run_start = None
    for idx, v in enumerate(voiced):
        if v and run_start is None:
            run_start = idx
        elif not v and run_start is not None:
            regions.append((run_start * hop / SAMPLE_RATE, (idx * hop + frame) / SAMPLE_RATE))
            run_start = None
    if run_start is not None:
        regions.append((run_start * hop / SAMPLE_RATE, len(y) / SAMPLE_RATE))

    merged: list[tuple[float, float]] = []
    for s, e in regions:
        if merged and s - merged[-1][1] < MERGE_GAP_SEC:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    return merged


class LazyDiarizationPipeline:
    """Token-free speaker separation for mono audio (SpeechBrain ECAPA + clustering).

    Loaded lazily on the first mono /diarize request so a problem with this
    model can't take down transcribe/summarize/stereo-diarize at startup.
    Speaker count is fixed by `num_speakers` (a two-party call = 2); with None
    it is decided by a distance threshold, which tends to over-split.
    """

    def __init__(self, device: str = "cpu", num_speakers: int | None = 2):
        self._device = device
        self._num_speakers = num_speakers
        self._classifier = None
        self._load_failed = False

    def _ensure_loaded(self):
        if self._classifier is not None:
            return
        if self._load_failed:
            raise MonoDiarizationUnavailableError(
                "ตัวแยกผู้พูดสำหรับไฟล์ mono โหลดไม่สำเร็จก่อนหน้านี้ ตรวจสอบ log แล้วรีสตาร์ท service"
            )
        try:
            self._classifier = load_speaker_classifier(self._device)
        except Exception as e:
            self._load_failed = True
            raise MonoDiarizationUnavailableError(f"โหลดตัวแยกผู้พูดไม่สำเร็จ: {e}") from e

    def diarize(self, audio_path: str) -> list[dict]:
        """Returns non-overlapping [{"start": float, "end": float, "speaker": str}, ...] turns.

        `speaker` is an opaque cluster id ("0", "1", ...); callers that want
        readable names should relabel themselves.
        """
        import torch
        from sklearn.cluster import AgglomerativeClustering

        self._ensure_loaded()
        y = _load_audio(audio_path)

        windows: list[tuple[float, float]] = []
        for s, e in _speech_regions(y):
            t = s
            while t < e:
                w_end = min(t + WINDOW_SEC, e)
                if w_end - t >= MIN_WINDOW_SEC:
                    windows.append((t, w_end))
                t += HOP_SEC
        if not windows:
            return []
        if len(windows) < 2 or (self._num_speakers and len(windows) < self._num_speakers):
            return [{"start": windows[0][0], "end": windows[-1][1], "speaker": "0"}]

        embeddings = []
        with torch.no_grad():
            for s, e in windows:
                chunk = torch.from_numpy(y[int(s * SAMPLE_RATE):int(e * SAMPLE_RATE)]).unsqueeze(0)
                embeddings.append(self._classifier.encode_batch(chunk).squeeze().cpu().numpy())

        labels = AgglomerativeClustering(
            n_clusters=self._num_speakers,
            distance_threshold=None if self._num_speakers else DISTANCE_THRESHOLD,
            metric="cosine",
            linkage="average",
        ).fit_predict(np.stack(embeddings))

        # Merge consecutive same-speaker windows into turns.
        turns: list[dict] = []
        for (s, e), label in zip(windows, labels):
            speaker = str(label)
            if turns and turns[-1]["speaker"] == speaker and s - turns[-1]["end"] < 0.5:
                turns[-1]["end"] = max(turns[-1]["end"], e)
            else:
                turns.append({"start": s, "end": e, "speaker": speaker})

        # Windows straddling a speaker change make neighbouring turns overlap;
        # cut at the midpoint so no audio is attributed to two speakers.
        for prev, cur in zip(turns, turns[1:]):
            if cur["start"] < prev["end"]:
                prev["end"] = cur["start"] = (cur["start"] + prev["end"]) / 2
        return turns
