export function CaptionRegion({ message, critical = false }: { message: string; critical?: boolean }) {
  return <div className="sr-only" aria-live={critical ? "assertive" : "polite"} aria-atomic="true">{message}</div>;
}
