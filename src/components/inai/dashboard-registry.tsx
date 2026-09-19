import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import {
  CirclePlay, Ear, Eye, MapPin, MessageCircle, Navigation, Play, Type, Volume2,
  type LucideIcon,
} from "lucide-react";
import type { AccessibilityProfile, Need } from "@/stores/accessibility-store";
import campusImage from "@/assets/campus-walkway.jpg";

export type ModuleSize = "hero" | "standard" | "compact";
export interface DashboardContext {
  activeAlertModule?: string;
  now: number;
  alertStartedAt?: number;
}
export interface DashboardPreviewProps { size: ModuleSize }
export interface DashboardModule {
  id: string;
  title: string;
  icon: LucideIcon;
  accent: "visual" | "hearing" | "speech" | "primary";
  requires: Need[];
  basePriority: number;
  urgencyBoost: (context: DashboardContext) => number;
  size: ModuleSize;
  component: ComponentType<DashboardPreviewProps>;
}

const noBoost = () => 0;
const moduleLink: Record<string, "/vision" | "/sound" | "/transcribe" | "/communicate" | "/communicate/sign" | "/map"> = {
  environment: "/vision",
  soundAwareness: "/sound",
  transcription: "/transcribe",
  communication: "/communicate",
  signQuick: "/communicate/sign",
  location: "/map",
};

