import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/profile")({
  head: () => routeHead("My Accessibility Profile", "Review and change how INAI supports you."),
  component: Page,
});

function Page() { return <ScreenShell title='My Accessibility Profile' subtitle='Review and change how INAI supports you.' nav=true />; }
