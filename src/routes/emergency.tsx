import { createFileRoute } from "@tanstack/react-router";
import { EmergencyScreen } from "@/components/inai/Stage4Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/emergency")({
  head: () => routeHead("Emergency Mode", "You're not alone. INAI is with you — alert support and get guidance."),
  component: EmergencyScreen,
});
