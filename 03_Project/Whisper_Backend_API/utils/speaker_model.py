import os

SPEAKER_MODEL = "speechbrain/spkrec-ecapa-voxceleb"
# Shared by scripts/prefetch_models.py (image build) and the running service so
# the baked-in weights land in exactly the directory the service reads from.
SPEAKER_MODEL_DIR = os.path.expanduser("~/.cache/speechbrain/spkrec-ecapa-voxceleb")


def load_speaker_classifier(device: str = "cpu"):
    """Loads (downloading on first use) the public SpeechBrain ECAPA model - no token needed."""
    from speechbrain.inference.speaker import EncoderClassifier
    from speechbrain.utils.fetching import LocalStrategy

    return EncoderClassifier.from_hparams(
        source=SPEAKER_MODEL,
        savedir=SPEAKER_MODEL_DIR,
        run_opts={"device": device},
        # COPY, not the default symlink: symlinks need extra privileges on Windows.
        local_strategy=LocalStrategy.COPY,
    )
