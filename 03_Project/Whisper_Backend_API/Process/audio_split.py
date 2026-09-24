import os
import subprocess
import tempfile

import numpy as np

from Process.errors import ApiError

SAMPLE_RATE = 16000
FRAME, HOP = 1024, 256
SILENCE_TOP_DB = 30  # same threshold as diarization_pipeline.py, kept independent on purpose (see module docstring)


def probe_duration_and_size(audio_path: str) -> tuple[float, int]:
    """(duration_sec, size_bytes) of the file on disk, via ffprobe + stat."""
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", audio_path,
            ],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as e:
        raise ApiError(f"อ่านความยาวไฟล์เสียงไม่สำเร็จ: {e.stderr[:500]}") from e
    return float(proc.stdout.strip()), os.path.getsize(audio_path)


def compute_target_chunk_sec(
    duration_sec: float, size_bytes: int, max_duration_sec: float | None, max_file_size_mb: float | None
) -> float:
    """Longest chunk length that keeps each piece under *both* the duration
    cap and (via the original file's average bitrate) the size cap."""
    candidates: list[float] = []
    if max_duration_sec:
        candidates.append(max_duration_sec)
    if max_file_size_mb and duration_sec > 0:
        bitrate_bytes_per_sec = size_bytes / duration_sec
        if bitrate_bytes_per_sec > 0:
            candidates.append((max_file_size_mb * 1024 * 1024) / bitrate_bytes_per_sec)
    if not candidates:
        return duration_sec
    return max(1.0, min(candidates))


def _decode_channels(audio_path: str, channels: int) -> np.ndarray:
    """Decodes to `channels`-channel float32 PCM at SAMPLE_RATE; shape (channels, n_samples)."""
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-v", "error", "-i", audio_path, "-f", "f32le",
                "-ac", str(channels), "-ar", str(SAMPLE_RATE), "-",
            ],
            capture_output=True, check=True,
        )
    except subprocess.CalledProcessError as e:
        raise ApiError(f"ถอดรหัสไฟล์เสียงไม่สำเร็จ: {e.stderr.decode(errors='ignore')[:500]}") from e
    data = np.frombuffer(result.stdout, dtype=np.float32)
    if channels == 1:
        return data.reshape(1, -1).copy()
    return data.reshape(-1, channels).T.copy()


def _voiced_mask(y: np.ndarray) -> np.ndarray:
    """Per-frame bool array: True where this channel is speaking (energy-based, see diarization_pipeline.py)."""
    if len(y) < FRAME:
        return np.zeros(0, dtype=bool)
    starts = np.arange(0, len(y) - FRAME + 1, HOP)
    rms = np.sqrt(np.array([np.mean(y[i:i + FRAME] ** 2) for i in starts]))
    peak = rms.max()
    if peak <= 0:
        return np.zeros(len(starts), dtype=bool)
    return rms > peak * 10 ** (-SILENCE_TOP_DB / 20)


def _silence_gaps(voiced: np.ndarray, total_duration_sec: float) -> list[tuple[float, float]]:
    """(start_sec, end_sec) for every run where nobody is speaking, in order."""
    if len(voiced) == 0:
        return [(0.0, total_duration_sec)]
    frame_times = np.arange(len(voiced)) * HOP / SAMPLE_RATE
    gaps: list[tuple[float, float]] = []
    gap_start = None
    for t, v in zip(frame_times, voiced):
        if not v and gap_start is None:
            gap_start = t
        elif v and gap_start is not None:
            gaps.append((gap_start, t))
            gap_start = None
    if gap_start is not None:
        gaps.append((gap_start, total_duration_sec))
    return gaps


