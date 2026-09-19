import { createFileRoute } from "@tanstack/react-router";
import { MapScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/map")({ head: () => routeHead("Find Your Way", "Adaptive, multimodal support from INAI."), component: MapScreen });
