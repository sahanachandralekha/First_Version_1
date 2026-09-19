import { createFileRoute } from "@tanstack/react-router";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/settings")({
  head: () => routeHead("Your INAI. Your Way.", "Adjust voice, text, contrast, language, haptics, and motion."),
  component: Page,
});

function Page() { return <ScreenShell title='Your INAI. Your Way.' subtitle='Adjust voice, text, contrast, language, haptics, and motion.' nav=true />; }
