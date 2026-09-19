import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/inai")({
  head: () => routeHead("Ask Anything. I'm Here.", "Talk with INAI about navigation, sound, surroundings, and communication."),
  component: Page,
});

function Page() { return <ScreenShell title={"Ask Anything. I'm Here."} subtitle={"Talk with INAI about navigation, sound, surroundings, and communication."} nav={true} />; }
