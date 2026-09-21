"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n/context";
import { api } from "@/lib/api/client";
import type { ActionItem } from "@/lib/types";

export function ActionItemList({
  meetingId,
  actionItems,
}: {
  meetingId: string;
  actionItems: ActionItem[];
}) {
  const { t } = useLanguage();
  const [items, setItems] = useState(actionItems);

  async function toggle(item: ActionItem) {
    const nextStatus = item.status === "done" ? "open" : "done";
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i)));
    try {
      await api.setActionItemStatus(meetingId, item.id, nextStatus);
    } catch {
      // Revert on failure — mock API practically never fails, kept minimal.
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.meetingDetail.noActionItems}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="glass-panel flex items-start gap-3 rounded-xl p-4">
          <Checkbox
            checked={item.status === "done"}
            onCheckedChange={() => toggle(item)}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-1">
            <p className={item.status === "done" ? "text-sm line-through text-muted-foreground" : "text-sm"}>
              {item.description}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {item.assigneeName && (
                <Badge variant="outline" className="border-white/15">
                  {t.meetingDetail.assignee}: {item.assigneeName}
                </Badge>
              )}
              {item.dueDate && (
                <Badge variant="outline" className="border-white/15">
                  {t.meetingDetail.due}: {item.dueDate}
                </Badge>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
