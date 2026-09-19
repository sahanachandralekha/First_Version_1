// INAI prototype service worker: shell + sign assets + last-known data stay usable offline.
const CACHE = "inai-shell-v1";
const SHELL = ["/", "/communicate", "/communicate/sign", "/map", "/emergency"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache backend calls.
  if (url.pathname.includes("/_server") || url.pathname.includes("supabase")) return;

  // Sign step assets: cache-first (they never change).
  if (url.pathname.startsWith("/inai/")) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => hit)));
    return;
  }

  // App shell: network-first with cache fallback so the app opens offline.
  event.respondWith(fetch(request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
    return response;
  }).catch(() => caches.match(request).then((hit) => hit ?? caches.match("/"))));
});
