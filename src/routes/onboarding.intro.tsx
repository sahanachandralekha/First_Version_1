import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/intro")({
  head: () => routeHead("Meet INAI", "Support that speaks, signs, shows text, and stays with you."),
  component: Page,
});

function Page() { return <ScreenShell title={"Meet INAI"} subtitle={"Support that speaks, signs, shows text, and stays with you."} nav={false} />; }
