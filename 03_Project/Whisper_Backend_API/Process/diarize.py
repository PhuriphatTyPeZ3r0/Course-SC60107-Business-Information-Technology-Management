def _diarized_segment(seg: dict, speaker: str) -> dict:
    """One output row: time range, speaker, then text (this key order is the API's output format)."""
    return {"start": seg["start"], "end": seg["end"], "speaker": speaker, "text": seg["text"]}


def merge_channel_transcripts(channel_a: dict, channel_b: dict, label_a: str = "A", label_b: str = "B") -> dict:
    """Merge two independently-transcribed channels into one timeline.

    Each input is a transcribe_text_only() result for one stereo channel;
    segments are tagged with a speaker label (A, B) and sorted by start time.
    """
    segments = []
    for seg in channel_a["segments"]:
        segments.append(_diarized_segment(seg, label_a))
    for seg in channel_b["segments"]:
        segments.append(_diarized_segment(seg, label_b))
    segments.sort(key=lambda s: s["start"])

    return {
        "language": channel_a["language"],
        "duration_sec": max(channel_a["duration_sec"], channel_b["duration_sec"]),
        "segments": segments,
    }


def _speaker_letter(index: int) -> str:
    """0 -> A, 1 -> B, ... 25 -> Z, then SPEAKER_27, ... (never reached for real calls)."""
    return chr(ord("A") + index) if index < 26 else f"SPEAKER_{index + 1}"


def _turn_for_time(t: float, turns: list[dict]) -> dict | None:
    """The turn containing time `t`, else the nearest one (chars can fall in short gaps between turns)."""
    if not turns:
        return None
    for turn in turns:
        if turn["start"] <= t <= turn["end"]:
            return turn
    return min(turns, key=lambda turn: min(abs(t - turn["start"]), abs(t - turn["end"])))


def _timed_chars(seg: dict) -> list[tuple[str, float, float]]:
    """(char, start, end) per character; chars alignment could not time (spaces, digits) inherit the previous time."""
    out = []
    last = seg["start"]
    for c in seg["chars"]:
        start, end = c.get("start"), c.get("end")
        if start is None or end is None:
            start = end = last
        else:
            last = end
        out.append((c["char"], start, end))
    return out


def build_mono_diarized_transcript(transcript: dict, turns: list[dict]) -> dict:
    """Split a mono char-aligned transcript (transcribe_with_chars()) by speaker turns.

    One Whisper segment can span several speakers (a whole call often comes
    back as a single segment), so each character is assigned to the turn its
    timing falls in, and consecutive same-speaker characters become one row.
    Speakers are labeled A, B, C, ... in order of first appearance. A segment
    alignment could not time falls back to the single turn it overlaps most.
    """
    label_map: dict[str, str] = {}

    def relabel(native: str) -> str:
        if native not in label_map:
            label_map[native] = _speaker_letter(len(label_map))
        return label_map[native]

    rows: list[dict] = []

    def add_row(speaker: str, start: float, end: float, text: str):
        text = text.strip()
        if not text:
            return
        if rows and rows[-1]["speaker"] == speaker:
            rows[-1]["end"] = round(end, 2)
            rows[-1]["text"] = f"{rows[-1]['text']} {text}"
        else:
            rows.append({"start": round(start, 2), "end": round(end, 2), "speaker": speaker, "text": text})

    for seg in transcript["segments"]:
        if seg.get("chars"):
            group_speaker = None
            group_text = ""
            group_start = group_end = 0.0
            for char, start, end in _timed_chars(seg):
                turn = _turn_for_time((start + end) / 2, turns)
                speaker = relabel(turn["speaker"]) if turn else "UNKNOWN"
                if speaker != group_speaker:
                    if group_speaker is not None:
                        add_row(group_speaker, group_start, group_end, group_text)
                    group_speaker, group_text, group_start = speaker, "", start
                group_text += char
                group_end = end
            if group_speaker is not None:
                add_row(group_speaker, group_start, group_end, group_text)
        else:
            best_turn, best_overlap = None, 0.0
            for turn in turns:
                overlap = min(seg["end"], turn["end"]) - max(seg["start"], turn["start"])
                if overlap > best_overlap:
                    best_turn, best_overlap = turn, overlap
            speaker = relabel(best_turn["speaker"]) if best_turn else "UNKNOWN"
            add_row(speaker, seg["start"], seg["end"], seg["text"])

    return {
        "language": transcript["language"],
        "duration_sec": transcript["duration_sec"],
        "segments": rows,
    }
