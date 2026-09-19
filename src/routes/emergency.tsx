import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/emergency")({
  head: () => routeHead("Emergency Support", "A clearly simulated safety flow with guided next steps."),
  component: Page,
});

function Page() { return <ScreenShell title={"Emergency Support"} subtitle={"A clearly simulated safety flow with guided next steps."} nav={false} />; }
