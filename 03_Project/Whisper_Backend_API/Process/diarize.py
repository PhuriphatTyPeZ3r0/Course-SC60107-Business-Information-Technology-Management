def merge_channel_transcripts(channel_a: dict, channel_b: dict, label_a: str = "A", label_b: str = "B") -> dict:
    """Merge two independently-transcribed channels into one timeline.

    Each input is a transcribe_text_only() result for one stereo channel;
    segments are tagged with a speaker label and sorted by start time.
    """
    segments = []
    for seg in channel_a["segments"]:
        segments.append({**seg, "speaker": label_a})
    for seg in channel_b["segments"]:
        segments.append({**seg, "speaker": label_b})
    segments.sort(key=lambda s: s["start"])

    return {
        "language": channel_a["language"],
        "duration_sec": max(channel_a["duration_sec"], channel_b["duration_sec"]),
        "segments": segments,
    }


def _assign_speakers_by_overlap(segments: list[dict], turns: list[dict]) -> list[dict]:
    """Tag each transcript segment with the pyannote turn it overlaps most.

    Native pyannote labels (e.g. "SPEAKER_00") are relabeled to SPEAKER_1,
    SPEAKER_2, ... in order of first appearance, for a stable, readable
    numbering per response. Segments with no overlapping turn (silence gaps,
    VAD/diarization disagreement) get "UNKNOWN" rather than being dropped.
    """
    label_map: dict[str, str] = {}

    def relabel(native: str) -> str:
        if native not in label_map:
            label_map[native] = f"SPEAKER_{len(label_map) + 1}"
        return label_map[native]

    tagged = []
    for seg in segments:
        best_turn = None
        best_overlap = 0.0
        for turn in turns:
            overlap = min(seg["end"], turn["end"]) - max(seg["start"], turn["start"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_turn = turn
        speaker = relabel(best_turn["speaker"]) if best_turn else "UNKNOWN"
        tagged.append({**seg, "speaker": speaker})
    return tagged


def build_mono_diarized_transcript(transcript: dict, turns: list[dict]) -> dict:
    """Combine a mono transcribe_text_only() result with pyannote turns."""
    return {
        "language": transcript["language"],
        "duration_sec": transcript["duration_sec"],
        "segments": _assign_speakers_by_overlap(transcript["segments"], turns),
    }