def compute_cut_points(audio_path: str, target_sec: float, stereo: bool) -> list[float]:
    """Cut timestamps spaced ~target_sec apart, each snapped to the nearest
    moment nobody is speaking (both channels silent at once, for stereo) so no
    chunk boundary lands mid-word or mid-turn.

    Search for a cut isn't bounded to a window near the target: it always
    picks the single nearest remaining silence, however far away, which is
    the same "keep looking until you find one" behavior as an unbounded
    expanding window without needing a separate step-size setting. If a
    stretch of audio never goes silent again, no more cuts are produced and
    that whole remainder becomes one (possibly oversized) trailing chunk.
    """
    y = _decode_channels(audio_path, 2 if stereo else 1)
    total_duration_sec = y.shape[1] / SAMPLE_RATE

    voiced = np.zeros(0, dtype=bool)
    for channel in y:
        v = _voiced_mask(channel)
        voiced = v if len(voiced) == 0 else (voiced | v)

    gaps = _silence_gaps(voiced, total_duration_sec)
    if not gaps:
        return []

    cuts: list[float] = []
    last_cut = 0.0
    next_target = target_sec
    idx = 0
    while next_target < total_duration_sec:
        while idx < len(gaps) and gaps[idx][1] <= last_cut:
            idx += 1
        if idx >= len(gaps):
            break

        best_i, best_dist = idx, None
        for i in range(idx, len(gaps)):
            mid = (gaps[i][0] + gaps[i][1]) / 2
            dist = abs(mid - next_target)
            if best_dist is None or dist < best_dist:
                best_i, best_dist = i, dist
            elif gaps[i][0] > next_target:
                break  # gaps are sorted and non-overlapping - only gets farther from here

        cut = (gaps[best_i][0] + gaps[best_i][1]) / 2
        if cut <= last_cut:
            break
        cuts.append(cut)
        last_cut = cut
        idx = best_i + 1
        next_target = cut + target_sec
    return cuts


def cut_audio_segments(audio_path: str, cut_points: list[float]) -> list[str]:
    """Cuts `audio_path` at each timestamp into len(cut_points)+1 temp WAV
    files (output-side -ss/-to for accurate, non-keyframe-dependent seeking),
    preserving the original channel count. Caller owns cleanup."""
    bounds: list[float | None] = [0.0, *cut_points, None]
    paths: list[str] = []
    for start, end in zip(bounds[:-1], bounds[1:]):
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", audio_path, "-ss", f"{start:.3f}"]
        if end is not None:
            cmd += ["-to", f"{end:.3f}"]
        cmd += [path]
        try:
            subprocess.run(cmd, capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            for p in (*paths, path):
                if os.path.exists(p):
                    os.remove(p)
            raise ApiError(f"แบ่งไฟล์เสียงไม่สำเร็จ: {e.stderr.decode(errors='ignore')[:500]}") from e
        paths.append(path)
    return paths


def _shift_segment(seg: dict, offset: float) -> dict:
    shifted = dict(seg)
    if seg.get("start") is not None:
        shifted["start"] = seg["start"] + offset
    if seg.get("end") is not None:
        shifted["end"] = seg["end"] + offset
    for key in ("chars", "words"):
        if seg.get(key):
            shifted[key] = [
                {
                    **item,
                    **({"start": item["start"] + offset} if item.get("start") is not None else {}),
                    **({"end": item["end"] + offset} if item.get("end") is not None else {}),
                }
                for item in seg[key]
            ]
    return shifted


def merge_transcript_chunks(chunk_transcripts: list[dict], cut_points: list[float]) -> dict:
    """Combines transcribe_text_only()/transcribe_with_chars() results from
    consecutive audio chunks (chunk i covers cut_points[i-1]..cut_points[i] in
    the original file) into one continuous transcript, shifting each chunk's
    segment timings by where that chunk started. Same shape as a single-call
    result, so downstream code (merge_channel_transcripts,
    build_mono_diarized_transcript) doesn't need to know splitting happened.
    """
    offsets = [0.0, *cut_points]
    segments: list[dict] = []
    for offset, chunk in zip(offsets, chunk_transcripts):
        segments.extend(_shift_segment(seg, offset) for seg in chunk["segments"])
    duration_sec = offsets[-1] + chunk_transcripts[-1]["duration_sec"]
    return {
        "language": chunk_transcripts[0]["language"],
        "duration_sec": duration_sec,
        "segments": segments,
    }
