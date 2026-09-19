import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/guidance")({
  head: () => routeHead("You're not alone.", "Full-screen, multimodal guidance for the moment ahead."),
  component: Page,
});

function Page() { return <ScreenShell title={"You're not alone."} subtitle={"Full-screen, multimodal guidance for the moment ahead."} nav={false} />; }
