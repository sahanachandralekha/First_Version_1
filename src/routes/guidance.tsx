import { createFileRoute } from "@tanstack/react-router";
import { GuidanceScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/guidance")({ head: () => routeHead("You're not alone.", "Adaptive, multimodal support from INAI."), component: GuidanceScreen });
