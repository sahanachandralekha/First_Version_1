import { createFileRoute } from "@tanstack/react-router";
import { InaiScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/inai")({ head: () => routeHead("Ask Anything. I'm Here.", "Adaptive, multimodal support from INAI."), component: InaiScreen });
