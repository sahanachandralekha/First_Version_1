import { Link } from "@tanstack/react-router";
import { Eye, Home, MapPinned, MessageCircle, Mic, UserRound, Volume2, BookOpen } from "lucide-react";
import { resolveNavigation } from "@/lib/inai/navigation";
import { useAccessibilityStore } from "@/stores/accessibility-store";
const icons = { home: Home, assist: Eye, map: MapPinned, hearing: Volume2, conversation: MessageCircle, learn: BookOpen, mic: Mic, profile: UserRound };
export function BottomNavigation() {
  const profile = useAccessibilityStore((state) => state.profile); const items = resolveNavigation(profile);
  return <nav aria-label="Primary" className="sticky bottom-0 z-30 border-t border-line bg-background/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
    <ul className="mx-auto grid max-w-xl grid-cols-5 items-end">{items.map((item, index) => { const Icon = icons[item.icon]; const raised = index === 2; return <li key={`${item.label}-${item.to}`}><Link to={item.to} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-bold text-muted-foreground transition-colors data-[status=active]:text-primary ${raised ? "-mt-7" : ""}`}><span className={raised ? "grid size-16 place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-inai" : "grid size-8 place-items-center"}><Icon aria-hidden="true" className={raised ? "size-7" : "size-5"}/></span><span className="max-w-[4.5rem] text-center leading-tight">{item.label}</span></Link></li>; })}</ul>
  </nav>;
}
