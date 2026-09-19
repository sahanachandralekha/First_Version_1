import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, type LucideIcon } from "lucide-react";

/** Centered 480px app frame: soft page background, full width on mobile, safe-area padding. */
export function AppShell({ children, nav = false, className = "" }: { children: ReactNode; nav?: boolean | ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className={`mx-auto flex min-h-dvh max-w-[480px] flex-col bg-background pb-[env(safe-area-inset-bottom)] shadow-inai ${className}`}>
        {children}
        {nav}
      </div>
    </div>
  );
}

/** Back chevron, centered {icon, title, subtitle}, optional right action. */
export function ScreenHeader({ title, subtitle, icon: Icon = Sparkles, backTo = "/home", backLabel = "Back to home", right }: {
  title: string; subtitle: string; icon?: LucideIcon; backTo?: string; backLabel?: string; right?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 px-5 py-2">
      <Link to={backTo as never} aria-label={backLabel} className="grid size-12 place-items-center rounded-full bg-primary-tint text-primary">
        <ArrowLeft />
      </Link>
      <div className="flex min-w-0 items-center justify-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-tint text-primary"><Icon /></span>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-lg font-extrabold text-ink">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="grid size-12 place-items-center justify-self-end">{right}</div>
    </header>
  );
}

/** Handwritten Caveat marginalia. Decorative only; hidden below 360px. */
export function ScriptNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p aria-hidden="true" className={`absolute hidden min-[360px]:block rotate-[-6deg] font-hand text-marginalia ${className}`}>
      {children}
    </p>
  );
}

/** Decorative aria-hidden four-point stars. */
export function InaiSparkles({ className = "" }: { className?: string }) {
  const star = "M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z";
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-primary/40"><path d={star} /></svg>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="-ml-2 mt-4 text-primary/30"><path d={star} /></svg>
    </span>
  );
}
