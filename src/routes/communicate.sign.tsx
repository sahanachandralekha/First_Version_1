import { createFileRoute } from "@tanstack/react-router";
import { SignScreen } from "@/components/inai/Stage4Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/communicate/sign")({ head: () => routeHead("INAI Sign Communication", "Reviewed Indian Sign Language phrases, shown step by step."), component: SignScreen });
