import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bell, BookOpen, Check, ChevronLeft, ChevronRight,
  Cross, Ear, Eye, HandHeart, HeartHandshake, Home, Info, Languages, MapPin, MessageCircle,
  Navigation, Pause, Play, RotateCcw, Share2, ShieldAlert, Sparkles, Siren, Trash2, Type,
  Volume2, Waves, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { AppShell, ScreenHeader } from "@/components/layout/primitives";
import { INAIAvatar } from "@/components/inai/INAIAvatar";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { useSessionStore } from "@/stores/session-store";
import { BrowserTTSService } from "@/services/tts";
import { hapticService } from "@/services/haptics";
import { signService, SIGN_SOURCE, type SignPhrase } from "@/services/sign-language";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { dispatchEmergencyAlert, saveSecurityEmail, type DispatchResult } from "@/lib/inai/emergency.functions";

const tts = new BrowserTTSService();
const footer = <p className="py-5 text-center text-[10px] font-bold uppercase tracking-[.25em] text-muted-foreground">People · Access · Opportunities · Together</p>;

function ScriptNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p aria-hidden="true" className={`pointer-events-none absolute rotate-[-6deg] font-hand text-xl text-[#9BB4E8] ${className}`}>{children}</p>;
}

function DeviceBar() {
  return <div aria-hidden="true" className="flex h-10 items-center justify-between px-6 text-sm font-extrabold"><span>9:41</span><span className="flex items-center gap-1">▮▮▮ ◉ ▰</span></div>;
}

function PageFrame({ children, nav = false }: { children: ReactNode; nav?: boolean }) {
  const aiState = useSessionStore((s) => s.serviceHealth["ai"]);
  const aiDown = aiState === "offline" || aiState === "degraded";
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return (
    <AppShell nav={nav ? <BottomNavigation /> : false}>
      <DeviceBar />
      {aiDown && (
        <div role="status" className="mx-5 mb-2 rounded-control bg-warn/15 px-4 py-3 text-sm font-semibold text-warn">
          INAI’s smart understanding is offline. Core features still work.
        </div>
      )}
      {children}
    </AppShell>
  );
}

/** Press-and-hold with a tap fallback; keyboard Space/Enter taps. */
function useLongPress(onLong: () => void, onTap: () => void, ms = 600) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = useCallback(() => {
    fired.current = false;
    timer.current = window.setTimeout(() => { fired.current = true; onLong(); }, ms);
  }, [onLong, ms]);
  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const tap = useCallback(() => { cancel(); if (!fired.current) onTap(); }, [cancel, onTap]);
  return {
    onPointerDown: start, onPointerUp: tap, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onKeyDown: (event: React.KeyboardEvent) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); tap(); } },
  };
}

// ---------------------------------------------------------------- Screen 11

const QUICK_PHRASES = ["I need help", "Where is the restroom?", "Can you repeat that?", "Thank you", "I'm fine", "I don't understand", "Please be patient"];
type PhraseStat = { phrase: string; use_count: number; favourite: boolean };

