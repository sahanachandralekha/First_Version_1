import { createFileRoute } from "@tanstack/react-router";
import { SignScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/communicate/sign")({ head: () => routeHead("Communication Without Limits", "Adaptive, multimodal support from INAI."), component: SignScreen });
