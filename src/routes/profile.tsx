import { createFileRoute } from "@tanstack/react-router";
import { ProfileScreen } from "@/components/inai/Stage2Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/profile")({ head: () => routeHead("My Accessibility Profile", "Review and update the assistance INAI provides as your needs change."), component: ProfileScreen });