export function CommunicateScreen() {
  const [mode, setMode] = useState<"speak" | "type" | "sign">("speak");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [stats, setStats] = useState<Record<string, PhraseStat>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("quick_phrase_stats").select("phrase,use_count,favourite")
      .then(({ data }) => {
        const map: Record<string, PhraseStat> = {};
        for (const row of data ?? []) map[row.phrase] = row;
        setStats(map);
      });
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const sortedPhrases = useMemo(() => {
    return [...QUICK_PHRASES].sort((a, b) => {
      const sa = stats[a]; const sb = stats[b];
      if ((sb?.favourite ? 1 : 0) !== (sa?.favourite ? 1 : 0)) return (sb?.favourite ? 1 : 0) - (sa?.favourite ? 1 : 0);
      if ((sb?.use_count ?? 0) !== (sa?.use_count ?? 0)) return (sb?.use_count ?? 0) - (sa?.use_count ?? 0);
      return QUICK_PHRASES.indexOf(a) - QUICK_PHRASES.indexOf(b);
    });
  }, [stats]);

  const persist = useCallback(async (phrase: string, patch: Partial<PhraseStat>) => {
    const current = stats[phrase] ?? { phrase, use_count: 0, favourite: false };
    const next: PhraseStat = { ...current, ...patch };
    setStats((prev) => ({ ...prev, [phrase]: next }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("quick_phrase_stats").upsert(
      { user_id: user.id, phrase, use_count: next.use_count, favourite: next.favourite, last_used: new Date().toISOString() },
      { onConflict: "user_id,phrase" },
    );
  }, [stats]);

  const speak = useCallback(async (line: string) => {
    setSpeaking(true);
    try { await tts.speak(line, { priority: "alert", interrupt: true }); }
    finally { setSpeaking(false); }
  }, []);

  const usePhrase = useCallback((phrase: string) => {
    void persist(phrase, { use_count: (stats[phrase]?.use_count ?? 0) + 1 });
    setText(phrase);
    void speak(phrase);
  }, [persist, stats, speak]);

  const longPressFor = useCallback((phrase: string) => useLongPress(
    () => {
      const fav = !stats[phrase]?.favourite;
      void persist(phrase, { favourite: fav });
      hapticService.pulse("notice");
      showToast(fav ? `“${phrase}” added to favourites` : `“${phrase}” removed from favourites`);
    },
    () => usePhrase(phrase),
  ), [persist, showToast, stats, usePhrase]);

  const modes = [
    { id: "speak" as const, icon: Volume2, label: "Speak", hint: "Let INAI speak for you" },
    { id: "type" as const, icon: Type, label: "Type", hint: "Write what you want to say" },
    { id: "sign" as const, icon: HeartHandshake, label: "Sign", hint: "Use sign language gestures" },
  ];

  return (
    <PageFrame nav>
      <ScreenHeader title="Communication Assistant" subtitle="Your voice, in every way." icon={MessageCircle} backTo="/home" />
      <div className="relative flex-1 px-5 pb-6">
        <ScriptNote className="right-4 top-1">Different Ways, Same Voice.</ScriptNote>
        <h2 className="pt-2 text-3xl font-extrabold text-ink">Express Yourself</h2>
        <p className="mt-1 text-muted-foreground">Type, speak or use sign language. INAI will help you communicate.</p>

        <div className="mt-4 grid grid-cols-[1fr_9rem] items-start gap-2">
          <div className="relative">
            <div className="rounded-card border border-primary/10 bg-primary-tint p-4 shadow-inai">
              <p className="font-semibold leading-snug text-ink">I’m INAI. I’ll help you communicate with others.</p>
            </div>
            <span className="mt-2 inline-flex rounded-full bg-primary-tint px-3 py-1 text-xs font-bold text-primary">Communication has no barriers</span>
          </div>
          <INAIAvatar state="guiding" size="sm" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Communication mode">
          {modes.map(({ id, icon: Icon, label, hint }) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`min-h-24 rounded-control border p-3 text-center transition ${mode === id ? "border-primary bg-primary text-primary-foreground shadow-inai" : "border-line bg-background text-ink"}`}
            >
              <Icon className="mx-auto size-6" />
              <span className="mt-2 block text-sm font-extrabold">{label}</span>
              <span className={`mt-1 block text-[10px] leading-tight ${mode === id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{hint}</span>
            </button>
          ))}
        </div>

        {mode === "sign" ? (
          <div className="mt-5 rounded-card bg-primary-tint p-6 text-center shadow-inai">
            <HeartHandshake className="mx-auto size-12 text-primary" />
            <h2 className="mt-3 text-xl font-extrabold text-ink">INAI Sign Communication</h2>
            <p className="mt-2 text-muted-foreground">Reviewed Indian Sign Language phrases, shown step by step.</p>
            <Button asChild className="mt-4 w-full rounded-full">
              <Link to="/communicate/sign">Open Sign Communication <ArrowRight className="ml-1" /></Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-card border border-line bg-background p-4 shadow-inai">
              <label htmlFor="say-text" className="text-sm font-bold text-ink">Type what you want to say</label>
              <textarea
                id="say-text"
                maxLength={200}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Write your message here…"
                className="mt-2 min-h-32 w-full resize-none bg-transparent text-xl outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setText("")}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted-foreground"
                  disabled={!text}
                >
                  Clear
                </button>
                <span className="text-xs text-muted-foreground">{text.length}/200</span>
              </div>
            </div>
            <Button
              className="mt-4 w-full rounded-full"
              disabled={!text.trim() || speaking}
              onClick={() => { setPreview(text); void speak(text); }}
            >
              <Volume2 />{speaking ? "INAI is speaking…" : "Let INAI Speak"}
            </Button>

            {preview && (
              <div className="mt-4 rounded-card border border-primary/10 bg-primary-tint p-4 shadow-inai">
                <div className="flex items-center gap-2 font-extrabold text-primary"><Waves className="size-5" /> INAI will say:</div>
                <p className="mt-2 text-lg font-semibold text-ink">“{preview}”</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="rounded-full" onClick={() => void speak(preview)}><Play /> Play</Button>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setPreview(null); setText(preview); }}>Try Again</Button>
                </div>
              </div>
            )}

            <div aria-live="polite" className={`mt-3 rounded-control bg-ink px-4 py-3 text-center text-2xl font-bold text-background transition ${speaking ? "opacity-100" : "pointer-events-none h-0 overflow-hidden py-0 opacity-0"}`}>
              {preview ?? text}
            </div>
          </>
        )}

        <h2 className="mt-6 font-extrabold text-ink">Quick Phrases</h2>
        <p className="text-xs text-muted-foreground">Tap to speak. Press and hold to favourite.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sortedPhrases.map((phrase) => {
            const fav = stats[phrase]?.favourite;
            return (
              <button
                key={phrase}
                {...longPressFor(phrase)}
                aria-label={`${phrase}${fav ? " (favourite)" : ""}`}
                className={`min-h-12 rounded-full border px-4 font-semibold transition ${fav ? "border-primary bg-primary text-primary-foreground" : "border-primary/20 bg-primary-tint text-primary"}`}
              >
                {fav ? "★ " : ""}{phrase}
              </button>
            );
          })}
          <Link to="/communicate/sign" className="flex min-h-12 items-center rounded-full border border-line px-4 py-3 font-semibold text-ink">View All</Link>
        </div>
        {toast && <div role="status" className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-background shadow-inai">{toast}</div>}
      </div>
    </PageFrame>
  );
}

// ---------------------------------------------------------------- Screen 12

function StepThumb({ phrase, order, failed, onFail }: { phrase: SignPhrase; order: number; failed: boolean; onFail: () => void }) {
  const ref = useRef<HTMLImageElement | null>(null);
  const step = phrase.steps[order - 1];
  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    const check = () => { if (img.naturalWidth === 0) onFail(); };
    if (img.complete) check();
    else { img.addEventListener("error", check); img.addEventListener("load", check); }
    return () => { img.removeEventListener("error", check); img.removeEventListener("load", check); };
  }, [onFail, phrase.id, order]);
  if (failed || !step?.assetUrl) return <HeartHandshake aria-hidden="true" className="mx-auto size-14 text-primary" />;
  return (
    <img
      ref={ref}
      src={step.assetUrl}
      alt={`Step ${order} illustration: ${step.description}`}
      className="mx-auto size-20 object-contain"
    />
  );
}

export function SignScreen() {
  const phrases = signService.demoPhrases();
  const [selectedId, setSelectedId] = useState("medical_help");
  const phrase = phrases.find((entry) => entry.id === selectedId) ?? phrases[0]!;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const [infoOpen, setInfoOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const animSpeed = useAccessibilityStore((s) => s.inai.animationSpeed);
  const setINAISetting = useAccessibilityStore((s) => s.setINAISetting);
  const signRows = useRef<{ id: string; phrase: string }[]>([]);
  const savedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    supabase.from("sign_phrases").select("id,phrase").then(({ data }) => { signRows.current = data ?? []; });
    supabase.from("saved_phrases").select("phrase_id").then(({ data }) => {
      savedIds.current = new Set((data ?? []).map((row) => row.phrase_id));
      const row = signRows.current.find((entry) => entry.phrase === phrase.text);
      if (row) setSaved(savedIds.current.has(row.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setStep(0); setPlaying(false); }, [selectedId]);

  useEffect(() => {
    if (!playing || !phrase) return;
    const interval = window.setInterval(() => {
      setStep((current) => (current + 1 >= phrase.steps.length ? 0 : current + 1));
    }, (phrase.steps[0]?.durationMs ?? 900) / animSpeed);
    return () => window.clearInterval(interval);
  }, [playing, animSpeed, phrase]);

  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };

  const saveFavorite = async () => {
    const row = signRows.current.find((entry) => entry.phrase === phrase.text);
    if (!row) { showToast("Saved phrases need the phrase list — try again in a moment."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast("Sign in is needed to save favourites."); return; }
    const { error } = await supabase.from("saved_phrases").upsert(
      { user_id: user.id, phrase_id: row.id },
      { onConflict: "user_id,phrase_id" },
    );
    if (!error) { savedIds.current.add(row.id); setSaved(true); hapticService.pulse("notice"); showToast("Saved to favourites"); }
    else showToast("Could not save right now. Please try again.");
  };

  const speakPhrase = () => { void tts.speak(phrase.text, { priority: "alert", interrupt: true }); };

  const currentStep = phrase.steps[step];

  return (
    <PageFrame nav>
      <ScreenHeader title="INAI Sign Communication" subtitle="Same Message. More Ways." icon={HeartHandshake} backTo="/communicate" />
      <div className="flex-1 px-5 pb-6">
        <h2 className="pt-2 text-3xl font-extrabold text-ink">Communication Without Limits</h2>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="flex-1 rounded-card border border-primary/10 bg-primary-tint p-4 shadow-inai">
            <p className="font-semibold leading-snug text-ink">INAI is showing the sign for: “{phrase.text}.”</p>
            <p className="mt-2 text-xs text-muted-foreground">You can also let INAI speak it for you.</p>
          </div>
          <INAIAvatar state="signing" size="sm" signSequence={phrase.steps.map((entry) => entry.gloss)} />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-control bg-primary-tint px-4 py-3">
          <span className="flex items-center gap-2 font-extrabold text-primary"><Languages className="size-5" /> ISL — Indian Sign Language</span>
          <button type="button" onClick={() => setInfoOpen(true)} aria-label="About the sign reference" className="grid size-11 place-items-center rounded-full bg-background text-primary">
            <Info className="size-5" />
          </button>
        </div>

        <h2 className="mt-5 font-extrabold text-ink">Select a phrase</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {phrases.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
              aria-pressed={entry.id === selectedId}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${entry.id === selectedId ? "border-primary bg-primary text-primary-foreground" : "border-line bg-background text-ink"}`}
            >
              {entry.text}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-card border border-line bg-background p-4 shadow-inai">
          <div className="flex items-center gap-2">
            {phrase.category === "emergency" && <Cross aria-hidden="true" className="size-5 text-speech" />}
            <h3 className="text-lg font-extrabold text-ink">{phrase.text}</h3>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            {phrase.steps.map((entry, index) => (
              <button
                key={entry.order}
                onClick={() => { setStep(index); setPlaying(false); }}
                aria-current={step === index}
                className={`min-h-52 rounded-control border p-3 text-left ${step === index ? "border-primary bg-primary-tint" : "border-line"}`}
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{entry.order}</span>
                <StepThumb
                  phrase={phrase}
                  order={entry.order}
                  failed={!!failedThumbs[`${phrase.id}-${entry.order}`]}
                  onFail={() => setFailedThumbs((prev) => ({ ...prev, [`${phrase.id}-${entry.order}`]: true }))}
                />
                <p className="mt-2 text-xs font-semibold leading-snug text-ink">{entry.order} {entry.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="icon" className="min-h-11 min-w-11 rounded-full" onClick={() => setStep((step - 1 + phrase.steps.length) % phrase.steps.length)} aria-label="Previous step">
              <ChevronLeft />
            </Button>
            <strong className="text-sm text-ink">Step {step + 1} of {phrase.steps.length}</strong>
            <Button variant="outline" size="icon" className="min-h-11 min-w-11 rounded-full" onClick={() => setStep((step + 1) % phrase.steps.length)} aria-label="Next step">
              <ChevronRight />
            </Button>
          </div>

          <p className="mt-3 rounded-control bg-canvas p-3 text-sm text-muted-foreground">
            <span className="font-bold text-ink">Text alternative: </span>{currentStep?.description}. Full sequence: {phrase.steps.map((entry) => entry.description).join(" → ")}.
          </p>
        </div>

        <Button className="mt-4 w-full rounded-full" onClick={() => { setPlaying(!playing); hapticService.pulse("notice"); }}>
          {playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play Full Animation"}
        </Button>
        <p className="mt-1 text-center text-xs text-muted-foreground">INAI will sign the complete phrase</p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="outline" className="rounded-full" onClick={() => { setStep(0); setPlaying(true); }}><RotateCcw /> Replay</Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => setINAISetting("animationSpeed", animSpeed === 1 ? 0.5 : 1)}
          >
            {animSpeed}x Speed
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="outline" className="rounded-full" onClick={speakPhrase}><Volume2 /> Speak it</Button>
          <Button variant="outline" className="rounded-full" onClick={() => void saveFavorite()} disabled={saved}>
            <HeartHandshake />{saved ? "Saved" : "Save to Favorites"}
          </Button>
        </div>

        {toast && <div role="status" className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-background shadow-inai">{toast}</div>}

        {infoOpen && (
          <div role="dialog" aria-modal="true" aria-label="About the sign reference" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6" onClick={() => setInfoOpen(false)}>
            <div className="w-full max-w-sm rounded-card bg-background p-5 shadow-inai" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-ink">About the sign reference</h3>
                <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Close" onClick={() => setInfoOpen(false)}><X /></Button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                INAI’s signs reference Indian Sign Language (ISL). Only validated phrases are shown —
                each one is checked against reviewed ISL reference material before it appears here.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Source: {SIGN_SOURCE}</p>
            </div>
          </div>
        )}
      </div>
    </PageFrame>
  );
}

// ---------------------------------------------------------------- Screen 13

type Place = { id: string; name: string; category: string; latitude: number | null; longitude: number | null; accessibility: Record<string, unknown> };
const CAMPUS = { lat: 8.1817, lng: 77.4152 };
const FILTERS: { label: string; category: string | null }[] = [
  { label: "All", category: null },
  { label: "Hospital", category: "hospital" },
  { label: "Exit", category: "exit" },
  { label: "Restroom", category: "restroom" },
  { label: "Emergency", category: "emergency" },
];
const PIN_COLORS: Record<string, string> = { exit: "#16A34A", hospital: "#E5342B", restroom: "#2F6BED", emergency: "#E5342B" };

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000; const dLat = (b.lat - a.lat) * Math.PI / 180; const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const ROUTE_STEPS = [
  "Head along the main walkway toward the notice board.",
  "Turn right and follow the covered corridor.",
  "The accessible exit is on your left, with ramp access.",
];

export function MapScreen() {
  const [filter, setFilter] = useState("All");
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesError, setPlacesError] = useState(false);
  const [userPos, setUserPos] = useState({ lat: CAMPUS.lat, lng: CAMPUS.lng });
  const [askPermission, setAskPermission] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const mapBox = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<{ L: typeof import("leaflet"); map: import("leaflet").Map } | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const permission = useSessionStore((s) => s.permissions.location);
  const setPermission = useSessionStore((s) => s.setPermission);
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    supabase.from("accessible_places").select("id,name,category,latitude,longitude,accessibility")
      .then(({ data, error }) => { if (error) setPlacesError(true); setPlaces((data ?? []) as Place[]); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapBox.current || leafletRef.current) return;
      const map = L.map(mapBox.current, { center: [CAMPUS.lat, CAMPUS.lng], zoom: 17, zoomControl: false, scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" })
        .addTo(map);
      map.getContainer().style.filter = "saturate(0.85) brightness(1.03)";
      leafletRef.current = { L, map };
      setMapReady(true);
    })();
    return () => { cancelled = true; leafletRef.current?.map.remove(); leafletRef.current = null; layerRef.current = null; };
  }, []);

  const nearestExit = useMemo(() => {
    const exits = places.filter((place) => place.category === "exit" && place.latitude != null && place.longitude != null);
    return exits.sort((a, b) => haversine(userPos, { lat: a.latitude!, lng: a.longitude! }) - haversine(userPos, { lat: b.latitude!, lng: b.longitude! }))[0] ?? null;
  }, [places, userPos]);

  useEffect(() => {
    const entry = leafletRef.current;
    if (!entry || !mapReady) return;
    const { L, map } = entry;
    if (layerRef.current) layerRef.current.remove();
    const group = L.layerGroup().addTo(map);

    L.circleMarker([userPos.lat, userPos.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#2F6BED", fillOpacity: 1 })
      .bindPopup("You are here").addTo(group);

    if (nearestExit?.latitude != null && nearestExit.longitude != null) {
      L.polyline([[userPos.lat, userPos.lng], [nearestExit.latitude, nearestExit.longitude]], { color: "#2F6BED", weight: 3, dashArray: "2 8" }).addTo(group);
    }

    const visible = places.filter((place) => {
      if (filter !== "All" && place.category !== FILTERS.find((f) => f.label === filter)?.category) return false;
      return place.latitude != null && place.longitude != null;
    });
    for (const place of visible) {
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:${PIN_COLORS[place.category] ?? "#2F6BED"};color:#fff;border:3px solid #fff;box-shadow:0 4px 12px rgba(16,24,40,.25);font-size:14px">${place.category === "exit" ? "→" : place.category === "restroom" ? "WC" : place.category === "hospital" ? "+" : "!"}</span>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      L.marker([place.latitude!, place.longitude!], { icon })
        .bindPopup(`<strong>${place.name}</strong><br/><span style="text-transform:capitalize">${place.category}</span> · ${haversine(userPos, { lat: place.latitude!, lng: place.longitude! })} m`)
        .on("click", () => setSelected(place))
        .addTo(group);
    }
    layerRef.current = group;
  }, [places, filter, userPos, nearestExit, mapReady, places]);

  const locate = () => {
    if (permission === "denied") { showToast("Location is off. Allow it in your browser settings, then try again."); return; }
    if (permission === "prompt") { setAskPermission(true); return; }
    requestLocation();
  };

  const requestLocation = () => {
    setAskPermission(false);
    if (!("geolocation" in navigator)) { setPermission("location", "unavailable"); showToast("Location isn’t available on this device."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPermission("location", "granted");
        setUserPos({ lat: position.coords.latitude, lng: position.coords.longitude });
        leafletRef.current?.map.setView([position.coords.latitude, position.coords.longitude], 18);
        showToast("Centered on your location");
      },
      () => { setPermission("location", "denied"); showToast("Location is off. You can still browse campus places."); },
      { timeout: 8000 },
    );
  };

  const results = useMemo(() => (["exit", "restroom", "hospital"] as const).map((category) => {
    const candidates = places.filter((place) => place.category === category && place.latitude != null && place.longitude != null);
    const best = candidates.sort((a, b) => haversine(userPos, { lat: a.latitude!, lng: a.longitude! }) - haversine(userPos, { lat: b.latitude!, lng: b.longitude! }))[0];
    return best ? { category, place: best, distance: haversine(userPos, { lat: best.latitude!, lng: best.longitude! }) } : null;
  }).filter(Boolean) as { category: "exit" | "restroom" | "hospital"; place: Place; distance: number }[], [places, userPos]);

  const speakStep = (index: number) => {
    void tts.speak(`Step ${index + 1}. ${ROUTE_STEPS[index]}`, { priority: "guidance", interrupt: true });
  };

  const labels = { exit: "Nearest Exit", restroom: "Accessible Restroom", hospital: "Nearest Hospital" } as const;

  return (
    <PageFrame nav>
      <ScreenHeader
        title="Accessible Map" subtitle="Navigate. Explore. Move Freely." icon={MapPin} backTo="/home"
        right={
          <div className="flex gap-1">
            <button type="button" onClick={locate} aria-label="Find my location" className="grid size-12 place-items-center rounded-full bg-primary-tint text-primary"><Navigation className="size-5" /></button>
            <Link to="/settings" aria-label="Settings" className="grid size-12 place-items-center rounded-full bg-primary-tint text-primary"><Info className="size-5" /></Link>
          </div>
        }
      />
      <div className="flex-1 px-5 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-ink">Find Your Way</h2>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-bold text-muted-foreground">SKCET Campus</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Discover nearby accessible places and get step-by-step guidance.</p>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {FILTERS.map((entry) => (
            <button
              key={entry.label}
              onClick={() => setFilter(entry.label)}
              aria-pressed={filter === entry.label}
              className={`min-h-11 shrink-0 rounded-full px-4 font-semibold ${filter === entry.label ? "bg-primary text-primary-foreground" : "bg-canvas text-ink"}`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="relative mt-2 h-80 overflow-hidden rounded-card border border-line shadow-inai" role="application" aria-label="Campus map with accessible places">
          <div ref={mapBox} className="size-full" />
          <span aria-hidden="true" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-background font-extrabold text-primary shadow-inai">N↑</span>
          <div className="absolute bottom-3 right-3 flex flex-col gap-2">
            <button type="button" aria-label="Zoom in" onClick={() => leafletRef.current?.map.zoomIn()} className="grid size-11 place-items-center rounded-full bg-background font-extrabold text-ink shadow-inai">+</button>
            <button type="button" aria-label="Zoom out" onClick={() => leafletRef.current?.map.zoomOut()} className="grid size-11 place-items-center rounded-full bg-background font-extrabold text-ink shadow-inai">−</button>
            <button type="button" aria-label="Recenter on campus" onClick={() => { leafletRef.current?.map.setView([CAMPUS.lat, CAMPUS.lng], 17); setUserPos(CAMPUS); }} className="grid size-11 place-items-center rounded-full bg-background text-primary shadow-inai"><Navigation className="size-5" /></button>
          </div>
        </div>

        {placesError && (
          <p className="mt-3 rounded-control bg-warn/15 p-3 text-sm font-semibold text-warn">
            Saved places couldn’t load. The map still works with your current view.
          </p>
        )}

        {selected && (
          <div className="mt-3 rounded-control border border-line bg-background p-4 shadow-inai" role="status">
            <div className="flex items-center justify-between">
              <strong className="text-ink">{selected.name}</strong>
              <button type="button" aria-label="Close place details" onClick={() => setSelected(null)} className="grid size-9 place-items-center rounded-full bg-canvas text-ink"><X className="size-4" /></button>
            </div>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {selected.category} · {selected.latitude != null ? haversine(userPos, { lat: selected.latitude, lng: selected.longitude! }) : "?"} m
              {(selected.category === "restroom" || selected.category === "hospital") && <span className="ml-2 rounded bg-warn/15 px-2 py-0.5 text-[10px] font-bold text-warn">MOCK</span>}
            </p>
            <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={() => void tts.speak(`Guiding you to ${selected.name}, about ${selected.latitude != null ? haversine(userPos, { lat: selected.latitude, lng: selected.longitude! }) : "some"} meters away.`, { priority: "guidance" })}>
              <Volume2 /> Audio directions
            </Button>
          </div>
        )}

        <div className="mt-3 grid grid-cols-[1fr_9rem] items-end gap-2">
          <div className="rounded-card border border-primary/10 bg-primary-tint p-4 shadow-inai">
            <p className="flex items-start gap-2 font-semibold leading-snug text-ink"><Sparkles aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
              The nearest accessible exit is {nearestExit ? haversine(userPos, { lat: nearestExit.latitude!, lng: nearestExit.longitude! }) : 80} meters ahead. Turn right and follow the path.
            </p>
            <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={() => void tts.speak(`The nearest accessible exit is ${nearestExit ? haversine(userPos, { lat: nearestExit.latitude!, lng: nearestExit.longitude! }) : 80} meters ahead. Turn right and follow the path.`, { priority: "guidance" })}>
              <Volume2 /> Speak
            </Button>
          </div>
          <INAIAvatar state="guiding" size="xs" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {results.map(({ category, place, distance }) => (
            <div key={place.id} className="rounded-control border border-line bg-background p-4 shadow-inai">
              <MapPin className={category === "exit" ? "text-hearing" : "text-primary"} />
              <strong className="mt-2 block text-ink">{labels[category]} · {distance} m</strong>
              <span className="text-xs text-muted-foreground">{place.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Button className="rounded-full" onClick={() => { setNavigating(true); setStepIndex(0); speakStep(0); showToast("Navigation started — follow the spoken steps"); }}>
            <Navigation /> Start Navigation
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => { setShowSteps(false); speakStep(stepIndex); }}>
            <Volume2 /> Get Audio Directions
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => setShowSteps(!showSteps)}>
            <BookOpen /> View Route Steps
          </Button>
        </div>

        {(showSteps || navigating) && (
          <div className="mt-4 rounded-card border border-line bg-background p-4 shadow-inai">
            {navigating && (
              <div className="mb-3 flex items-center justify-between">
                <Button variant="outline" size="sm" className="rounded-full" disabled={stepIndex === 0} onClick={() => { const next = stepIndex - 1; setStepIndex(next); speakStep(next); }}>
                  <ChevronLeft /> Previous
                </Button>
                <strong className="text-sm text-ink">Step {stepIndex + 1} of {ROUTE_STEPS.length}</strong>
                <Button variant="outline" size="sm" className="rounded-full" disabled={stepIndex === ROUTE_STEPS.length - 1} onClick={() => { const next = stepIndex + 1; setStepIndex(next); speakStep(next); }}>
                  Next <ChevronRight />
                </Button>
              </div>
            )}
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
              {ROUTE_STEPS.map((text, index) => (
                <li key={text} className={navigating && index === stepIndex ? "font-bold" : ""}>{text}</li>
              ))}
            </ol>
          </div>
        )}
        {toast && <div role="status" className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-background shadow-inai">{toast}</div>}
      </div>
    </PageFrame>
  );
}

// ---------------------------------------------------------------- Screen 14

const DEFAULT_LOCATION = "SKCET, Main Block";

/** Asks the browser for a real position; falls back quietly when refused. */
function getPosition(): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000 },
    );
  });
}
const HELP_PHRASES = ["I cannot speak", "I need medical help", "Please call my emergency contact"];

export function EmergencyScreen() {
  const HOLD_MS = 3000;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [activated, setActivated] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [dispatch, setDispatch] = useState<DispatchResult | null>(null);
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const begun = useRef(0);
  const tick = useRef<number | undefined>(undefined);
  const lastSpoken = useRef(0);
  const profile = useAccessibilityStore((s) => s.profile);
  const sendAlert = useServerFn(dispatchEmergencyAlert);
  const saveEmail = useServerFn(saveSecurityEmail);
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };

  const timeline = useMemo(() => [
    { label: "Emergency detected", detail: "Just now" },
    {
      label: "Location shared",
      detail: position ? `${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}` : DEFAULT_LOCATION,
    },
    {
      label: dispatch?.dispatched ? "Campus security emailed" : "Campus security not reached",
      detail: dispatch ? dispatch.reason : "Sending the alert…",
    },
    { label: "INAI is guiding you", detail: "Stay calm and stay where you are" },
  ], [dispatch, position]);

  const clearHold = useCallback(() => {
    if (tick.current) window.clearInterval(tick.current);
    tick.current = undefined;
    setHolding(false);
  }, []);

  const activate = useCallback(() => {
    clearHold();
    setProgress(1);
    setActivated(true);
    setRevealed(0);
    setDispatch(null);
    hapticService.pattern([200, 100, 200, 100, 200]);
    void tts.speak("Help has been requested. Stay where you are. You are safe, and I'm with you.", { priority: "emergency", interrupt: true });
    [0, 1, 2, 3].forEach((index) => window.setTimeout(() => setRevealed(index + 1), 700 * (index + 1)));
    void (async () => {
      const where = await getPosition();
      setPosition(where);
      try {
        const result = await sendAlert({ data: {
          location: DEFAULT_LOCATION,
          latitude: where?.latitude ?? null,
          longitude: where?.longitude ?? null,
          needs: { visual: profile.visual, hearing: profile.hearing, speech: profile.speech },
          note: "",
        } });
        setDispatch(result);
        void tts.speak(result.reason, { priority: "emergency" });
      } catch {
        setDispatch({ dispatched: false, to: null, reason: "The alert could not be sent. Please call for help directly." });
      }
    })();
  }, [clearHold, profile.hearing, profile.speech, profile.visual, sendAlert]);

  const startHold = useCallback(() => {
    if (activated || holding) return;
    setHolding(true);
    setProgress(0);
    begun.current = Date.now();
    lastSpoken.current = 3;
    hapticService.pattern([40]);
    tick.current = window.setInterval(() => {
      const elapsed = Date.now() - begun.current;
      const fraction = Math.min(1, elapsed / HOLD_MS);
      setProgress(fraction);
      const remaining = Math.ceil(3 - elapsed / 1000);
      if (remaining < lastSpoken.current && remaining > 0) {
        lastSpoken.current = remaining;
        hapticService.pattern([40, 30, 40]);
        if (profile.visual) void tts.speak(String(remaining), { priority: "guidance" });
      }
      if (fraction >= 1) activate();
    }, 60);
  }, [activated, holding, profile.visual, activate]);

  const cancelHold = useCallback(() => {
    if (!holding || activated) return;
    clearHold();
    setProgress(0);
    hapticService.stop();
    showToast("Cancelled — hold for 3 seconds to send the alert");
  }, [holding, activated, clearHold, showToast]);

  useEffect(() => () => { if (tick.current) window.clearInterval(tick.current); }, []);

  const ringStyle = { strokeDashoffset: 251 * (1 - progress) };

  return (
    <PageFrame nav>
      <ScreenHeader title="Emergency Mode" subtitle="You’re not alone. INAI is with you." icon={Siren} backTo="/home" />
      <div className="flex-1 px-5 pb-6">
        <div role="alert" className="rounded-control bg-speech px-4 py-3 text-center text-sm font-extrabold text-speech-foreground">
          SIMULATED — this prototype does not contact real emergency services.
        </div>

        <h2 className="mt-4 text-2xl font-extrabold text-ink">In an emergency, help is just a tap away.</h2>
        <p className="mt-1 text-sm text-muted-foreground">INAI will alert nearby support and keep guiding you.</p>

        <div className="mt-4 grid grid-cols-[1fr_8rem] items-center gap-2">
          <div className="rounded-card border border-primary/10 bg-primary-tint p-4 shadow-inai">
            <p className="font-semibold text-ink">I’m here with you.</p>
            <p className="mt-1 text-xs text-muted-foreground">Your safety matters — We’ll notify the right people, instantly.</p>
          </div>
          <INAIAvatar state="emergency" size="xs" />
        </div>

        {!activated ? (
          <div className="mt-6 flex flex-col items-center">
            <button
              type="button"
              aria-label="I need help. Press and hold for 3 seconds to send the alert."
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !holding) { event.preventDefault(); startHold(); } }}
              onKeyUp={cancelHold}
              className="relative grid size-56 select-none place-items-center rounded-full bg-speech text-speech-foreground shadow-inai focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-speech"
            >
              <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="4" className="text-speech/30" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray="251" style={ringStyle} />
              </svg>
              <span className="text-center">
                <span className="block text-3xl font-extrabold">I NEED HELP</span>
                <span className="mt-1 block text-sm font-semibold opacity-90">Tap and hold for 3 seconds</span>
                {holding && profile.hearing && <span className="mt-2 block text-4xl font-extrabold">{Math.max(1, Math.ceil(3 - progress * 3))}</span>}
              </span>
            </button>
            {holding && profile.visual && (
              <p aria-live="assertive" className="mt-3 text-center text-2xl font-bold text-speech">{Math.max(1, Math.ceil(3 - progress * 3))}…</p>
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ol className="space-y-3">
              {timeline.map((entry, index) => (
                <li key={entry.label} className={`flex items-start gap-3 rounded-control border p-3 transition ${index < revealed ? "border-hearing/40 bg-hearing-tint" : "border-line opacity-50"}`}>
                  <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${index < revealed ? "bg-hearing text-primary-foreground" : "bg-canvas text-muted-foreground"}`}>
                    <Check className="size-4" />
                  </span>
                  <span>
                    <strong className="block text-sm text-ink">{entry.label}</strong>
                    <span className="text-xs text-muted-foreground">{entry.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="relative min-h-48 overflow-hidden rounded-card border border-line bg-primary-tint" aria-label="Your location shared">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:36px_36px]" />
              <span className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-background bg-primary shadow-inai" />
              <span className="absolute bottom-3 left-3 rounded bg-background px-2 py-1 text-xs font-bold text-primary">Your location shared</span>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            { icon: Bell, title: "Alert Caretakers", sub: "Family & Friends", message: "Your caretakers have been alerted. This is a simulation." },
            { icon: Share2, title: "Share Location", sub: "Real-time GPS", message: "Your live location is being shared. This is a simulation." },
            { icon: Home, title: "Notify Campus", sub: "Security & Staff", message: "Campus security has been notified. This is a simulation." },
            { icon: Siren, title: "Contact Emergency", sub: "Nearby Help", message: "Nearby emergency help has been contacted. This is a simulation." },
          ].map(({ icon: Icon, title, sub, message }) => (
            <button
              key={title}
              type="button"
              onClick={() => { showToast(message); void tts.speak(message, { priority: "alert" }); }}
              className="min-h-24 rounded-control border border-line bg-background p-4 text-left shadow-inai"
            >
              <Icon className="text-speech" />
              <strong className="mt-2 block text-sm text-ink">{title}</strong>
              <span className="text-xs text-muted-foreground">{sub}</span>
            </button>
          ))}
        </div>

        {profile.speech && (
          <div className="mt-5">
            <h2 className="font-extrabold text-ink">INAI can speak for you</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {HELP_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => void tts.speak(phrase, { priority: "emergency", interrupt: true })}
                  className="min-h-12 rounded-full border border-speech/30 bg-speech px-4 font-semibold text-speech"
                >
                  <Volume2 className="mr-1 inline size-4" />{phrase}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 rounded-card bg-primary-tint p-4 shadow-inai">
          <INAIAvatar state="speaking" size="xs" />
          <p className="flex-1 text-sm font-semibold text-ink">Help has been requested. Stay where you are. You are safe, and I’m with you.</p>
          <Button variant="outline" size="icon" className="min-h-11 min-w-11 rounded-full" aria-label="Play the message again" onClick={() => void tts.speak("Help has been requested. Stay where you are. You are safe, and I'm with you.", { priority: "emergency", interrupt: true })}>
            <RotateCcw className="size-4" />
          </Button>
        </div>
        {toast && <div role="status" className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-background shadow-inai">{toast}</div>}
      </div>
    </PageFrame>
  );
}

// ---------------------------------------------------------------- Privacy & Data

const PRIVACY_SECTIONS = [
  {
    icon: Eye, title: "Processed on your device",
    body: "Camera frames and microphone audio are analysed on this device and are never recorded or uploaded.",
  },
  {
    icon: Share2, title: "What leaves your device",
    body: "One single camera frame — only when you tap “Describe this scene”. The text you type into INAI chat. Nothing else.",
  },
  {
    icon: HandHeart, title: "What is stored",
    body: "Your preferences, an event log, and saved phrases. Transcripts are opt-in and stay off unless you turn them on.",
  },
  {
    icon: RotateCcw, title: "How long we keep it",
    body: "Stored data stays until you delete it. Deleting your data removes every saved row immediately.",
  },
];

export function PrivacyScreen() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const deleteData = async () => {
    setBusy(true);
    const tables = ["transcripts", "assistance_events", "emergency_events", "quick_phrase_stats", "saved_phrases", "accessibility_preferences", "inai_settings"] as const;
    for (const table of tables) {
      await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
    setBusy(false);
    setDone(true);
    setConfirming(false);
    hapticService.pulse("notice");
  };

  return (
    <PageFrame>
      <ScreenHeader title="Privacy & Data" subtitle="You stay in control." icon={ShieldAlert} backTo="/settings" />
      <div className="flex-1 px-5 pb-6">
        <h2 className="pt-2 text-2xl font-extrabold text-ink">Privacy &amp; Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Plain words about what happens to your information.</p>
        <div className="mt-4 space-y-3">
          {PRIVACY_SECTIONS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-card border border-line bg-background p-4 shadow-inai">
              <div className="flex items-center gap-2"><Icon className="size-5 text-primary" /><strong className="text-ink">{title}</strong></div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
        {done ? (
          <div role="status" className="mt-5 rounded-control bg-hearing-tint p-4 text-sm font-semibold text-hearing">Your data has been deleted.</div>
        ) : (
          <Button variant="outline" className="mt-5 w-full rounded-full border-speech/40 text-speech" onClick={() => setConfirming(true)}>
            <Trash2 /> Delete my data
          </Button>
        )}
        {confirming && (
          <div role="dialog" aria-modal="true" aria-label="Confirm deletion" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
            <div className="w-full max-w-sm rounded-card bg-background p-5 shadow-inai">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-ink"><AlertTriangle className="size-5 text-speech" /> Delete everything?</h3>
              <p className="mt-2 text-sm text-muted-foreground">This clears your preferences, event log, saved phrases and transcripts on this device’s account. It cannot be undone.</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1 rounded-full" onClick={() => setConfirming(false)}>Keep my data</Button>
                <Button className="flex-1 rounded-full bg-speech hover:bg-speech/90" disabled={busy} onClick={() => void deleteData()}>{busy ? "Deleting…" : "Delete"}</Button>
              </div>
            </div>
          </div>
        )}
        {footer}
      </div>
    </PageFrame>
  );
}
