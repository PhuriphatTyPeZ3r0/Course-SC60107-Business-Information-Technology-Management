import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Meeting } from "@/lib/types";
import { buildMinutesData, minutesFileBaseName } from "@/lib/export/minutes-data";

// TH Sarabun New: the de facto standard body font for Thai official
// documents. Unlike the PDF exporter, docx just references it by name -
// Word substitutes at render time, no embedding needed (it's preinstalled
// on virtually every Thai Windows/Office install).
const FONT = "TH Sarabun New";
const BODY_SIZE = 32; // half-points = 16pt
const HEADING_SIZE = 36; // 18pt

function bodyParagraph(text: string, opts: Partial<{ bold: boolean; spacingAfter: number }> = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter ?? 120 },
    children: [new TextRun({ text, font: FONT, size: BODY_SIZE, bold: opts.bold })],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, font: FONT, size: HEADING_SIZE, bold: true })],
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONT, size: BODY_SIZE })],
  });
}

function tableCell(text: string, opts: Partial<{ bold: boolean; widthPct: number }> = {}) {
  return new TableCell({
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: FONT, size: BODY_SIZE, bold: opts.bold })],
      }),
    ],
  });
}

export async function exportMeetingToWord(meeting: Meeting): Promise<void> {
  const data = buildMinutesData(meeting);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: `รายงานการประชุม: ${data.title}`, font: FONT, size: 48, bold: true })],
    }),
    bodyParagraph(`วันที่ประชุม: ${data.meetingDateLabel}`),
  ];

  if (data.durationLabel) {
    children.push(bodyParagraph(`ระยะเวลา: ${data.durationLabel} นาที`));
  }

  children.push(sectionHeading("ผู้เข้าร่วมประชุม"));
  if (data.participants.length > 0) {
    children.push(...data.participants.map((p) => bulletParagraph(p)));
  } else {
    children.push(bodyParagraph("ไม่มีข้อมูลผู้เข้าร่วม"));
  }

  children.push(sectionHeading("สรุปการประชุม"));
  if (data.summaryBlocks.length > 0) {
    for (const block of data.summaryBlocks) {
      if (block.type === "heading") {
        children.push(bodyParagraph(block.text, { bold: true, spacingAfter: 60 }));
      } else if (block.type === "list") {
        children.push(...block.items.map((item) => bulletParagraph(item)));
      } else {
        children.push(bodyParagraph(block.text));
      }
    }
  } else {
    children.push(bodyParagraph("ไม่มีสรุปการประชุม"));
  }

  children.push(sectionHeading("รายการงานที่ต้องดำเนินการ"));
  if (data.actionItems.length > 0) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              tableCell("งาน", { bold: true, widthPct: 46 }),
              tableCell("ผู้รับผิดชอบ", { bold: true, widthPct: 20 }),
              tableCell("กำหนดเวลา", { bold: true, widthPct: 17 }),
              tableCell("สถานะ", { bold: true, widthPct: 17 }),
            ],
          }),
          ...data.actionItems.map(
            (item) =>
              new TableRow({
                children: [
                  tableCell(item.description),
                  tableCell(item.assigneeName),
                  tableCell(item.dueDate),
                  tableCell(item.statusLabel),
                ],
              }),
          ),
        ],
      }),
    );
  } else {
    children.push(bodyParagraph("ไม่มีรายการงานที่ต้องดำเนินการ"));
  }

  children.push(sectionHeading("บทถอดเสียง"));
  if (data.transcript.length > 0) {
    for (const line of data.transcript) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `[${line.timestamp}] ${line.speakerLabel}: `, font: FONT, size: BODY_SIZE, bold: true }),
            new TextRun({ text: line.text, font: FONT, size: BODY_SIZE }),
          ],
        }),
      );
    }
  } else {
    children.push(bodyParagraph("ไม่มีบทถอดเสียง"));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${minutesFileBaseName(meeting)}.docx`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
