import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/alert/$id")({
  head: () => routeHead("Smart Alert", "Important guidance presented across multiple accessible channels."),
  component: Page,
});

function Page() { return <ScreenShell title={"Smart Alert"} subtitle={"Important guidance presented across multiple accessible channels."} nav={false} />; }
