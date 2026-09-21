"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingStatusBadge } from "@/components/status-badge";
import { useLanguage } from "@/lib/i18n/context";
import { api } from "@/lib/api/client";
import type { Meeting } from "@/lib/types";

export default function DashboardPage() {
  const { t, locale } = useLanguage();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { meetings } = await api.listMeetings();
      if (!cancelled) setMeetings(meetings);
    }

    load();
    // Cheap enough to always poll at this interval; keeps any
    // still-processing meeting's status/badge fresh without extra state.
    const interval = setInterval(load, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
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
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Link href={`/dashboard/meetings/${meeting.id}`}>
                <Card className="glass-panel h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{meeting.title}</CardTitle>
                      <MeetingStatusBadge status={meeting.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{dateFormatter.format(new Date(meeting.createdAt))}</p>
                    <div className="flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {meeting.participants.length} {t.dashboard.participants}
                    </div>
                    {meeting.actionItems.length > 0 && (
                      <p>
                        {meeting.actionItems.filter((a) => a.status !== "done").length}{" "}
                        {t.dashboard.openActionItems}
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
