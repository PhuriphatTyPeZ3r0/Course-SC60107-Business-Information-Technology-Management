export type Locale = "th" | "en";

export const dictionaries = {
  th: {
    brand: "Whisper",
    nav: { login: "เข้าสู่ระบบ", dashboard: "แดชบอร์ด", logout: "ออกจากระบบ", profile: "โปรไฟล์" },
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
      loginSubtitle: "เข้าสู่ระบบด้วยบัญชี Google ของคุณ",
      googleSignIn: "เข้าสู่ระบบด้วย Google",
    },
    dashboard: {
      title: "การประชุมของทีม",
      subtitle: "รายการประชุมและสถานะการประมวลผลล่าสุด",
      newMeeting: "+ ประชุมใหม่",
      empty: "ยังไม่มีการประชุม เริ่มอัปโหลดไฟล์แรกของคุณ",
      openActionItems: "งานที่ต้องทำ",
      participants: "ผู้เข้าร่วม",
      deleteMeeting: "ลบการประชุม",
      deleteMeetingConfirmTitle: "ลบการประชุมนี้?",
      deleteMeetingConfirmBody: "การประชุมนี้จะถูกซ่อนจากรายการของคุณ การกระทำนี้ไม่สามารถย้อนกลับได้ด้วยตนเอง",
      deleteMeetingSuccess: "ลบการประชุมแล้ว",
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
      fileHint: "รองรับไฟล์ .mp3, .wav, .m4a, .flac, .ogg, .webm ขนาดไม่เกิน 25MB",
      submit: "เริ่มประมวลผล",
      submitting: "กำลังส่ง...",
      personalLimitReached: "คุณใช้โควตาการประชุมของวันนี้ครบแล้ว (จำกัด {limit} ครั้ง/วัน) กรุณาลองใหม่พรุ่งนี้",
      globalLimitReached: "ระบบเต็มชั่วคราว โควตาการประมวลผลของวันนี้หมดแล้ว กรุณาลองใหม่พรุ่งนี้",
    },
    profile: {
      title: "โปรไฟล์",
      subtitle: "ข้อมูลบัญชีและโควตาการใช้งานของคุณ",
      email: "อีเมล",
      displayNameLabel: "ชื่อที่แสดง",
      save: "บันทึก",
      saved: "บันทึกชื่อที่แสดงแล้ว",
      usageTitle: "โควตาการใช้งานวันนี้",
      usagePersonal: "การประชุมของคุณ",
      usageGlobal: "การประชุมทั้งระบบ",
      usageResetNote: "รีเซ็ตทุกเที่ยงคืน (UTC)",
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
      singleSpeakerFallback:
        "ตรวจพบผู้พูดเพียงคนเดียว — ระบบแยกเสียงอาจไม่รองรับไฟล์นี้ (รองรับเฉพาะ WAV แบบสเตอริโอ) ลองอัปโหลดไฟล์ WAV 2 แชนแนลหากต้องการแยกผู้พูด",
      addActionItem: "เพิ่มรายการงาน",
      editActionItem: "แก้ไขรายการงาน",
      descriptionLabel: "รายละเอียด",
      descriptionPlaceholder: "ต้องทำอะไร?",
      assigneePlaceholder: "ชื่อผู้รับผิดชอบ (ไม่บังคับ)",
      dueDateLabel: "วันครบกำหนด",
      renameMeetingLabel: "แก้ไขชื่อการประชุม",
    },
    common: { back: "ย้อนกลับ", save: "บันทึก", cancel: "ยกเลิก", delete: "ลบ" },
    privacy: {
      title: "นโยบายความเป็นส่วนตัว",
      updated: "ปรับปรุงล่าสุด: 22 กันยายน 2569",
      intro:
        "Whisper เป็นโปรเจกต์ของนักศึกษาสำหรับวิชา Business IT Management ไม่ใช่ผลิตภัณฑ์เชิงพาณิชย์ หน้านี้อธิบายว่าเราเก็บและใช้ข้อมูลอะไรบ้าง",
      dataTitle: "ข้อมูลที่เราเก็บ",
      dataBody:
        "เมื่อคุณเข้าสู่ระบบด้วย Google เราเก็บอีเมลและชื่อที่แสดงจากบัญชี Google ของคุณ เพื่อระบุตัวตนและแยกข้อมูลของแต่ละคน เมื่อคุณอัปโหลดไฟล์เสียงประชุม เราประมวลผลไฟล์นั้นเพื่อถอดเสียง แยกผู้พูด และสรุปเนื้อหา แล้วเก็บผลลัพธ์ (บทถอดเสียง สรุป รายการงาน) ไว้ในบัญชีของคุณ",
      useTitle: "การใช้ข้อมูล",
      useBody:
        "ข้อมูลของคุณใช้เพื่อให้บริการฟีเจอร์ของแอปนี้เท่านั้น เราไม่ขายหรือแชร์ข้อมูลให้บุคคลภายนอกเพื่อการตลาด การประมวลผลเสียง/AI เกิดขึ้นผ่าน Cloudflare Workers AI ซึ่งเป็นผู้ให้บริการโครงสร้างพื้นฐานที่เราใช้",
      contactTitle: "ติดต่อ",
      contactBody: "มีคำถามเกี่ยวกับข้อมูลของคุณ ติดต่อ phuriphathem@gmail.com",
    },
  },
  en: {
    brand: "Whisper",
    nav: { login: "Log in", dashboard: "Dashboard", logout: "Log out", profile: "Profile" },
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
      loginSubtitle: "Sign in with your Google account",
      googleSignIn: "Sign in with Google",
    },
    dashboard: {
      title: "Team meetings",
      subtitle: "Your meetings and their latest processing status",
      newMeeting: "+ New meeting",
      empty: "No meetings yet. Upload your first recording.",
      openActionItems: "open action items",
      participants: "participants",
      deleteMeeting: "Delete meeting",
      deleteMeetingConfirmTitle: "Delete this meeting?",
      deleteMeetingConfirmBody: "This meeting will be hidden from your list. This can't be undone yourself.",
      deleteMeetingSuccess: "Meeting deleted",
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
      fileHint: "Supports .mp3, .wav, .m4a, .flac, .ogg, .webm — up to 25MB",
      submit: "Start processing",
      submitting: "Submitting...",
      personalLimitReached: "You've used today's meeting quota (limit: {limit}/day). Please try again tomorrow.",
      globalLimitReached: "The system is temporarily at capacity for today's processing quota. Please try again tomorrow.",
    },
    profile: {
      title: "Profile",
      subtitle: "Your account details and usage quota",
      email: "Email",
      displayNameLabel: "Display name",
      save: "Save",
      saved: "Display name saved",
      usageTitle: "Today's usage",
      usagePersonal: "Your meetings",
      usageGlobal: "System-wide meetings",
      usageResetNote: "Resets every midnight (UTC)",
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
      singleSpeakerFallback:
        "Only one speaker was detected — this file format may not support speaker separation (stereo WAV only). Try uploading a 2-channel WAV to split speakers.",
      addActionItem: "Add action item",
      editActionItem: "Edit action item",
      descriptionLabel: "Description",
      descriptionPlaceholder: "What needs to be done?",
      assigneePlaceholder: "Assignee name (optional)",
      dueDateLabel: "Due date",
      renameMeetingLabel: "Rename meeting",
    },
    common: { back: "Back", save: "Save", cancel: "Cancel", delete: "Delete" },
    privacy: {
      title: "Privacy Policy",
      updated: "Last updated: September 22, 2026",
      intro:
        "Whisper is a student project for a Business IT Management course, not a commercial product. This page explains what data we collect and how it's used.",
      dataTitle: "What we collect",
      dataBody:
        "When you sign in with Google, we store your email and display name from your Google account (encrypted with AES-256 before storage) to identify you and keep each person's data separate. When you upload a meeting recording, we process it to transcribe, separate speakers, and summarize the content, then store the results (transcript, summary, action items) in your account.",
      useTitle: "How we use it",
      useBody:
        "Your data is used only to provide this app's features. We don't sell or share it with third parties for marketing. Audio/AI processing runs through Cloudflare Workers AI, the infrastructure provider we use.",
      contactTitle: "Contact",
      contactBody: "Questions about your data? Contact phuriphathem@gmail.com",
    },
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
