import httpx

from Process.errors import SummarizerUnavailableError

SUMMARY_PROMPT_TEMPLATE = (
    "สรุปใจความสำคัญของบทสนทนาต่อไปนี้"
    "โดยเน้นประเด็นสำคัญและข้อสรุปเป็นข้อความสั้นๆ:\n\n{text}"
)


class OllamaSummarizer:
    """Thin client for a self-hosted Ollama server (separate container)."""

    def __init__(self, base_url: str, model: str, timeout_sec: float = 120):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_sec = timeout_sec

    async def summarize(self, text: str) -> str:
        prompt = SUMMARY_PROMPT_TEMPLATE.format(text=text)
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                resp = await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": self.model, "prompt": prompt, "stream": False},
                )
                resp.raise_for_status()
        except httpx.HTTPError as e:
            raise SummarizerUnavailableError(f"เรียก Ollama ไม่สำเร็จ: {e}") from e

        return resp.json().get("response", "").strip()
