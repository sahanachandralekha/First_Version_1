export function routeHead(title: string, description: string) {
  const fullTitle = title === "INAI" ? "INAI — Adaptive AI Accessibility Companion" : `${title} — INAI`;
  return { meta: [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] };
}
