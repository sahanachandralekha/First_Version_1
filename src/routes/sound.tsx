import { createFileRoute } from "@tanstack/react-router";
import { SoundScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/sound")({ head: () => routeHead("Sound Awareness", "Adaptive, multimodal support from INAI."), component: SoundScreen });
