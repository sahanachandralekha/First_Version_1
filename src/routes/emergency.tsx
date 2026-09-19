import { createFileRoute } from "@tanstack/react-router";
import { EmergencyScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/emergency")({ head: () => routeHead("Emergency Support", "Adaptive, multimodal support from INAI."), component: EmergencyScreen });
