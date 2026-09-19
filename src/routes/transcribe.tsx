import { createFileRoute } from "@tanstack/react-router";
import { TranscribeScreen } from "@/components/inai/AppScreens";
import { routeHead } from "@/lib/inai/route-head";

export const Route = createFileRoute("/transcribe")({ head: () => routeHead("Live Transcription", "Adaptive, multimodal support from INAI."), component: TranscribeScreen });
