import json
import subprocess

from Process.errors import ApiError


def probe_channel_count(audio_path: str) -> int:
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error", "-select_streams", "a:0",
                "-show_entries", "stream=channels", "-of", "json", audio_path,
            ],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as e:
        raise ApiError(f"อ่านข้อมูลไฟล์เสียงไม่สำเร็จ: {e.stderr[:500]}") from e

    streams = json.loads(proc.stdout).get("streams", [])
    if not streams:
        raise ApiError("ไม่พบ audio stream ในไฟล์ที่อัปโหลด")
    return streams[0]["channels"]


def split_stereo_channels(audio_path: str, left_path: str, right_path: str) -> None:
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", audio_path,
                "-filter_complex", "[0:a]channelsplit=channel_layout=stereo[left][right]",
                "-map", "[left]", left_path,
                "-map", "[right]", right_path,
            ],
            capture_output=True, check=True,
        )
    except subprocess.CalledProcessError as e:
        raise ApiError(f"แยกช่องเสียงไม่สำเร็จ: {e.stderr.decode(errors='ignore')[:500]}") from e
