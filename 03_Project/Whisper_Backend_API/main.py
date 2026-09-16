import os

import uvicorn

from utils.load_utils import load_config

if __name__ == "__main__":
    config_path = os.environ.get("CONFIG_PATH", "config.yaml")
    config = load_config(config_path)

    # workers must stay at 1: the model is loaded once per process and the
    # request queue/lock in Service.py is per-process state, not shared
    # across workers.
    uvicorn.run(
        "Process.Service:app",
        host=config.get("host", "0.0.0.0"),
        port=config.get("port", 8050),
        workers=1,
    )
