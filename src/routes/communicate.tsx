import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/communicate")({
  head: () => routeHead("Express Yourself", "Speak, type, or choose a verified communication phrase."),
  component: Page,
});

function Page() { return <ScreenShell title='Express Yourself' subtitle='Speak, type, or choose a verified communication phrase.' nav=true />; }
