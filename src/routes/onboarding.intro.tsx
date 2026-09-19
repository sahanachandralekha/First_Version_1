import { createFileRoute } from "@tanstack/react-router";
import { IntroScreen } from "@/components/inai/Stage2Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/intro")({ head: () => routeHead("Meet INAI", "Meet INAI and discover four accessible ways to understand and communicate."), component: IntroScreen });
