import { createFileRoute } from "@tanstack/react-router";
import { LiveVisionScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/vision/live")({ head: () => routeHead("Live Monitoring", "Adaptive, multimodal support from INAI."), component: LiveVisionScreen });
