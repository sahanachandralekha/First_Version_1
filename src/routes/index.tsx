import { createFileRoute } from "@tanstack/react-router";
import { SplashScreen } from "@/components/inai/SplashAlertScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/")({
  head: () => routeHead("INAI", "Your intelligent accessibility companion."),
  component: SplashScreen,
});