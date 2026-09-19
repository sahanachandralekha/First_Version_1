import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/transcribe")({
  head: () => routeHead("Live Transcription", "Follow speech with large, clear text and extracted meaning."),
  component: Page,
});

function Page() { return <ScreenShell title='Live Transcription' subtitle='Follow speech with large, clear text and extracted meaning.' nav=true />; }
