import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/sound")({
  head: () => routeHead("Sound Awareness", "See important sounds, direction cues, and context."),
  component: Page,
});

function Page() { return <ScreenShell title='Sound Awareness' subtitle='See important sounds, direction cues, and context.' nav=true />; }
