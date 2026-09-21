import yaml
import whisperx

def load_config(config_path):
    with open(config_path, encoding='utf-8') as file:
        config = yaml.safe_load(file)
    return config

def seed_everything(seed: int) -> None:
    """Pins every RNG the pipeline could touch so repeated runs on the same audio agree."""
    import random

    import numpy as np
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def load_model(model_name, device, compute_type, asr_options=None):
    # compute_type ("float16"/"int8", CTranslate2-style) is config-driven
    # rather than auto-detected from CUDA availability: on a VRAM-constrained
    # GPU, int8 may be required even with CUDA present to fit the budget.

    # Same weights as openai/whisper-large-v3, loaded through the CTranslate2
    # (faster-whisper) backend that WhisperX wraps - this is what gets us
    # word-level timestamps instead of the segment-level ones from transformers.
    # asr_options overrides whisperx's decoding defaults (see config.yaml's
    # asr_options); None keeps the defaults.
    model = whisperx.load_model(model_name, device, compute_type=compute_type, asr_options=asr_options)
    return model
