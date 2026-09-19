import { createFileRoute } from "@tanstack/react-router";
import { AlertScreen } from "@/components/inai/SplashAlertScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/alert/$id")({ head: () => routeHead("Smart Alert", "Adaptive, multimodal support from INAI."), component: AlertScreen });
