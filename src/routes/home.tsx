import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/home")({ head: () => routeHead("Good morning", "Adaptive, multimodal support from INAI."), component: HomeScreen });
