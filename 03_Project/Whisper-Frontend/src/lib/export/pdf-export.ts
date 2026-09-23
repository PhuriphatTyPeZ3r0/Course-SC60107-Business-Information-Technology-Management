import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Meeting } from "@/lib/types";
import { buildMinutesData, minutesFileBaseName } from "@/lib/export/minutes-data";
import { SARABUN_REGULAR_BASE64 } from "@/lib/export/fonts/sarabun-regular";
import { SARABUN_BOLD_BASE64 } from "@/lib/export/fonts/sarabun-bold";

const FONT_NAME = "Sarabun";
const PAGE_MARGIN = 40;
const BODY_SIZE = 11;
const HEADING_SIZE = 13;
const TITLE_SIZE = 18;
const LINE_HEIGHT = 16;

function registerFonts(doc: jsPDF) {
  doc.addFileToVFS("Sarabun-Regular.ttf", SARABUN_REGULAR_BASE64);
  doc.addFont("Sarabun-Regular.ttf", FONT_NAME, "normal");
  doc.addFileToVFS("Sarabun-Bold.ttf", SARABUN_BOLD_BASE64);
  doc.addFont("Sarabun-Bold.ttf", FONT_NAME, "bold");
}

class Cursor {
  y: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly contentWidth: number;

  constructor(private doc: jsPDF) {
    this.pageWidth = doc.internal.pageSize.getWidth();
    this.pageHeight = doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - PAGE_MARGIN * 2;
    this.y = PAGE_MARGIN;
  }

  private ensureSpace(neededHeight: number) {
    if (this.y + neededHeight > this.pageHeight - PAGE_MARGIN) {
      this.doc.addPage();
      this.y = PAGE_MARGIN;
    }
  }

  text(value: string, opts: { size?: number; bold?: boolean; gapAfter?: number } = {}) {
    const size = opts.size ?? BODY_SIZE;
    this.doc.setFont(FONT_NAME, opts.bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    const lines = this.doc.splitTextToSize(value, this.contentWidth) as string[];
    for (const line of lines) {
      this.ensureSpace(LINE_HEIGHT);
      this.doc.text(line, PAGE_MARGIN, this.y);
      this.y += LINE_HEIGHT;
    }
    this.y += opts.gapAfter ?? 0;
  }

  bullet(value: string) {
    const size = BODY_SIZE;
    this.doc.setFont(FONT_NAME, "normal");
    this.doc.setFontSize(size);
    const indent = 14;
    const lines = this.doc.splitTextToSize(value, this.contentWidth - indent) as string[];
    lines.forEach((line, i) => {
      this.ensureSpace(LINE_HEIGHT);
      if (i === 0) this.doc.text("•", PAGE_MARGIN, this.y);
      this.doc.text(line, PAGE_MARGIN + indent, this.y);
      this.y += LINE_HEIGHT;
    });
  }

  heading(value: string) {
    this.y += 8;
    this.text(value, { size: HEADING_SIZE, bold: true, gapAfter: 4 });
  }
}

export async function exportMeetingToPdf(meeting: Meeting): Promise<void> {
  const data = buildMinutesData(meeting);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  registerFonts(doc);

  const cursor = new Cursor(doc);

  cursor.text(`รายงานการประชุม: ${data.title}`, { size: TITLE_SIZE, bold: true, gapAfter: 6 });
  cursor.text(`วันที่ประชุม: ${data.meetingDateLabel}`);
  if (data.durationLabel) {
    cursor.text(`ระยะเวลา: ${data.durationLabel} นาที`, { gapAfter: 4 });
  }

  cursor.heading("ผู้เข้าร่วมประชุม");
  if (data.participants.length > 0) {
    data.participants.forEach((p) => cursor.bullet(p));
  } else {
    cursor.text("ไม่มีข้อมูลผู้เข้าร่วม");
  }

  cursor.heading("สรุปการประชุม");
  if (data.summaryBlocks.length > 0) {
    for (const block of data.summaryBlocks) {
      if (block.type === "heading") {
        cursor.text(block.text, { bold: true, gapAfter: 2 });
      } else if (block.type === "list") {
        block.items.forEach((item) => cursor.bullet(item));
      } else {
        cursor.text(block.text, { gapAfter: 2 });
      }
    }
  } else {
    cursor.text("ไม่มีสรุปการประชุม");
  }

  cursor.heading("รายการงานที่ต้องดำเนินการ");
  if (data.actionItems.length > 0) {
    autoTable(doc, {
      startY: cursor.y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      styles: { font: FONT_NAME, fontSize: BODY_SIZE, cellPadding: 6 },
      headStyles: { font: FONT_NAME, fontStyle: "bold", fillColor: [230, 230, 235] },
      head: [["งาน", "ผู้รับผิดชอบ", "กำหนดเวลา", "สถานะ"]],
      body: data.actionItems.map((item) => [item.description, item.assigneeName, item.dueDate, item.statusLabel]),
      didDrawPage: () => {
        cursor.y = PAGE_MARGIN;
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor.y = (doc as any).lastAutoTable.finalY + 16;
  } else {
    cursor.text("ไม่มีรายการงานที่ต้องดำเนินการ");
  }

  cursor.heading("บทถอดเสียง");
  if (data.transcript.length > 0) {
    for (const line of data.transcript) {
      cursor.text(`[${line.timestamp}] ${line.speakerLabel}: ${line.text}`, { gapAfter: 4 });
    }
  } else {
    cursor.text("ไม่มีบทถอดเสียง");
  }

  doc.save(`${minutesFileBaseName(meeting)}.pdf`);
}
