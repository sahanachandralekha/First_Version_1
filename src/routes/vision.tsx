import { createFileRoute } from "@tanstack/react-router";
import { VisionScreen } from "@/components/inai/Stage3Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/vision")({ head: () => routeHead("Environment Assist", "Adaptive, multimodal support from INAI."), component: VisionScreen });
