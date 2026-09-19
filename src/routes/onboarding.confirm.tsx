import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/confirm")({
  head: () => routeHead("Your INAI experience", "Review how INAI will personalize your experience."),
  component: Page,
});

function Page() { return <ScreenShell title='Your INAI experience' subtitle='Review how INAI will personalize your experience.' nav=false />; }
