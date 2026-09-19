import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/components/inai/Stage2Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/home")({ head: () => routeHead("Your adaptive INAI dashboard", "See the support modules INAI prioritizes for your selected accessibility needs."), component: HomeScreen });
