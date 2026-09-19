# INAI roadmap

- [x] Establish the reference-led design system and accessible foundation preview.
- [x] Prepare all 18 screen addresses with unique sharing metadata.
- [x] Add persisted accessibility, context, and session state.
- [x] Add adaptive navigation, dashboard resolution, event ranking, and output routing foundations.
- [x] Define honest REAL, MOCK, and FUTURE service boundaries with safe fallbacks.
- [x] Add the sprite-first INAI avatar driver, mouth frames, captions, and future driver stubs.
- [x] Connect Lovable Cloud for later authenticated persistence and protected AI work.
- [x] Replace the foundation preview and route stubs with the complete 18-screen reference-matched experience.
- [x] Add the supplied transparent INAI avatar as the canonical character asset across every screen.
- [x] Connect onboarding, adaptive navigation, live profile changes, alerts, communication, signs, settings, emergency hold, and demo interactions.
- [x] Verify every screen and interaction on mobile and desktop, including reduced motion and high contrast.
## Stage 1 of 5 — FOUNDATION (current)
- [x] Design tokens: exact Stage 1 hex values, data-text-size / data-contrast driven root font size
- [x] AppShell 480px, ScreenHeader, ScriptNote, Sparkles primitives
- [x] AlertOverlayHost mounted above the router
- [x] Reconnect Lovable Cloud backend (stale instance link), create all 9 tables + RLS + grants, enable anonymous sign-in, auto anonymous session on first load
- [x] Stores: add reset(), Supabase sync on change
- [x] services/registry.ts with getServiceModes()
- [x] Shared states: LoadingState, EmptyState, ErrorState, PermissionDialog, Toast, Modal
- [x] Avatar: blink, head sway, sparkle drift, reduced-motion static pose, sprite-atlas paths with silent idle fallback
- [x] Bottom nav: long-press centre opens /emergency, centre label per Stage 1 table
- [x] Splash: 2.2s, saved profile -> /home else /onboarding/intro
