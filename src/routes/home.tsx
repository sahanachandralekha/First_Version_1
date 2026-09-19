import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/home")({
  head: () => routeHead("Good morning", "INAI is monitoring the context you choose to share."),
  component: Page,
});

function Page() { return <ScreenShell title='Good morning' subtitle='INAI is monitoring the context you choose to share.' nav=true />; }
