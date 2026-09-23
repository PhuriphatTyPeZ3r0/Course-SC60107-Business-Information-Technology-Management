"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Meeting } from "@/lib/types";

// DEF-006: minutes export. The heavy generators (docx, jsPDF + an embedded
// Thai font) are dynamically imported on click, not at module load, so they
// never bloat the initial page bundle for users who never export.
export function ExportMenu({ meeting }: { meeting: Meeting }) {
  const [isExporting, setIsExporting] = useState<"word" | "pdf" | null>(null);

  async function handleExport(format: "word" | "pdf") {
    setIsExporting(format);
    try {
      if (format === "word") {
        const { exportMeetingToWord } = await import("@/lib/export/word-export");
        await exportMeetingToWord(meeting);
      } else {
        const { exportMeetingToPdf } = await import("@/lib/export/pdf-export");
        await exportMeetingToPdf(meeting);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ส่งออกเอกสารไม่สำเร็จ");
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
        disabled={isExporting !== null}
      >
        <Icon name={isExporting ? "progress_activity" : "download"} className={isExporting ? "animate-spin text-[16px]" : "text-[16px]"} />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("word")} disabled={isExporting !== null}>
          <Icon name="description" className="mr-2 text-[16px]" />
          Word (.docx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={isExporting !== null}>
          <Icon name="picture_as_pdf" className="mr-2 text-[16px]" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
