"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { MeetingStatusBadge } from "@/components/status-badge";
import { JobTimeline } from "@/components/job-timeline";
import { TranscriptView } from "@/components/transcript-view";
import { ActionItemList } from "@/components/action-item-list";
import { DeleteMeetingDialog } from "@/components/delete-meeting-dialog";
import { SummaryView } from "@/components/summary-view";
import { ExportMenu } from "@/components/export-menu";
import { useLanguage } from "@/lib/i18n/context";
import { useMounted } from "@/lib/hooks/use-mounted";
import { api } from "@/lib/api/client";
import type { Meeting } from "@/lib/types";

function EditableMeetingTitle({
  meeting,
  onRenamed,
}: {
  meeting: Meeting;
  onRenamed: (title: string) => void;
}) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(meeting.title);

  async function save() {
    const trimmed = title.trim();
    setIsEditing(false);
    if (!trimmed || trimmed === meeting.title) {
      setTitle(meeting.title);
      return;
    }
    onRenamed(trimmed);
    try {
      await api.renameMeeting(meeting.id, trimmed);
    } catch {
      onRenamed(meeting.title);
      setTitle(meeting.title);
    }
  }

  if (isEditing) {
    return (
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setTitle(meeting.title);
            setIsEditing(false);
          }
        }}
        autoFocus
        className="h-auto text-2xl font-semibold tracking-tight"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      aria-label={t.meetingDetail.renameMeetingLabel}
      className="group flex items-center gap-2 text-left"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
      <Icon
        name="edit"
        className="text-[16px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}

// A query-param route (?id=...), not a dynamic segment ([id]/page.tsx): this
// app is deployed as a static export (Cloudflare Pages has no Next.js SSR
// runtime here), and static hosting can't serve arbitrary unknown dynamic
// paths - there's only ever one physical /dashboard/meeting page, and the id
// is pure client-side state via useSearchParams().
function MeetingDetailContent() {
  const id = useSearchParams().get("id") ?? "";
  const { t } = useLanguage();
  const mounted = useMounted();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const { meeting } = await api.getMeeting(id);
      if (cancelled) return;
      setMeeting(meeting);
      if (meeting.status !== "processing" && interval) {
        clearInterval(interval);
      }
    }

    load();
    interval = setInterval(load, 1200);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id]);

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <Icon name="chevron_left" className="text-[16px]" />
        {t.common.back}
      </Link>

      {!meeting && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      )}

      {meeting && (
        <>
          <div className="mb-8 flex items-center justify-between gap-3">
            <EditableMeetingTitle
              meeting={meeting}
              onRenamed={(title) => setMeeting((m) => (m ? { ...m, title } : m))}
            />
            <div className="flex shrink-0 items-center gap-2">
              <MeetingStatusBadge status={meeting.status} />
              {meeting.status === "completed" && <ExportMenu meeting={meeting} />}
              <DeleteMeetingDialog meetingId={meeting.id} onDeleted={() => router.push("/dashboard")} />
            </div>
          </div>

          {meeting.status === "processing" && (
            <motion.div initial={{ opacity: 0 }} animate={mounted ? { opacity: 1 } : undefined}>
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base">{t.meetingDetail.processingTitle}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t.meetingDetail.processingBody}</p>
                </CardHeader>
                <CardContent>
                  <JobTimeline jobs={meeting.jobs} />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {meeting.status === "failed" && (
            <motion.div initial={{ opacity: 0 }} animate={mounted ? { opacity: 1 } : undefined}>
              <Card className="glass-panel border-destructive/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-destructive">
                    <Icon name="warning" className="text-[16px]" />
                    {t.meetingDetail.failedTitle}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t.meetingDetail.failedBody}</p>
                </CardHeader>
                <CardContent>
                  <JobTimeline jobs={meeting.jobs} />
                  {meeting.jobs.some((j) => j.errorMessage) && (
                    <p className="mt-4 text-xs text-destructive/80">
                      {meeting.jobs.find((j) => j.errorMessage)?.errorMessage}
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {meeting.status === "completed" && meeting.transcript && meeting.summary && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={mounted ? { opacity: 1, y: 0 } : undefined}>
              <Tabs defaultValue="summary">
                <TabsList className="mb-6">
                  <TabsTrigger value="summary">{t.meetingDetail.tabSummary}</TabsTrigger>
                  <TabsTrigger value="transcript">{t.meetingDetail.tabTranscript}</TabsTrigger>
                  <TabsTrigger value="actions">{t.meetingDetail.tabActionItems}</TabsTrigger>
                </TabsList>

                <TabsContent value="summary">
                  <Card className="glass-panel">
                    <CardContent className="pt-6">
                      <SummaryView text={meeting.summary.text} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="transcript">
                  <Card className="glass-panel">
                    <CardContent className="pt-6">
                      <TranscriptView transcript={meeting.transcript} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="actions">
                  <ActionItemList meetingId={meeting.id} actionItems={meeting.actionItems} />
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

export default function MeetingDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-48 rounded-2xl" />}>
      <MeetingDetailContent />
    </Suspense>
  );
}