export function EnvironmentPreview() {
  return <div><div className="relative h-40 overflow-hidden rounded-control"><img src={campusImage} alt="Mock campus preview" className="size-full object-cover"/><span className="absolute left-3 top-4 rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">Person · 3 m</span><span className="absolute right-3 top-3 rounded bg-danger px-2 py-1 text-xs font-bold text-destructive-foreground">Stairs · 3 m</span><span className="absolute bottom-2 left-2 rounded-full bg-background px-3 py-1 text-[10px] font-bold text-live">● Live preview</span></div><p className="mt-3 rounded-control bg-speech-tint px-3 py-2 text-sm font-bold text-danger">Obstacle ahead · Stairs in 3 meters</p><p className="mt-3 flex items-center gap-2 font-bold text-primary"><Eye className="size-4"/>Describe what you see</p></div>;
}
export function SoundPreview() {
  return <div><div className="rounded-control bg-hearing-tint px-4 py-5 text-center text-2xl text-hearing" aria-label="Mock sound waveform">▂▅▃▇▅▂▆▃▇</div><p className="mt-3 text-sm font-semibold">Direction: Left · Distance ~20 m</p><p className="mt-2 rounded-control bg-speech-tint px-3 py-2 text-sm font-bold text-danger">Emergency siren detected</p></div>;
}
export function TranscriptionPreview() {
  return <div><div className="flex items-center justify-between"><strong>Live Transcription</strong><span className="rounded-full bg-hearing-tint px-2 py-1 text-[10px] font-bold text-hearing">● Live</span></div><blockquote className="mt-3 text-lg font-semibold">“Please move to the main entrance.”</blockquote><p className="mt-2 text-xs text-muted-foreground">Detected just now</p></div>;
}
export function CommunicationPreview() {
  return <div><div className="grid grid-cols-3 gap-2">{[[Volume2,"Speak"],[Type,"Type"],[MessageCircle,"Sign"]].map(([Glyph,label])=>{const Icon=Glyph as LucideIcon;return <span key={String(label)} className="grid min-h-16 place-items-center rounded-control bg-speech-tint text-xs font-bold text-speech"><Icon className="size-5"/>{String(label)}</span>})}</div><div className="mt-3 flex flex-wrap gap-2">{["I need help","Please repeat","Thank you"].map((phrase)=><span key={phrase} className="rounded-full border border-speech/20 px-3 py-1 text-xs">{phrase}</span>)}</div></div>;
}
export function SignQuickPreview() {
  return <div className="space-y-2">{["I need help","Thank you"].map((phrase)=><div key={phrase} className="flex min-h-12 items-center rounded-control bg-primary-tint px-3 font-semibold"><CirclePlay className="mr-2 size-5 text-primary"/>{phrase}<Play className="ml-auto size-4 text-primary"/></div>)}</div>;
}
export function LocationPreview() {
  return <div><div className="relative h-28 overflow-hidden rounded-control bg-primary-tint"><div className="absolute inset-0 opacity-50 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:26px_26px]"/><span className="absolute left-1/3 top-1/2 size-5 rounded-full border-4 border-background bg-primary"/><span className="absolute bottom-2 left-2 rounded-full bg-background px-2 py-1 text-xs font-bold">You are here</span></div><div className="mt-2 flex gap-2 text-xs"><span className="rounded-full bg-primary-tint px-2 py-1">Exit · 80 m</span><span className="rounded-full bg-primary-tint px-2 py-1">Restroom · 120 m</span></div></div>;
}
export function RecentEventsPreview({ events = [] }: DashboardPreviewProps & { events?: Array<{ id:string; event_type:string; severity:string; created_at:string }> }) {
  return <div className="space-y-2">{events.length ? events.map((event)=><div key={event.id} className="flex items-center gap-2 rounded-control bg-canvas px-3 py-2 text-sm"><span className={event.severity === "critical" ? "text-danger" : "text-primary"}>●</span><span className="font-semibold">{event.event_type.replaceAll("_"," ")}</span><time className="ml-auto text-xs text-muted-foreground">{new Date(event.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}</time></div>) : <p className="rounded-control bg-canvas p-3 text-sm text-muted-foreground">No recent assistance events.</p>}</div>;
}

export const dashboardModules: DashboardModule[] = [
  { id:"inaiStatus", title:"INAI status", icon:MessageCircle, accent:"primary", requires:[], basePriority:1000, urgencyBoost:noBoost, size:"hero", component:CommunicationPreview },
  { id:"environment", title:"Environment", icon:Eye, accent:"visual", requires:["visual"], basePriority:100, urgencyBoost:noBoost, size:"standard", component:EnvironmentPreview },
  { id:"soundAwareness", title:"Sound Awareness", icon:Ear, accent:"hearing", requires:["hearing"], basePriority:95, urgencyBoost:noBoost, size:"standard", component:SoundPreview },
  { id:"transcription", title:"Live Transcription", icon:MessageCircle, accent:"hearing", requires:["hearing"], basePriority:80, urgencyBoost:noBoost, size:"standard", component:TranscriptionPreview },
  { id:"communication", title:"Communication", icon:MessageCircle, accent:"speech", requires:["speech"], basePriority:95, urgencyBoost:noBoost, size:"standard", component:CommunicationPreview },
  { id:"signQuick", title:"Quick Signs", icon:CirclePlay, accent:"speech", requires:["speech"], basePriority:70, urgencyBoost:noBoost, size:"compact", component:SignQuickPreview },
  { id:"location", title:"Location", icon:MapPin, accent:"primary", requires:[], basePriority:60, urgencyBoost:noBoost, size:"compact", component:LocationPreview },
  { id:"recentEvents", title:"Recent Events", icon:Navigation, accent:"primary", requires:[], basePriority:40, urgencyBoost:noBoost, size:"compact", component:RecentEventsPreview },
];

export function resolveDashboard(profile: AccessibilityProfile, context: DashboardContext) {
  const elapsed = context.alertStartedAt === undefined ? Number.POSITIVE_INFINITY : Math.max(0, context.now - context.alertStartedAt);
  const alertBoost = elapsed < 30000 ? 1000 * (1 - elapsed / 30000) : 0;
  const eligible = dashboardModules
    .filter((module)=>module.id !== "inaiStatus" && module.requires.every((need)=>profile[need]))
    .map((module)=>({ ...module, score:module.basePriority + module.urgencyBoost(context) + (module.id === context.activeAlertModule ? alertBoost : 0) }))
    .sort((a,b)=>b.score-a.score)
    .map((module,index)=>({ ...module, size:(index===0 ? "hero" : index<3 ? "standard" : "compact") as ModuleSize }));
  return { visible:eligible.slice(0,5), overflow:eligible.slice(5) };
}

export function DashboardCard({ module, children }: { module: ReturnType<typeof resolveDashboard>["visible"][number]; children?: React.ReactNode }) {
  const Icon=module.icon;
  const destination=moduleLink[module.id];
  const body=<article className={`h-full rounded-card border border-line bg-background p-4 shadow-inai ${module.size === "hero" ? "sm:col-span-2" : ""}`}><header className="mb-3 flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-full bg-${module.accent}-tint text-${module.accent}`}><Icon/></span><h2 className="font-extrabold text-ink">{module.title}</h2></header>{children ?? <module.component size={module.size}/>}</article>;
  return destination ? <Link to={destination} className={module.size === "hero" ? "sm:col-span-2" : ""}>{body}</Link> : body;
}