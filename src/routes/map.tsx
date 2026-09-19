import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/map")({
  head: () => routeHead("Find Your Way", "Discover nearby accessible places and route guidance."),
  component: Page,
});

function Page() { return <ScreenShell title={"Find Your Way"} subtitle={"Discover nearby accessible places and route guidance."} nav={true} />; }
