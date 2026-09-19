import { createFileRoute } from "@tanstack/react-router";
import { ProfileScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/profile")({ head: () => routeHead("My Accessibility Profile", "Adaptive, multimodal support from INAI."), component: ProfileScreen });
