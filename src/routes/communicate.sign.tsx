import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/communicate/sign")({
  head: () => routeHead("Communication Without Limits", "Play reviewed Indian Sign Language phrase steps."),
  component: Page,
});

function Page() { return <ScreenShell title={"Communication Without Limits"} subtitle={"Play reviewed Indian Sign Language phrase steps."} nav={true} />; }
