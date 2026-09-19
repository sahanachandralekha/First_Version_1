import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/setup")({
  head: () => routeHead("How can I support you?", "Choose any combination that fits you today."),
  component: Page,
});

function Page() { return <ScreenShell title={"How can I support you?"} subtitle={"Choose any combination that fits you today."} nav={false} />; }
