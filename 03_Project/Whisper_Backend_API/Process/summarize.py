import os

import httpx

from Process.errors import SummarizerUnavailableError

# Per-request user turn; output format and tone are set by GEMINI_SYSTEM_PROMPT.
SUMMARY_PROMPT_TEMPLATE = "สรุปบทสนทนาต่อไปนี้ตามรูปแบบที่กำหนด:\n\n{text}"


# Sent with every request as Gemini's systemInstruction.
GEMINI_SYSTEM_PROMPT = """คุณคือผู้ช่วยสรุปบทสนทนาและการประชุมภาษาไทย ข้อความที่ได้รับเป็นผลถอดเสียงอัตโนมัติ อาจมีคำผิดหรือคำที่ฟังเพี้ยน และอาจมีป้ายผู้พูด เช่น A, B หรือ SPEAKER_1

หลักการ:
- ใช้เฉพาะข้อมูลที่อยู่ในบทสนทนา ห้ามเดาหรือเพิ่มข้อมูลที่ไม่มี
- ถ้าคำใดฟังดูผิดชัดเจนจากบริบท ให้ใช้คำที่น่าจะถูกต้อง แต่ถ้าไม่แน่ใจให้คงไว้ตามเดิม
- ตัวเลข วันที่ เวลา ชื่อ และจำนวนเงิน ต้องคงตามที่พูดไว้อย่างแม่นยำ
- เขียนเป็นภาษาไทยที่กระชับ อ่านง่าย ไม่ต้องเกริ่นนำหรือลงท้ายด้วยคำอธิบายเพิ่มเติม

ตอบตามรูปแบบนี้เท่านั้น (ข้ามหัวข้อที่ไม่มีข้อมูลจริง):

**สรุปโดยย่อ**
(2-3 ประโยค บอกว่าเรื่องอะไร ใครเกี่ยวข้อง และผลลัพธ์สำคัญ)

**ประเด็นสำคัญ**
- (ข้อสำคัญของการสนทนา เรียงตามลำดับ)

**ข้อสรุปหรือมติ**
- (สิ่งที่ตกลงหรือตัดสินใจกัน)

**สิ่งที่ต้องดำเนินการ**
- (งาน — ผู้รับผิดชอบ — กำหนดเวลา เฉพาะที่ระบุไว้ในบทสนทนา)"""

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiSummarizer:
    """Summarizes via the Gemini API. The key comes from GEMINI_API_KEY (env
    only, never config.yaml, so it stays out of git)."""

    def __init__(self, api_key: str, model: str, timeout_sec: float = 60):
        self.api_key = api_key
        self.model = model
        self.timeout_sec = timeout_sec

    async def summarize(self, text: str) -> str:
        body = {
            "systemInstruction": {"parts": [{"text": GEMINI_SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": SUMMARY_PROMPT_TEMPLATE.format(text=text)}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 2048,
                # 2.5 models "think" by default and that counts against
                # maxOutputTokens; a summary doesn't need it.
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                resp = await client.post(
                    GEMINI_URL.format(model=self.model),
                    headers={"x-goog-api-key": self.api_key},
                    json=body,
                )
                resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            # Don't echo the request URL/headers; just the status and Google's message.
            detail = e.response.json().get("error", {}).get("message", e.response.text[:200])
            raise SummarizerUnavailableError(f"เรียก Gemini ไม่สำเร็จ ({e.response.status_code}): {detail}") from e
        except httpx.HTTPError as e:
            raise SummarizerUnavailableError(f"เรียก Gemini ไม่สำเร็จ: {type(e).__name__}") from e

        candidates = resp.json().get("candidates") or []
        parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
        text_out = "".join(p.get("text", "") for p in parts).strip()
        if not text_out:
            raise SummarizerUnavailableError("Gemini ไม่ส่งข้อความสรุปกลับมา (อาจถูกกรองเนื้อหา)")
        return text_out


def build_summarizer(config: dict) -> GeminiSummarizer:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return GeminiSummarizer(api_key=api_key, model=config.get("gemini_model", "gemini-2.5-flash"))
