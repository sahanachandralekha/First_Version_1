import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, Camera, Compass, Ear, Eye, Image as ImageIcon, Languages, MapPin, Menu, MessageCircle,
  Mic, Navigation, Repeat, Save, Send, Settings, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp, Volume2, X,
} from "lucide-react";
import { AppShell } from "@/components/layout/primitives";
import { useSessionStore } from "@/stores/session-store";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { INAIAvatar } from "@/components/inai/INAIAvatar";
import { CaptionRegion } from "@/components/inai/CaptionRegion";
import { ModeBadge } from "@/components/inai/ModeBadge";
import { CameraStage } from "@/components/inai/CameraStage";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useINAIVoice } from "@/hooks/use-inai-voice";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { contextEngine } from "@/services/context-engine";
import { routeDirective } from "@/services/output-router";
import { eventBus, type NormalizedEvent } from "@/services/events";
import { audioEventService, microphoneUnavailableError, type SoundEvent } from "@/services/audio-events";
import { sttService, isSpeechRecognitionSupported, unsupportedSpeechError } from "@/services/stt";
import type { VisionDetection } from "@/services/vision";
import { understandScene, summarizeTranscript, inaiChat } from "@/lib/inai/ai.functions";

function DeviceBar() { return <div aria-hidden="true" className="flex h-9 shrink-0 items-center justify-between px-6 text-xs font-extrabold"><span>9:41</span><span>▮▮▮ ◉ ▰</span></div>; }
function Page({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return <AppShell nav={nav ? <BottomNavigation /> : false}><DeviceBar />{children}</AppShell>;
}
function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="flex items-start gap-2 px-5 pt-2">
      <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/home" aria-label="Back to home"><ArrowLeft /></Link></Button>
      <div className="flex-1">
        <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/** Docked INAI card used on the camera screens. */
function DockedINAI({ line, speaking, mouth, gesture = "open_palms" }: { line: string; speaking: boolean; mouth: number; gesture?: string }) {
  return (
    <section className="grid grid-cols-[5rem_1fr] items-center gap-2 rounded-card border border-line bg-background p-3 shadow-inai">
      <INAIAvatar state={speaking ? "speaking" : "guiding"} gesture={gesture} mouthOpenness={mouth} size="xs" />
      <div>
        <p className="flex items-center gap-2 text-xs font-extrabold text-primary">
          INAI {speaking && <span className="flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-live">● Speaking</span>}
        </p>
        <p className="text-sm font-semibold leading-relaxed">{line}</p>
      </div>
    </section>
  );
}

function ActionRow({ actions }: { actions: Array<[ReactNode, string, (() => void) | undefined]> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map(([icon, label, onClick]) => (
        <Button key={label} variant="outline" onClick={onClick} className="h-auto min-h-16 flex-col gap-1 rounded-card text-xs font-bold">
          {icon}{label}
        </Button>
      ))}
    </div>
  );
}

/** Shared plumbing: routes every incoming event through the context engine. */
function useDirectiveRouter() {
  const profile = useAccessibilityStore((state) => state.profile);
  const prefs = useAccessibilityStore((state) => state.prefs);
  const [caption, setCaption] = useState("");
  const [critical, setCritical] = useState(false);
  useEffect(() => eventBus.subscribe((event: NormalizedEvent) => {
    const directive = contextEngine.toDirective(event, profile);
    if (!directive) return;
    routeDirective(directive, profile, {
      voiceEnabled: prefs.voiceEnabled, hapticEnabled: prefs.hapticEnabled, signEnabled: prefs.signEnabled,
      onCaption: (text, isCritical) => { setCaption(text); setCritical(isCritical); },
    });
  }), [profile, prefs]);
  return { caption, critical };
}

/* ---------------------------------------------------------------- Screen 06 */

