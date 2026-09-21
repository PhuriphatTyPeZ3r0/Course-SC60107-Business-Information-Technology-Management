"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingStatusBadge } from "@/components/status-badge";
import { JobTimeline } from "@/components/job-timeline";
import { TranscriptView } from "@/components/transcript-view";
import { ActionItemList } from "@/components/action-item-list";
import { useLanguage } from "@/lib/i18n/context";
import { useMounted } from "@/lib/hooks/use-mounted";
import { api } from "@/lib/api/client";
import type { Meeting } from "@/lib/types";

export default function MeetingDetailPage(props: PageProps<"/dashboard/meetings/[id]">) {
  const { id } = use(props.params);
  const { t } = useLanguage();
  const mounted = useMounted();
  const [meeting, setMeeting] = useState<Meeting | null>(null);

  useEffect(() => {
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
        <ChevronLeft className="size-4" />
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
            <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
            <MeetingStatusBadge status={meeting.status} />
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
                    <TriangleAlert className="size-4" />
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
                      <p className="text-sm leading-relaxed">{meeting.summary.text}</p>
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
