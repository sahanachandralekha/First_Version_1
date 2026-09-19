import { createFileRoute } from "@tanstack/react-router";
import { FoundationPreview } from "@/components/inai/FoundationPreview";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/")({
  head: () => routeHead("INAI", "Your intelligent accessibility companion."),
  component: FoundationPreview,
});