import { createFileRoute } from "@tanstack/react-router";
import { VisionScreen } from "@/components/inai/Stage3Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/vision/")({
  head: () => routeHead("AI Vision", "INAI describes what is in front of you, with approximate distances."),
  component: VisionScreen,
});
