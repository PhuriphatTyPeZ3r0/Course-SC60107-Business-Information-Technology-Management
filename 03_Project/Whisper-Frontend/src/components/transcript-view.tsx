import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n/context";
import type { Transcript } from "@/lib/types";

const SPEAKER_COLORS = [
  "bg-primary/20 text-primary border-primary/30",
  "bg-accent/20 text-accent border-accent/30",
  "bg-chart-3/20 text-chart-3 border-chart-3/30",
  "bg-chart-4/20 text-chart-4 border-chart-4/30",
];

function formatTimestamp(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TranscriptView({ transcript }: { transcript: Transcript }) {
  const { t } = useLanguage();
  const speakerOrder = [...new Set(transcript.segments.map((s) => s.speakerLabel))];

  return (
    <div className="space-y-5">
      {transcript.diarizationMethod === "single-speaker-fallback" && (
        <div className="flex items-start gap-2 rounded-lg border border-muted-foreground/20 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Icon name="info" className="mt-0.5 text-[14px] shrink-0" />
          <span>{t.meetingDetail.singleSpeakerFallback}</span>
        </div>
      )}
      {transcript.segments.map((segment) => {
        const colorIndex = speakerOrder.indexOf(segment.speakerLabel) % SPEAKER_COLORS.length;
        return (
          <div key={segment.id} className="flex gap-3">
            <div className="flex w-16 shrink-0 flex-col items-start gap-1 pt-0.5">
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatTimestamp(segment.startTimeMs)}
              </span>
            </div>
            <div className="flex-1 space-y-1">
              <Badge variant="outline" className={SPEAKER_COLORS[colorIndex]}>
                {segment.speakerLabel}
              </Badge>
              <p className="text-sm leading-relaxed">{segment.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
