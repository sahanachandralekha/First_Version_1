import { createFileRoute } from "@tanstack/react-router";
import { IntroScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/intro")({ head: () => routeHead("Meet INAI", "Adaptive, multimodal support from INAI."), component: IntroScreen });
