import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "@/components/inai/Stage2Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/settings")({ head: () => routeHead("Your INAI. Your Way.", "Adjust INAI voice, text, contrast, alerts, motion, and appearance preferences."), component: SettingsScreen });
