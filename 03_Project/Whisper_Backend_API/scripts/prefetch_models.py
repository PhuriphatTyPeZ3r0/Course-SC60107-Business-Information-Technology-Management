"""Run at image build time to bake model weights into the Docker layer.

Forces device="cpu" regardless of config.yaml's runtime device, because
`docker build` has no GPU access even when the resulting image is meant to
run on a GPU host. This only downloads and caches weights; the real
GPU-backed load happens at container startup in Service.py's lifespan.
"""
import whisperx

from utils.load_utils import load_config, load_model


def main():
    config = load_config("config.yaml")

    print(f"Prefetching whisper model '{config['model_name']}' (CPU, cache-only)...")
    load_model(config["model_name"], "cpu", config.get("compute_type", "int8"))

    print(f"Prefetching alignment model for language '{config['language']}' (CPU, cache-only)...")
    whisperx.load_align_model(
        language_code=config["language"], device="cpu", model_name=config.get("align_model")
    )

    print("Prefetch complete.")


if __name__ == "__main__":
    main()
