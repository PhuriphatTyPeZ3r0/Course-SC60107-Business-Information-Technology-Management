import yaml
import whisperx

def load_config(config_path):
    with open(config_path, encoding='utf-8') as file:
        config = yaml.safe_load(file)
    return config

def load_model(model_name, device, compute_type):
    # compute_type ("float16"/"int8", CTranslate2-style) is config-driven
    # rather than auto-detected from CUDA availability: on a VRAM-constrained
    # GPU, int8 may be required even with CUDA present to fit the budget.

    # Same weights as openai/whisper-large-v3, loaded through the CTranslate2
    # (faster-whisper) backend that WhisperX wraps - this is what gets us
    # word-level timestamps instead of the segment-level ones from transformers.
    model = whisperx.load_model(model_name, device, compute_type=compute_type)
    return model
