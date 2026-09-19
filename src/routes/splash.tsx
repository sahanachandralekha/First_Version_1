import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/splash")({
  head: () => routeHead("Welcome", "INAI is preparing your adaptive accessibility experience."),
  component: Page,
});

function Page() { return <ScreenShell title={"Welcome"} subtitle={"INAI is preparing your adaptive accessibility experience."} nav={false} />; }
