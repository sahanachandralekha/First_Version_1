import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/settings")({ head: () => routeHead("Your INAI. Your Way.", "Adaptive, multimodal support from INAI."), component: SettingsScreen });
