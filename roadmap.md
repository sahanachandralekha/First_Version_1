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

## Stage 2 of 5 — ADAPTIVE EXPERIENCE
- [x] Complete the reference-matched intro, setup, and confirmation flows with captions, muted TTS, edit mode, and cloud profile saving.
- [x] Replace the dashboard registry with typed modules, priority scoring, 30-second alert promotion, five-card cap, and More sheet.
- [x] Build every adaptive home preview, live 250ms reordering, profile-aware status copy, event history, and developer need toggles.
- [x] Complete Profile and Settings, including immediate preference saving and the service-mode disclosure sheet.
- [x] Verify Stage 2 routes, keyboard behavior, live adaptation, cloud reads/writes, mobile layout, and preview health.

## Stage 5 of 5 — POLISH, AUDIT AND DEMO READINESS
- [ ] Unify every active INAI appearance through INAIAvatar and document the pose used on each screen.
- [ ] Consolidate headers, status indicators, controls, spacing, colors, typography, captions, and motion behavior.
- [ ] Fix accessibility findings across landmarks, headings, labels, focus, targets, contrast, text scaling, reduced motion, and sign descriptions.
- [ ] Verify responsive layouts at 320, 360, 390, and 430 px, tablet, desktop, and camera landscape.
- [ ] Finish performance cleanup for lazy loading, asset preloading, route cleanup, media release, TTS cancellation, and hidden loops.
- [ ] Complete loading, empty, error, permission-denied, degraded, and activating states across active screens.
- [ ] Complete honesty labels and the real/mock/future disclosure.
- [ ] Verify all routes, seven profile combinations, adaptive navigation/dashboard behavior, alerts, persistence, and media cleanup.
- [ ] Finish Settings-gated Demo Mode with sequence, manual recovery triggers, reset, and visible demo controls.
- [ ] Replace the generic README with the one-page INAI architecture and service-mode guide.
