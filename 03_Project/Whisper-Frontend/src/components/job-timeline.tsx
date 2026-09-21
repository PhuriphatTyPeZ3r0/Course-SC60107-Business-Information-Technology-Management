"use client";

import { motion } from "framer-motion";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/context";
import type { Job } from "@/lib/types";

export function JobTimeline({ jobs }: { jobs: Job[] }) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <div key={job.id} className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border",
              job.status === "completed" && "border-primary bg-primary/20 text-primary",
              job.status === "running" && "border-accent bg-accent/20 text-accent",
              job.status === "queued" && "border-white/15 text-muted-foreground",
              job.status === "failed" && "border-destructive bg-destructive/20 text-destructive",
            )}
          >
            {job.status === "completed" && <Icon name="check" className="text-[16px]" />}
            {job.status === "running" && (
              <Icon name="progress_activity" className="animate-spin text-[16px]" />
            )}
            {job.status === "queued" && <span className="size-2 rounded-full bg-current" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{t.jobType[job.jobType]}</p>
            <p className="text-xs text-muted-foreground">{t.jobStatus[job.status]}</p>
          </div>
          {job.status === "running" && (
            <motion.div
              className="h-1 flex-1 max-w-24 overflow-hidden rounded-full bg-white/10"
              initial={false}
            >
              <motion.div
                className="h-full rounded-full bg-accent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: "50%" }}
              />
            </motion.div>
          )}
        </div>
      ))}
    </div>
  );
}
