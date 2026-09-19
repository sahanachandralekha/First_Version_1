import { createFileRoute } from "@tanstack/react-router";
import { SplashScreen } from "@/components/inai/SplashAlertScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/splash")({ head: () => routeHead("Welcome", "Adaptive, multimodal support from INAI."), component: SplashScreen });
