"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n/context";
import { api } from "@/lib/api/client";

// DEF-001: soft-delete a meeting, with a confirmation step since it's not
// undoable from the UI (the row survives server-side via deleted_at, but
// there's no restore flow yet - see DESIGN_SYSTEM.md "Later: Soft delete").
export function DeleteMeetingDialog({
  meetingId,
  onDeleted,
  triggerClassName,
}: {
  meetingId: string;
  onDeleted: () => void;
  triggerClassName?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    try {
      await api.deleteMeeting(meetingId);
      toast.success(t.dashboard.deleteMeetingSuccess);
      setOpen(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={triggerClassName}
            aria-label={t.dashboard.deleteMeeting}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        }
      >
        <Icon name="delete" className="text-[16px]" />
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t.dashboard.deleteMeetingConfirmTitle}</DialogTitle>
          <DialogDescription>{t.dashboard.deleteMeetingConfirmBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleConfirm}>
            {t.common.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
