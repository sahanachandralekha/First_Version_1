import { createFileRoute } from "@tanstack/react-router";
import { ConfirmScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/confirm")({ head: () => routeHead("Your INAI experience", "Adaptive, multimodal support from INAI."), component: ConfirmScreen });
