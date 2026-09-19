import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/vision/live")({
  head: () => routeHead("Live Monitoring", "Continuous low-chrome environment awareness."),
  component: Page,
});

function Page() { return <ScreenShell title={"Live Monitoring"} subtitle={"Continuous low-chrome environment awareness."} nav={true} />; }
