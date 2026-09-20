# Summarize Model (Ollama)

Standalone deployment of the Ollama server used by `Whisper_Backend_API`'s
`/summarize` endpoint. CPU-only, with `qwen2.5:3b` baked into the image at
build time.

```text
Summarize_Model/
├── Dockerfile            # ollama image with the model pulled at build time
├── docker-compose.yaml   # ollama service, port 11434, summarize-net network
└── README.md
```

```bash
docker compose up -d --build
```

This creates the `summarize-net` Docker network and exposes Ollama on
`localhost:11434`. Start it **before** `Whisper_Backend_API`, which joins
`summarize-net` and reaches it as `http://ollama:11434`.

To change the model, edit `OLLAMA_MODEL` in `docker-compose.yaml` and the
matching `ollama_model` in `Whisper_Backend_API/config.yaml`.
