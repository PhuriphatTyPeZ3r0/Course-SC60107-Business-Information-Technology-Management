"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/lib/i18n/context";
import { api } from "@/lib/api/client";
import type { ActionItem } from "@/lib/types";

interface DraftFields {
  description: string;
  assigneeName: string;
  dueDate: string;
}

function ActionItemForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: DraftFields;
  onCancel: () => void;
  onSubmit: (draft: DraftFields) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.description.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel space-y-3 rounded-xl p-4">
      <div className="space-y-1.5">
        <Label htmlFor="action-item-description">{t.meetingDetail.descriptionLabel}</Label>
        <Input
          id="action-item-description"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder={t.meetingDetail.descriptionPlaceholder}
          required
          autoFocus
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="action-item-assignee">{t.meetingDetail.assignee}</Label>
          <Input
            id="action-item-assignee"
            value={draft.assigneeName}
            onChange={(e) => setDraft((d) => ({ ...d, assigneeName: e.target.value }))}
            placeholder={t.meetingDetail.assigneePlaceholder}
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="action-item-due-date">{t.meetingDetail.dueDateLabel}</Label>
          <Input
            id="action-item-due-date"
            type="date"
            value={draft.dueDate}
            onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          {t.common.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting || !draft.description.trim()}>
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

const EMPTY_DRAFT: DraftFields = { description: "", assigneeName: "", dueDate: "" };

function toDraft(item: ActionItem): DraftFields {
  return {
    description: item.description,
    assigneeName: item.assigneeName ?? "",
    dueDate: item.dueDate ?? "",
  };
}

export function ActionItemList({
  meetingId,
  actionItems,
}: {
  meetingId: string;
  actionItems: ActionItem[];
}) {
  const { t } = useLanguage();
  const [items, setItems] = useState(actionItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function toggle(item: ActionItem) {
    const nextStatus = item.status === "done" ? "open" : "done";
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i)));
    try {
      await api.updateActionItem(meetingId, item.id, { status: nextStatus });
    } catch {
      // Revert on failure.
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    }
  }

  async function handleCreate(draft: DraftFields) {
    const { actionItem } = await api.createActionItem(meetingId, {
      description: draft.description.trim(),
      assigneeName: draft.assigneeName.trim() || null,
      dueDate: draft.dueDate || null,
    });
    setItems((prev) => [...prev, actionItem]);
    setIsCreating(false);
  }

  async function handleEdit(item: ActionItem, draft: DraftFields) {
    const { actionItem } = await api.updateActionItem(meetingId, item.id, {
      description: draft.description.trim(),
      assigneeName: draft.assigneeName.trim() || null,
      dueDate: draft.dueDate || null,
    });
    setItems((prev) => prev.map((i) => (i.id === item.id ? actionItem : i)));
    setEditingId(null);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && !isCreating && (
        <p className="text-sm text-muted-foreground">{t.meetingDetail.noActionItems}</p>
      )}

      <ul className="space-y-3">
        {items.map((item) =>
          editingId === item.id ? (
            <li key={item.id}>
              <ActionItemForm
                initial={toDraft(item)}
                onCancel={() => setEditingId(null)}
                onSubmit={(draft) => handleEdit(item, draft)}
              />
            </li>
          ) : (
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
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.meetingDetail.editActionItem}
                onClick={() => setEditingId(item.id)}
              >
                <Icon name="edit" className="text-[16px]" />
              </Button>
            </li>
          ),
        )}
      </ul>

      {isCreating ? (
        <ActionItemForm initial={EMPTY_DRAFT} onCancel={() => setIsCreating(false)} onSubmit={handleCreate} />
      ) : (
        <Button type="button" variant="outline" className="border-white/15" onClick={() => setIsCreating(true)}>
          <Icon name="add" className="mr-1.5 text-[16px]" />
          {t.meetingDetail.addActionItem}
        </Button>
      )}
    </div>
  );
}
