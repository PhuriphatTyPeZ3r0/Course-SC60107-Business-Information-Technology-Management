# syntax=docker/dockerfile:1
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3

WORKDIR /app

COPY requirements.txt .
# --mount=type=cache persists pip's download cache across builds (this repo
# lives on OneDrive, so a warm cache matters); it's a build-time-only cache,
# not part of the final image, so drop --no-cache-dir to actually use it.
# Install the CUDA 12.1 torch build first so whisperx's own torch dependency
# is already satisfied and doesn't pull a CPU-only wheel instead.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Only the files prefetch_models.py actually needs are copied before it runs,
# so editing application code (Process/, main.py) below never invalidates
# this layer and re-triggers a multi-GB re-download. Do NOT cache-mount the
# model download itself: unlike pip's cache, that would keep the weights out
# of the committed image, defeating the point of baking them in.
COPY config.yaml .
COPY utils/ ./utils/
COPY scripts/ ./scripts/
RUN python3 -m scripts.prefetch_models

# Everything below changes often during development; keeping it last means
# those edits only ever invalidate this cheap COPY layer, not the expensive
# dependency-install or model-download layers above.
COPY main.py .
COPY Process/ ./Process/

EXPOSE 8050

CMD ["python3", "main.py"]
