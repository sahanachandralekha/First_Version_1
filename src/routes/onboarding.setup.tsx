import { createFileRoute } from "@tanstack/react-router";
import { SetupScreen } from "@/components/inai/Stage2Screens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/onboarding/setup")({ validateSearch: (search: Record<string, unknown>) => ({ edit: search["edit"] === true || search["edit"] === "true" }), head: () => routeHead("How can I support you?", "Choose the visual, hearing, and communication assistance you want from INAI."), component: SetupRoute });

function SetupRoute() {
  const { edit } = Route.useSearch();
  return <SetupScreen edit={edit}/>;
}
