import { createFileRoute } from "@tanstack/react-router";
import { PrivacyScreen } from "@/components/inai/Stage4Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/settings/privacy")({ head: () => routeHead("Privacy & Data", "What INAI processes on your device, what leaves it, and how to delete your data."), component: PrivacyScreen });
