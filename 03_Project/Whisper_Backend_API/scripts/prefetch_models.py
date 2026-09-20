"""Run at image build time to bake model weights into the Docker layer.

Forces device="cpu" regardless of config.yaml's runtime device, because
`docker build` has no GPU access even when the resulting image is meant to
run on a GPU host. This only downloads and caches weights; the real
GPU-backed load happens at container startup in Service.py's lifespan.
"""
import whisperx

from utils.load_utils import load_config, load_model
from utils.speaker_model import load_speaker_classifier


def main():
    config = load_config("config.yaml")

    print(f"Prefetching whisper model '{config['model_name']}' (CPU, cache-only)...")
    load_model(config["model_name"], "cpu", config.get("compute_type", "int8"))

    align_models = config.get("align_models", {})
    for language in config.get("warm_align_languages", []):
        print(f"Prefetching alignment model for language '{language}' (CPU, cache-only)...")
        whisperx.load_align_model(language_code=language, device="cpu", model_name=align_models.get(language))

    print("Prefetching speaker-separation model (CPU, cache-only)...")
    load_speaker_classifier("cpu")

    print("Prefetch complete.")


if __name__ == "__main__":
    main()
