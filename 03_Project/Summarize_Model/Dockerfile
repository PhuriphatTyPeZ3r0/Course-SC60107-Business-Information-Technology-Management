FROM ollama/ollama:latest

ARG OLLAMA_MODEL=qwen2.5
ENV OLLAMA_MODEL=${OLLAMA_MODEL}

# Bake the model into the image at build time (same reasoning as the whisper
# image): start the server in the background just long enough to `pull` the
# model into this layer, so the running container needs no network access
# and starts serving immediately.
RUN ollama serve & \
    server_pid=$!; \
    for i in $(seq 1 30); do \
        if ollama list >/dev/null 2>&1; then break; fi; \
        sleep 1; \
    done; \
    ollama pull "${OLLAMA_MODEL}"; \
    kill "$server_pid"
