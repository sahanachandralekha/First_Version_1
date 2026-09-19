import { createFileRoute } from "@tanstack/react-router";
import { CommunicateScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/communicate")({ head: () => routeHead("Express Yourself", "Adaptive, multimodal support from INAI."), component: CommunicateScreen });
