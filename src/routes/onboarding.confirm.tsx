import { createFileRoute } from "@tanstack/react-router";
import { ConfirmScreen } from "@/components/inai/Stage2Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/confirm")({ head: () => routeHead("Your INAI experience", "Review your selected assistance before INAI personalizes your experience."), component: ConfirmScreen });
