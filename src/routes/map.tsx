import { createFileRoute } from "@tanstack/react-router";
import { MapScreen } from "@/components/inai/Stage4Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/map")({ head: () => routeHead("Accessible Map", "Discover nearby accessible places and get step-by-step guidance."), component: MapScreen });
