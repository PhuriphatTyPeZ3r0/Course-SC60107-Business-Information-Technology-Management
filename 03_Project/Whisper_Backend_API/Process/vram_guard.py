import logging

logger = logging.getLogger("whisper_api")

try:
    import pynvml
    _PYNVML_AVAILABLE = True
except ImportError:
    _PYNVML_AVAILABLE = False

_initialized = False
_init_failed = False


def free_vram_mb() -> float | None:
    """Free VRAM across the whole card (all processes, GPU index 0) — not
    just what this process has allocated, since other containers or the
    host desktop compete for the same physical GPU.

    Returns None if NVML isn't usable here (library missing, no driver,
    multi-GPU host where index 0 isn't the right card, etc.) so callers can
    treat "unknown" as "don't block the request" rather than crash.
    """
    global _initialized, _init_failed
    if not _PYNVML_AVAILABLE or _init_failed:
        return None
    try:
        if not _initialized:
            pynvml.nvmlInit()
            _initialized = True
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        return info.free / (1024 * 1024)
    except Exception:
        logger.warning("NVML VRAM check unavailable, skipping VRAM guard", exc_info=True)
        _init_failed = True
        return None
