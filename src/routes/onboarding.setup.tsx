import { createFileRoute } from "@tanstack/react-router";
import { SetupScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/setup")({ head: () => routeHead("How can I support you?", "Adaptive, multimodal support from INAI."), component: SetupScreen });
