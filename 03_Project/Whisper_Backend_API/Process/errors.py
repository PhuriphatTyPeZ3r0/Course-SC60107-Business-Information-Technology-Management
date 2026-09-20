class ApiError(Exception):
    """Base for errors that map directly to an HTTP status + JSON error code."""

    status_code = 500
    code = "INTERNAL_ERROR"


class ModelNotReadyError(ApiError):
    status_code = 503
    code = "MODEL_NOT_READY"


class UnsupportedFormatError(ApiError):
    status_code = 415
    code = "UNSUPPORTED_FORMAT"


class FileTooLargeError(ApiError):
    status_code = 413
    code = "FILE_TOO_LARGE"


class QueueFullError(ApiError):
    status_code = 429
    code = "QUEUE_FULL"


class ProcessingTimeoutError(ApiError):
    status_code = 504
    code = "PROCESSING_TIMEOUT"


class SummarizerUnavailableError(ApiError):
    status_code = 502
    code = "SUMMARIZER_UNAVAILABLE"


class AudioTooLongError(ApiError):
    status_code = 413
    code = "AUDIO_TOO_LONG"

    def __init__(self, duration_sec: float, max_duration_sec: float):
        self.duration_sec = duration_sec
        self.max_duration_sec = max_duration_sec
        super().__init__(
            f"Audio duration {duration_sec:.1f}s exceeds the maximum of {max_duration_sec:.1f}s"
        )


class UnsupportedChannelLayoutError(ApiError):
    status_code = 422
    code = "UNSUPPORTED_CHANNEL_LAYOUT"

    def __init__(self, channel_count: int):
        self.channel_count = channel_count
        super().__init__(
            f"Expected mono (1-channel) or stereo (2-channel) audio for speaker separation, got {channel_count} channel(s)"
        )


class VramExhaustedError(ApiError):
    status_code = 503
    code = "VRAM_EXHAUSTED"

    def __init__(self, free_mb: float, required_mb: float):
        self.free_mb = free_mb
        self.required_mb = required_mb
        super().__init__(
            f"GPU free VRAM too low ({free_mb:.0f}MB free, need at least {required_mb:.0f}MB)"
        )


class MonoDiarizationUnavailableError(ApiError):
    status_code = 503
    code = "MONO_DIARIZATION_UNAVAILABLE"
