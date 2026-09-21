export type Locale = "th" | "en";

export const dictionaries = {
  th: {
    brand: "Whisper",
    nav: { login: "เข้าสู่ระบบ", dashboard: "แดชบอร์ด", logout: "ออกจากระบบ" },
    landing: {
      eyebrow: "AI สรุปการประชุมภาษาไทย",
      title: "ฟังประชุม สรุปงาน จบในที่เดียว",
      subtitle:
        "อัปโหลดไฟล์เสียงประชุม แล้วให้ Whisper ถอดเสียง แยกผู้พูด สรุปเนื้อหา และไล่รายการงานที่ต้องทำให้อัตโนมัติ",
      cta: "เริ่มใช้งานฟรี",
      ctaSecondary: "เข้าสู่ระบบ",
      featuresTitle: "ครบทุกขั้นตอนหลังประชุมจบ",
      feature1Title: "ถอดเสียงแม่นยำ",
      feature1Body: "รองรับเสียงภาษาไทยพร้อมระบุเวลาแบบละเอียดถึงระดับคำ",
      feature2Title: "แยกผู้พูดอัตโนมัติ",
      feature2Body: "รู้ทันทีว่าใครพูดอะไรในช่วงเวลาไหนของการประชุม",
      feature3Title: "สรุปและงานต่อ",
      feature3Body: "สรุปประเด็นสำคัญและดึงรายการงานที่ต้องติดตามให้อัตโนมัติ",
    },
    auth: {
      loginTitle: "เข้าสู่ระบบ",
      signupTitle: "สร้างบัญชีใหม่",
      email: "อีเมล",
      password: "รหัสผ่าน",
      displayName: "ชื่อที่แสดง",
      loginSubmit: "เข้าสู่ระบบ",
      signupSubmit: "สร้างบัญชี",
      switchToSignup: "ยังไม่มีบัญชี? สมัครสมาชิก",
      switchToLogin: "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ",
      mockNotice: "โหมดทดลอง: กรอกอะไรก็เข้าสู่ระบบได้ทันที",
    },
    dashboard: {
      title: "การประชุมของทีม",
      subtitle: "รายการประชุมและสถานะการประมวลผลล่าสุด",
      newMeeting: "+ ประชุมใหม่",
      empty: "ยังไม่มีการประชุม เริ่มอัปโหลดไฟล์แรกของคุณ",
      openActionItems: "งานที่ต้องทำ",
      participants: "ผู้เข้าร่วม",
    },
    status: {
      draft: "แบบร่าง",
      processing: "กำลังประมวลผล",
      completed: "เสร็จสมบูรณ์",
      failed: "ล้มเหลว",
    },
    jobType: {
      transcribe: "ถอดเสียง",
      diarize: "แยกผู้พูด",
      summarize: "สรุปเนื้อหา",
    },
    jobStatus: {
      queued: "รอคิว",
      running: "กำลังทำงาน",
      completed: "เสร็จแล้ว",
      failed: "ล้มเหลว",
    },
    newMeeting: {
      title: "สร้างการประชุมใหม่",
      subtitle: "อัปโหลดไฟล์เสียง แล้วปล่อยให้ Whisper จัดการที่เหลือ",
      titleLabel: "ชื่อการประชุม",
      titlePlaceholder: "เช่น ประชุมทีมประจำสัปดาห์",
      fileLabel: "ไฟล์เสียง (mp3, wav, flac)",
      submit: "เริ่มประมวลผล",
      submitting: "กำลังส่ง...",
    },
    meetingDetail: {
      processingTitle: "กำลังประมวลผลการประชุมของคุณ",
      processingBody: "ขั้นตอนนี้ใช้เวลาสักครู่ หน้านี้จะอัปเดตอัตโนมัติ",
      failedTitle: "ประมวลผลไม่สำเร็จ",
      failedBody: "เกิดข้อผิดพลาดระหว่างประมวลผลการประชุมนี้ ลองอัปโหลดใหม่อีกครั้ง",
      tabTranscript: "บทถอดเสียง",
      tabSummary: "สรุป",
      tabActionItems: "รายการงาน",
      noActionItems: "ยังไม่มีรายการงาน",
      due: "กำหนดส่ง",
      assignee: "ผู้รับผิดชอบ",
    },
    common: { back: "ย้อนกลับ" },
  },
  en: {
    brand: "Whisper",
    nav: { login: "Log in", dashboard: "Dashboard", logout: "Log out" },
    landing: {
      eyebrow: "AI meeting intelligence for Thai teams",
      title: "Hear the meeting. Ship the follow-up.",
      subtitle:
        "Upload the recording and let Whisper transcribe, identify speakers, summarize, and pull out action items automatically.",
      cta: "Get started free",
      ctaSecondary: "Log in",
      featuresTitle: "Everything that happens after the meeting ends",
      feature1Title: "Accurate transcription",
      feature1Body: "Thai-language transcription with word-level timestamps.",
      feature2Title: "Automatic speaker diarization",
      feature2Body: "Know exactly who said what, and when, in every meeting.",
      feature3Title: "Summary & follow-ups",
      feature3Body: "Key points and action items extracted automatically.",
    },
    auth: {
      loginTitle: "Log in",
      signupTitle: "Create an account",
      email: "Email",
      password: "Password",
      displayName: "Display name",
      loginSubmit: "Log in",
      signupSubmit: "Create account",
      switchToSignup: "No account yet? Sign up",
      switchToLogin: "Already have an account? Log in",
      mockNotice: "Demo mode: any input logs you in instantly.",
    },
    dashboard: {
      title: "Team meetings",
      subtitle: "Your meetings and their latest processing status",
      newMeeting: "+ New meeting",
      empty: "No meetings yet. Upload your first recording.",
      openActionItems: "open action items",
      participants: "participants",
    },
    status: {
      draft: "Draft",
      processing: "Processing",
      completed: "Completed",
      failed: "Failed",
    },
    jobType: {
      transcribe: "Transcribe",
      diarize: "Diarize",
      summarize: "Summarize",
    },
    jobStatus: {
      queued: "Queued",
      running: "Running",
      completed: "Completed",
      failed: "Failed",
    },
    newMeeting: {
      title: "New meeting",
      subtitle: "Upload the recording and let Whisper handle the rest",
      titleLabel: "Meeting title",
      titlePlaceholder: "e.g. Weekly team sync",
      fileLabel: "Audio file (mp3, wav, flac)",
      submit: "Start processing",
      submitting: "Submitting...",
    },
    meetingDetail: {
      processingTitle: "Processing your meeting",
      processingBody: "This takes a moment — this page updates automatically.",
      failedTitle: "Processing failed",
      failedBody: "Something went wrong while processing this meeting. Try uploading it again.",
      tabTranscript: "Transcript",
      tabSummary: "Summary",
      tabActionItems: "Action items",
      noActionItems: "No action items yet",
      due: "Due",
      assignee: "Assignee",
    },
    common: { back: "Back" },
  },
} as const;

function widen<T>(value: T): DeepWiden<T> {
  return value as DeepWiden<T>;
}

type DeepWiden<T> = T extends string
  ? string
  : T extends object
    ? { [K in keyof T]: DeepWiden<T[K]> }
    : T;

export type Dictionary = DeepWiden<typeof dictionaries.th>;
export const dictionary = { th: widen(dictionaries.th), en: widen(dictionaries.en) } as Record<
  Locale,
  Dictionary
>;
