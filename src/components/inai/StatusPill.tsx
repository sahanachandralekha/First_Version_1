import type { LucideIcon } from "lucide-react";
import { Activity, CircleAlert, CircleCheck, FlaskConical, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusTone = "primary" | "live" | "warning" | "danger" | "neutral";

const tones: Record<StatusTone, string> = {
  primary: "border-primary/25 bg-primary-tint text-primary-deep",
  live: "border-hearing/30 bg-hearing-tint text-hearing",
  warning: "border-warning/40 bg-warning/15 text-ink",
  danger: "border-danger/35 bg-speech-tint text-danger",
  neutral: "border-line bg-canvas text-ink",
};

const defaultIcons: Record<StatusTone, LucideIcon> = {
  primary: Activity,
  live: CircleCheck,
  warning: CircleAlert,
  danger: CircleAlert,
  neutral: Activity,
};

export function StatusPill({ label, tone = "neutral", icon: Icon, className }: {
  label: string;
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
}) {
  const Glyph = Icon ?? defaultIcons[tone];
  return (
    <span className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-chip border px-3 text-xs font-extrabold", tones[tone], className)}>
      <Glyph aria-hidden="true" className="size-4" />
      {label}
    </span>
  );
}

export function SpeakingPill({ speaking }: { speaking: boolean }) {
  return <StatusPill label={speaking ? "INAI is speaking" : "INAI is ready"} tone={speaking ? "live" : "primary"} icon={Volume2} />;
}

export function DemoBadge() {
  return <StatusPill label="Demo mode" tone="warning" icon={FlaskConical} />;
}