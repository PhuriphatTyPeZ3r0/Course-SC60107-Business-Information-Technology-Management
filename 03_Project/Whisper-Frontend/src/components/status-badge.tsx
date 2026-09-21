import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/context";
import type { JobStatus, MeetingStatus } from "@/lib/types";

const MEETING_STATUS_STYLES: Record<MeetingStatus, string> = {
  draft: "bg-muted text-muted-foreground border-transparent",
  processing: "bg-accent/20 text-accent border-accent/30 animate-pulse",
  completed: "bg-primary/20 text-primary border-primary/30",
  failed: "bg-destructive/20 text-destructive border-destructive/30",
};

const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  queued: "bg-muted text-muted-foreground border-transparent",
  running: "bg-accent/20 text-accent border-accent/30 animate-pulse",
  completed: "bg-primary/20 text-primary border-primary/30",
  failed: "bg-destructive/20 text-destructive border-destructive/30",
};

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const { t } = useLanguage();
  return (
    <Badge className={cn("rounded-full", MEETING_STATUS_STYLES[status])}>
      {t.status[status]}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useLanguage();
  return (
    <Badge className={cn("rounded-full", JOB_STATUS_STYLES[status])}>
      {t.jobStatus[status]}
    </Badge>
  );
}
