"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/context";
import { api, ApiError } from "@/lib/api/client";
import type { UsageStatus } from "@/lib/types";

export default function NewMeetingPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usage, setUsage] = useState<UsageStatus | null>(null);

  // Checked on load so a user sees the "system is full" banner before
  // filling out the form, not only after submitting into a 429 - see
  // DESIGN_SYSTEM.md's rate-limit grilling session.
  useEffect(() => {
    api
      .getUsageToday()
      .then(({ usage }) => setUsage(usage))
      .catch(() => {});
  }, []);

  const globalBlocked = usage ? usage.global.used >= usage.global.limit : false;
  const personalBlocked = usage ? usage.personal.used >= usage.personal.limit : false;
  const blockedReason: "global" | "personal" | null = globalBlocked ? "global" : personalBlocked ? "personal" : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !file || blockedReason) return;

    setIsSubmitting(true);
    try {
      const { meeting } = await api.createMeeting(title.trim(), file);
      router.push(`/dashboard/meeting?id=${meeting.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        if (err.usage) setUsage(err.usage);
        toast.error(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t.newMeeting.title}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t.newMeeting.subtitle}</p>

      {blockedReason && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {blockedReason === "global"
            ? t.newMeeting.globalLimitReached
            : t.newMeeting.personalLimitReached.replace("{limit}", String(usage?.personal.limit ?? ""))}
        </div>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">{t.newMeeting.titleLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="title">{t.newMeeting.titleLabel}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.newMeeting.titlePlaceholder}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="file">{t.newMeeting.fileLabel}</Label>
              <label
                htmlFor="file"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Icon name="upload" className="text-[24px]" />
                {file ? file.name : t.newMeeting.fileLabel}
              </label>
              <input
                id="file"
                type="file"
                accept="audio/mp3,audio/wav,audio/flac,.mp3,.wav,.flac"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">{t.newMeeting.fileHint}</p>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting || !file || !!blockedReason}>
              {isSubmitting ? t.newMeeting.submitting : t.newMeeting.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
