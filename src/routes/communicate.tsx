import { createFileRoute } from "@tanstack/react-router";
import { CommunicateScreen } from "@/components/inai/Stage4Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/communicate")({ head: () => routeHead("Communication Assistant", "Type, speak or sign — INAI helps you communicate in every way."), component: CommunicateScreen });
