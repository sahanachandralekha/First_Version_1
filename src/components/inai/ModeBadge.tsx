import type { ServiceMode } from "@/services/types";
export function ModeBadge({ mode }: { mode: ServiceMode }) {
  return <span className="inline-flex min-h-6 items-center rounded-full border border-current px-2 text-[11px] font-extrabold tracking-normal" aria-label={`${mode.toLowerCase()} capability`}>{mode}</span>;
}
