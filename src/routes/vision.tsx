import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/vision")({
  head: () => routeHead("Environment Assist", "Live camera guidance and clear-path support."),
  component: Page,
});

function Page() { return <ScreenShell title='Environment Assist' subtitle='Live camera guidance and clear-path support.' nav=true />; }
