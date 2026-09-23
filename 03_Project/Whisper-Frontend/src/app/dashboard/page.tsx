"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingStatusBadge } from "@/components/status-badge";
import { DeleteMeetingDialog } from "@/components/delete-meeting-dialog";
import { useLanguage } from "@/lib/i18n/context";
import { api } from "@/lib/api/client";
import { glassSpring } from "@/lib/motion";
import type { MeetingSummaryView } from "@/lib/types";

export default function DashboardPage() {
  const { t, locale } = useLanguage();
  const [meetings, setMeetings] = useState<MeetingSummaryView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const { meetings } = await api.listMeetings();
      if (cancelled) return;
      setMeetings(meetings);
      // Stop polling once nothing is still processing — mirrors the same
      // pattern on the meeting detail page. Restarts on next mount/focus.
      if (!meetings.some((m) => m.status === "processing") && interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    load();
    interval = setInterval(load, 2500);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  const dateFormatter = new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.title}</h1>
          <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
        </div>
        <Link href="/dashboard/new" className={buttonVariants()}>
          {t.dashboard.newMeeting}
        </Link>
      </div>

      {meetings === null && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {meetings?.length === 0 && (
        <Card className="glass-panel">
          <CardContent className="py-16 text-center text-muted-foreground">
            {t.dashboard.empty}
          </CardContent>
        </Card>
      )}

      {meetings && meetings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting, i) => (
            <motion.div
              key={meeting.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...glassSpring, delay: i * 0.05 }}
            >
              <Link href={`/dashboard/meeting?id=${meeting.id}`}>
                <Card className="glass-panel h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{meeting.title}</CardTitle>
                      <div className="flex shrink-0 items-center gap-1">
                        <MeetingStatusBadge status={meeting.status} />
                        <DeleteMeetingDialog
                          meetingId={meeting.id}
                          onDeleted={() => setMeetings((prev) => prev?.filter((m) => m.id !== meeting.id) ?? prev)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{dateFormatter.format(new Date(meeting.createdAt))}</p>
                    <div className="flex items-center gap-1.5">
                      <Icon name="group" className="text-[14px]" />
                      {meeting.participantCount} {t.dashboard.participants}
                    </div>
                    {meeting.actionItemOpenCount > 0 && (
                      <p>
                        {meeting.actionItemOpenCount} {t.dashboard.openActionItems}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
