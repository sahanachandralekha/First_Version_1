import { useEffect, useState } from "react";
import { Play, Pause, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeBadge } from "@/components/inai/ModeBadge";
import { INAIAvatar } from "@/components/inai/INAIAvatar";
import { missingSignMessage, type SignPhrase } from "@/services/sign-language";

/**
 * Skeleton player for validated ISL registry phrases. Runtime sign generation
 * is intentionally impossible — the full playback UI lands in stage 4.
 */
export function SignLanguagePlayer({ phrase, autoPlay = false }: { phrase: SignPhrase | null; autoPlay?: boolean }) {
  const [playing, setPlaying] = useState(autoPlay);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!playing || !phrase?.steps.length) return;
    const timer = window.setTimeout(() => {
      setStep((current) => (current + 1 < phrase.steps.length ? current + 1 : 0));
    }, phrase.steps[step]?.durationMs ?? 900);
    return () => window.clearTimeout(timer);
  }, [playing, step, phrase]);

  if (!phrase) {
    return <p className="rounded-card border border-line bg-canvas p-4 text-sm font-semibold text-muted-foreground">{missingSignMessage}. I can show the words instead.</p>;
  }

  const current = phrase.steps[step];
  return (
    <section className="rounded-card border border-line bg-background p-4 shadow-inai" aria-label={`Indian Sign Language for ${phrase.text}`}>
      <header className="flex items-center gap-2">
        <strong className="text-sm">{phrase.text}</strong>
        <span className="ml-auto flex items-center gap-2 text-hearing">
          <ModeBadge mode={phrase.validation.status === "validated" ? "REAL" : "FUTURE"} />
        </span>
      </header>
      <div className="mt-3 grid grid-cols-[6rem_1fr] items-center gap-3 rounded-control bg-primary-tint p-3">
        <INAIAvatar state="signing" gesture="open_palms" size="xs" />
        <div>
          <p className="text-xs font-bold uppercase text-primary">Step {step + 1} of {phrase.steps.length}</p>
          <p className="text-sm font-semibold">{current?.gloss}</p>
          <p className="text-xs text-muted-foreground">{current?.description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="rounded-full" onClick={() => setPlaying((value) => !value)}>
          {playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play sign"}
        </Button>
        <a
          href={phrase.reference.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line px-4 text-sm font-semibold text-primary"
        >
          Watch the real sign
        </a>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3" />{phrase.reference.label}</p>
      </div>
    </section>
  );
}
