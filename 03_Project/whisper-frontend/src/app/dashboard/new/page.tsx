"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/context";
import { api } from "@/lib/api/client";

export default function NewMeetingPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !file) return;

    setIsSubmitting(true);
    try {
      const { meeting } = await api.createMeeting(title.trim(), file);
      router.push(`/dashboard/meetings/${meeting.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t.newMeeting.title}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t.newMeeting.subtitle}</p>

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
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <UploadCloud className="size-6" />
                {file ? file.name : t.newMeeting.fileLabel}
              </label>
              <input
                id="file"
                type="file"
                accept="audio/mp3,audio/wav,audio/flac,.mp3,.wav,.flac"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting || !file}>
              {isSubmitting ? t.newMeeting.submitting : t.newMeeting.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