export function VisionScreen() {
  const { speak, speaking, mouthOpenness } = useINAIVoice();
  const profile = useAccessibilityStore((state) => state.profile);
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [line, setLine] = useState("I'm looking around for you.");
  const [tip, setTip] = useState(true);
  const understand = useServerFn(understandScene);
  const lastAsk = useRef(0);
  const { caption, critical } = useDirectiveRouter();

  const handleDetections = useCallback((next: VisionDetection[]) => setDetections(next), []);

  useEffect(() => {
    if (!detections.length) return;
    const now = Date.now();
    if (now - lastAsk.current < 6000) return;
    lastAsk.current = now;
    void understand({ data: {
      detections: detections.map((d) => ({ label: d.label, approxDistance: d.approxDistance, confidence: d.confidence })),
      profile, lastGuidance: line,
    } })
      .then((result) => {
        const message = result.guidance || result.summary;
        if (!message) return;
        setLine(message);
        void speak(message, result.priority === "critical" ? "emergency" : "guidance");
      })
      .catch(() => undefined);
  }, [detections, profile, understand, speak, line]);

  const chips = detections.slice(0, 3);
  return (
    <Page>
      <Header title="AI Vision" subtitle="INAI describes what is in front of you." />
      <main className="flex-1 space-y-4 px-5 pb-24 pt-3">
        <CameraStage onDetections={handleDetections} />
        <DockedINAI line={line} speaking={speaking} mouth={mouthOpenness} />
        <div className="grid grid-cols-3 gap-2">
          {(chips.length ? chips : [{ id: "wait", label: "Looking", approxDistance: 0 } as VisionDetection]).map((chip) => (
            <div key={chip.id} className="rounded-card border border-line p-3 text-center">
              <strong className="block text-sm">{chip.label}</strong>
              <span className="text-xs text-muted-foreground">{chip.approxDistance ? `~${Math.round(chip.approxDistance)} m away` : "Scanning"}</span>
            </div>
          ))}
        </div>
        <ActionRow actions={[
          [<Eye key="d" className="size-5" />, "Describe More", () => { lastAsk.current = 0; setDetections((value) => [...value]); }],
          [<Navigation key="n" className="size-5" />, "Navigation", undefined],
          [<Camera key="p" className="size-5" />, "Take Photo", undefined],
        ]} />
        {tip && (
          <div className="flex items-center gap-2 rounded-control bg-primary-tint px-3 py-2 text-sm font-semibold text-primary">
            Tip: Follow the highlighted path for the safest route.
            <button type="button" aria-label="Dismiss tip" className="ml-auto" onClick={() => setTip(false)}><X className="size-4" /></button>
          </div>
        )}
        <CaptionRegion message={caption} critical={critical} />
      </main>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 08 */

export function LiveVisionScreen() {
  const { speak, speaking, mouthOpenness } = useINAIVoice();
  const [sound, setSound] = useState<SoundEvent | null>(null);
  const { caption, critical } = useDirectiveRouter();
  const line = "I'm monitoring your surroundings. The path ahead is clear.";

  useEffect(() => { void speak(line, "guidance"); }, [speak]);
  useEffect(() => {
    const off = audioEventService.subscribe(setSound);
    audioEventService.start().catch(() => undefined);
    return () => { off(); audioEventService.stop(); };
  }, []);

  return (
    <Page nav={false}>
      <main className="flex-1 space-y-3 px-4 pb-6">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/home" aria-label="Menu"><Menu /></Link></Button>
          <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-extrabold text-primary">Live Monitoring · Environment · Audio · Navigation</span>
          <span className="ml-auto flex">
            <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/sound" aria-label="Sound awareness"><Ear /></Link></Button>
            <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/map" aria-label="Map"><MapPin /></Link></Button>
            <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/settings" aria-label="Settings"><Settings /></Link></Button>
          </span>
        </div>
        <CameraStage height="h-[46vh]" showControls={false}>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-live px-3 py-1 text-xs font-extrabold text-primary-foreground">Path is clear — Continue straight</span>
        </CameraStage>
        <DockedINAI line={line} speaking={speaking} mouth={mouthOpenness} />
        <section className="rounded-card border border-line p-3">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-muted-foreground">
            Audio Event <span className="rounded-full bg-live/15 px-2 py-0.5 text-live">Live</span>
          </p>
          <p className="mt-1 text-sm font-bold">{sound ? sound.label : "Listening for important sounds"}</p>
          {sound && <p className="flex items-center gap-2 text-xs text-muted-foreground">Direction: {sound.direction} · ~{sound.distance} m <ModeBadge mode="MOCK" /></p>}
        </section>
        <section className="rounded-card border border-line p-3">
          <p className="text-xs font-extrabold uppercase text-muted-foreground">Location</p>
          <p className="mt-1 text-sm font-bold">Main corridor · exit about 80 m ahead <ModeBadge mode="MOCK" /></p>
        </section>
        <CaptionRegion message={caption} critical={critical} />
      </main>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 09 */

const radarPositions: Record<SoundEvent["direction"], string> = {
  left: "left-[12%] top-1/2", right: "right-[12%] top-1/2", front: "left-1/2 top-[10%]", back: "left-1/2 bottom-[10%]",
};

function SoundRadar({ events, active }: { events: SoundEvent[]; active?: SoundEvent | undefined }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-80 rounded-full border border-line bg-primary-tint/40" aria-label="Sound radar">
      {[0.75, 0.5, 0.25].map((scale) => (
        <span key={scale} aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line" style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }} />
      ))}
      {(["front", "back", "left", "right"] as const).map((direction) => (
        <span key={direction} aria-hidden="true" className={`absolute text-[10px] font-extrabold uppercase text-muted-foreground ${direction === "front" ? "left-1/2 top-1 -translate-x-1/2" : direction === "back" ? "bottom-1 left-1/2 -translate-x-1/2" : direction === "left" ? "left-1 top-1/2" : "right-1 top-1/2"}`}>{direction}</span>
      ))}
      <span className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2"><INAIAvatar state="listening" size="xs" /></span>
      {events.map((event) => (
        <span key={event.id} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] font-extrabold ${event.id === active?.id ? "animate-pulse bg-danger text-destructive-foreground" : "bg-background text-ink shadow-inai"} ${radarPositions[event.direction]}`}>
          {event.label} · {event.distance} m
        </span>
      ))}
    </div>
  );
}

const seededSounds: SoundEvent[] = [
  { id: "seed-siren", soundClass: "siren", label: "Emergency siren", confidence: 0.8, direction: "left", distance: 20, mock: true, ts: Date.now() },
  { id: "seed-speech", soundClass: "speech", label: "People talking", confidence: 0.6, direction: "front", distance: 8, mock: true, ts: Date.now() },
  { id: "seed-horn", soundClass: "horn", label: "Vehicle", confidence: 0.6, direction: "right", distance: 12, mock: true, ts: Date.now() },
];

export function SoundScreen() {
  const { speak, speaking, mouthOpenness } = useINAIVoice();
  const [events, setEvents] = useState<SoundEvent[]>(seededSounds);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { caption, critical } = useDirectiveRouter();
  const active = events[0];
  const quote = active ? `A ${active.label.toLowerCase()} is coming from your ${active.direction}. It's about ${active.distance} metres away. Please be aware.` : "I'm listening for important sounds around you.";

  useEffect(() => {
    const off = audioEventService.subscribe((event) => setEvents((current) => [event, ...current].slice(0, 4)));
    audioEventService.start().catch(() => setFailed(true));
    return () => { off(); audioEventService.stop(); };
  }, [attempt]);

  useEffect(() => { void speak(quote, "alert"); }, [quote, speak]);

  return (
    <Page>
      <Header title="Sound Awareness" subtitle="INAI listens, understands and helps you stay aware of important sounds around you."
        right={<span className="flex items-center gap-1 rounded-full bg-hearing-tint px-3 py-1 text-xs font-extrabold text-hearing">
          {[0, 1, 2].map((bar) => <motion.span key={bar} className="inline-block w-1 rounded bg-hearing" animate={{ height: [6, 14, 6] }} transition={{ duration: 0.9, repeat: Infinity, delay: bar * 0.15 }} />)}
          Live Listening
        </span>} />
      <main className="flex-1 space-y-4 px-5 pb-24 pt-4">
        {failed ? <ErrorState {...microphoneUnavailableError} onRetry={() => { setFailed(false); setAttempt((v) => v + 1); }} />
          : <SoundRadar events={events} active={active} />}
        <section className="rounded-card border border-line bg-background p-4 shadow-inai">
          <p className="text-xs font-extrabold uppercase text-muted-foreground">INAI heard something</p>
          <p className="mt-1 text-lg font-extrabold">{active?.label ?? "Nothing important yet"}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Direction: {active?.direction ?? "—"} | Distance: Approx. {active?.distance ?? "—"} m <ModeBadge mode="MOCK" />
          </p>
        </section>
        <section className="grid grid-cols-[6rem_1fr] items-center gap-2 rounded-card bg-primary-tint p-3">
          <INAIAvatar state={speaking ? "speaking" : "guiding"} gesture="point_left" mouthOpenness={mouthOpenness} size="xs" />
          <div>
            <p className="text-sm font-semibold text-primary">{quote}</p>
            <Button variant="ghost" className="mt-1 h-9 px-2 text-primary" onClick={() => void speak(quote, "alert")}><Volume2 className="size-4" />Replay</Button>
          </div>
        </section>
        <section>
          <h2 className="text-sm font-extrabold uppercase text-muted-foreground">What you can do</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {["Move left slowly", "Check your surroundings", "Wait if needed", "Tell me more"].map((action) => (
              <Button key={action} variant="outline" className="h-auto min-h-14 rounded-card text-sm font-bold">{action}</Button>
            ))}
          </div>
        </section>
        <Button variant="link" className="w-full">Show All Detected Sounds</Button>
        <CaptionRegion message={caption} critical={critical} />
      </main>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 10 */

export function TranscribeScreen() {
  // Resolved after hydration so the server and first client render agree.
  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(isSpeechRecognitionSupported()); }, []);
  const language = useAccessibilityStore((state) => state.prefs.language);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [meaning, setMeaning] = useState<{ chip: string; explanation: string } | null>(null);
  const summarize = useServerFn(summarizeTranscript);

  useEffect(() => {
    if (!supported) return;
    sttService.language = language;
    const off = sttService.subscribe((text, isFinal) => {
      if (isFinal) { setFinalText(text); setInterim(""); } else setInterim(text);
    });
    sttService.start().catch(() => undefined);
    return () => { off(); sttService.stop(); };
  }, [supported, language]);

  useEffect(() => {
    if (!finalText) return;
    void summarize({ data: { transcript: finalText } }).then(setMeaning).catch(() => { useSessionStore.getState().setServiceHealth("ai", "offline"); });
  }, [finalText, summarize]);

  return (
    <Page>
      <Header title="Live Transcription" subtitle="INAI turns nearby speech into text you can read." />
      <main className="flex-1 space-y-4 px-5 pb-24 pt-3">
        {!supported ? <ErrorState {...unsupportedSpeechError} /> : (
          <div className="relative overflow-hidden rounded-card bg-ink">
            <CameraStage height="h-44" showControls={false}>
              <span className="absolute left-3 top-12 rounded-full bg-background/90 px-2 py-1 text-[11px] font-bold">Person Speaking</span>
              <span className="absolute right-3 top-3 rounded-full bg-hearing px-3 py-1 text-xs font-extrabold text-primary-foreground">Listening…</span>
              <span className="absolute bottom-3 left-3 rounded-full bg-background/90 px-2 py-1 text-[11px] font-bold">1 person detected</span>
              <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2 py-1 text-[11px] font-bold">Location: Main Corridor</span>
            </CameraStage>
          </div>
        )}
        <section className="rounded-card border border-line bg-background p-4 shadow-inai">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-muted-foreground">
            Live Transcription <span className="rounded-full bg-live/15 px-2 text-live">In real time</span> <span className="rounded-full bg-primary-tint px-2 text-primary">Auto detect</span>
          </p>
          <p className="mt-3 text-[26px] font-extrabold leading-snug">
            {finalText ? `“${finalText}”` : <span className="text-muted-foreground">Waiting for someone to speak…</span>}
            {interim && <span className="opacity-60"> {interim}</span>}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Speaker: Unknown · Just now</p>
        </section>
        {meaning?.chip && (
          <section className="rounded-card bg-primary-tint p-4">
            <p className="text-xs font-extrabold uppercase text-primary">Understanding for you</p>
            <span className="mt-2 inline-block rounded-full bg-primary px-3 py-1 text-sm font-extrabold text-primary-foreground">{meaning.chip}</span>
            <p className="mt-2 text-sm font-semibold text-primary">{meaning.explanation}</p>
          </section>
        )}
        <div className="grid grid-cols-2 gap-2">
          {[[Save, "Save Note"], [MapPin, "Show on Map"], [Repeat, "Repeat"], [Languages, "Translate"]].map(([Icon, label]) => {
            const Glyph = Icon as typeof Save;
            return <Button key={String(label)} variant="outline" className="h-auto min-h-14 rounded-card text-sm font-bold"><Glyph className="size-4" />{String(label)}</Button>;
          })}
        </div>
        <Button className="min-h-14 w-full rounded-full text-base font-extrabold">Keep Listening</Button>
        <CaptionRegion message={finalText} />
      </main>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 15 */

interface ChatMessage { id: string; role: "user" | "assistant"; text: string; at: string; evidence?: string[] | undefined }

const suggestions: Array<[string, string]> = [
  ["Help me navigate", "/guidance"], ["What's around me?", "/vision"], ["What is that sound?", "/sound"],
  ["Help me communicate", "/communicate"], ["I need emergency help", "/emergency"], ["More options", ""],
];

export function InaiScreen() {
  const { speak, speaking, mouthOpenness, caption, critical } = useINAIVoice();
  const profile = useAccessibilityStore((state) => state.profile);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const chat = useServerFn(inaiChat);
  const navigate = useNavigate();

  const deepLink = (text: string) => {
    const value = text.toLowerCase();
    if (value.includes("around me")) return "/vision" as const;
    if (value.includes("sound")) return "/sound" as const;
    if (value.includes("communicate")) return "/communicate" as const;
    if (value.includes("emergency")) return "/emergency" as const;
    return null;
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text, at }]);
    setDraft("");
    setBusy(true);
    const target = deepLink(text);
    const world = contextEngine.world;
    try {
      const result = await chat({ data: {
        message: text, profile,
        world: {
          detections: world.detections.map((d) => d.label ?? d.message).slice(0, 5),
          sounds: world.sounds.map((s) => s.label ?? s.message).slice(0, 5),
          transcript: world.transcript,
        },
        history: messages.slice(-8).map((message) => ({ role: message.role, content: message.text })),
      } });
      setMessages((current) => [...current, {
        id: `a-${Date.now()}`, role: "assistant", text: result.reply, at,
        evidence: target === "/vision" ? ["Entrance 10 meters ahead", "Staircase on your left", "Person approaching from your right"] : undefined,
      }]);
      void speak(result.reply, "chat");
    } catch {
      useSessionStore.getState().setServiceHealth("ai", "offline");
      setMessages((current) => [...current, { id: `e-${Date.now()}`, role: "assistant", text: "I couldn't reach my understanding service just now. I'm still here with you.", at }]);
    } finally {
      setBusy(false);
      if (target) void navigate({ to: target });
    }
  };

  const toggleMic = () => {
    if (listening) { sttService.stop(); setListening(false); return; }
    if (!isSpeechRecognitionSupported()) return;
    setListening(true);
    const off = sttService.subscribe((text, isFinal) => {
      setDraft(text);
      if (isFinal) { off(); sttService.stop(); setListening(false); void send(text); }
    });
    sttService.start().catch(() => setListening(false));
  };

  return (
    <Page>
      <Header title="INAI — Your Companion" subtitle="Always by you." />
      <main className="flex flex-1 flex-col px-5 pb-24">
        <section className="mt-2 flex flex-col items-center rounded-card bg-primary-tint p-4">
          <INAIAvatar state={speaking ? "speaking" : busy ? "thinking" : "idle"} mouthOpenness={mouthOpenness} size="md" />
          <h2 className="mt-2 text-xl font-extrabold text-primary">Ask Anything. I'm Here.</h2>
          <span className="mt-1 rounded-full bg-background px-3 py-1 text-xs font-extrabold text-live">● INAI is online — Always ready to help</span>
        </section>
        <div className="mt-4 flex-1 space-y-3" aria-live="polite">
          {messages.map((message) => message.role === "user" ? (
            <div key={message.id} className="ml-auto max-w-[80%] rounded-card rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
              <p className="text-sm font-semibold">{message.text}</p><p className="mt-1 text-right text-[10px] opacity-80">{message.at}</p>
            </div>
          ) : (
            <div key={message.id} className="grid max-w-[90%] grid-cols-[2.5rem_1fr] gap-2">
              <span className="grid size-10 place-items-center rounded-full bg-primary-tint text-primary"><Sparkles className="size-4" /></span>
              <div className="rounded-card rounded-bl-sm border border-line bg-background p-3 shadow-inai">
                <p className="text-sm font-semibold">{message.text}</p>
                {message.evidence && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {message.evidence.map((item) => (
                      <figure key={item} className="rounded-control bg-canvas p-2 text-[10px] font-bold">
                        <ImageIcon className="mx-auto mb-1 size-5 text-primary" aria-hidden="true" />{item}
                      </figure>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-1 text-muted-foreground">
                  <button type="button" aria-label="Helpful"><ThumbsUp className="size-4" /></button>
                  <button type="button" aria-label="Not helpful"><ThumbsDown className="size-4" /></button>
                  <button type="button" aria-label="Replay audio" onClick={() => void speak(message.text, "chat")}><Volume2 className="size-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map(([label]) => (
            <button key={label} type="button" onClick={() => void send(label)} className="min-h-10 rounded-full border border-line px-3 text-sm font-bold">{label}</button>
          ))}
        </div>
        <form className="mt-3 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
          <Button type="button" size="icon" variant={listening ? "default" : "outline"} className="size-12 shrink-0 rounded-full" aria-pressed={listening} aria-label="Push to talk" onClick={toggleMic}><Mic /></Button>
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask INAI anything" className="min-h-12 rounded-full" />
          <Button type="submit" size="icon" className="size-12 shrink-0 rounded-full" aria-label="Send"><Send /></Button>
        </form>
        <CaptionRegion message={caption} critical={critical} />
      </main>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 16 */

const guidanceSteps: Array<{ line: string; gesture: string }> = [
  { line: "The path is clear ahead. Keep walking at your own pace.", gesture: "open_palms" },
  { line: "There is a staircase about three metres on your left. Please slow down.", gesture: "stop_palm" },
  { line: "Move slightly to your right and continue.", gesture: "point_right" },
];

export function GuidanceScreen() {
  const { speak, speaking, mouthOpenness, caption, critical } = useINAIVoice();
  const [step, setStep] = useState(0);
  const current = guidanceSteps[step] ?? guidanceSteps[0]!;

  useEffect(() => { void speak(current.line, "guidance"); }, [current.line, speak]);

  return (
    <Page nav={false}>
      <main className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 opacity-45"><CameraStage height="h-full" showControls={false} /></div>
        <div className="relative flex h-full flex-col justify-between p-4">
          <div className="flex items-start">
            <Button asChild variant="secondary" className="rounded-full"><Link to="/home"><X className="size-4" />Exit</Link></Button>
            <span className="ml-auto flex flex-col items-end gap-1">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground">{speaking ? "INAI Speaking" : "INAI Ready"}</span>
              <span className="rounded-full bg-background px-3 py-1 text-xs font-extrabold text-primary">Guidance Mode</span>
            </span>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-40 shrink-0"><INAIAvatar state={speaking ? "speaking" : "guiding"} gesture={current.gesture} mouthOpenness={mouthOpenness} size="lg" /></div>
            <div className="flex-1">
              <div className="rounded-card bg-background/95 p-3 text-sm font-semibold shadow-inai">{current.line}</div>
              <h2 className="mt-3 text-2xl font-extrabold text-background drop-shadow">You're not alone.</h2>
              <p className="text-sm font-semibold text-background/90 drop-shadow">INAI guides you, step by step.</p>
            </div>
            <div className="flex w-28 shrink-0 flex-col gap-1 text-[11px] font-bold">
              {["Staircase", "Staircase ~3 m", "People on right", "Path clear ahead"].map((chip) => (
                <span key={chip} className="rounded-full bg-background/90 px-2 py-1 text-center">{chip}</span>
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-3">
            <section className="rounded-card bg-background p-4 shadow-inai">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-lg font-extrabold leading-snug">{current.line}</p>
                <Button size="icon" variant="ghost" aria-label="Replay guidance" onClick={() => void speak(current.line, "guidance")}><Volume2 /></Button>
              </div>
              <div className="mt-3 flex justify-center gap-2" aria-label={`Step ${step + 1} of ${guidanceSteps.length}`}>
                {guidanceSteps.map((item, index) => <span key={item.line} className={`size-2 rounded-full ${index === step ? "bg-primary" : "bg-line"}`} />)}
              </div>
            </section>
            <ActionRow actions={[
              [<Compass key="w" className="size-5" />, "Where am I?", () => void speak("You are in the main corridor, near the east entrance.", "guidance")],
              [<Eye key="a" className="size-5" />, "What's ahead?", () => setStep((value) => (value + 1) % guidanceSteps.length)],
              [<Repeat key="r" className="size-5" />, "Repeat that", () => void speak(current.line, "guidance")],
            ]} />
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="secondary" className="min-h-12 rounded-full text-xs font-extrabold"><Link to="/vision/live"><Camera className="size-4" />Show Camera</Link></Button>
              <Button asChild className="min-h-12 rounded-full text-xs font-extrabold"><Link to="/inai"><MessageCircle className="size-4" />Talk to INAI</Link></Button>
              <Button asChild variant="destructive" className="min-h-12 rounded-full text-xs font-extrabold"><Link to="/emergency"><ShieldAlert className="size-4" />Emergency</Link></Button>
            </div>
          </div>
        </div>
        <CaptionRegion message={caption} critical={critical} />
      </main>
    </Page>
  );
}

export { AnimatePresence };
