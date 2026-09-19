# Stage 5 — Polish, Audit and Demo Readiness

## Goal

Finish INAI as one coherent, accessible demo without adding product features. Preserve the current adaptive workflows while removing duplicate patterns, tightening honesty, and proving the full experience across devices and accessibility settings.

## Implementation

### 1. Character and interface consistency
- Route every active character appearance through `INAIAvatar`; remove the direct character image used by Splash and the legacy Smart Alert screen.
- Keep one shared pose mapping and add a concise screen-to-pose audit to the README.
- Replace local page headers, handwritten notes, live pills, status pills, speaking labels, and toast treatments with shared primitives.
- Normalize the 4/8/12/16/24/32 spacing rhythm, 24px cards, 16px controls, 48px controls/chips, semantic colors, headings, line lengths, and sentence-case copy.
- Remove or isolate legacy duplicate screen implementations so future audits inspect only the screens that routes actually use.

### 2. Accessibility and responsive fixes
- Keep exactly one root `<main>` landmark and change screen wrappers to sections/divisions; add one visible or screen-reader `h1` per route with logical heading order.
- Fix labels, focus visibility, 48px targets, dialog focus behavior, map controls/pins, radar items, step controls, status icon+text pairs, and simultaneous visible captions.
- Replace unsafe color combinations and the high-contrast page filter with explicit high-contrast tokens; verify default and high-contrast pairings.
- Make reduced-motion preferences control Motion animations, radar/waveform/pulse effects, avatar effects, overlays, route transitions, and toast motion.
- Harden grids and controls for AAA text at 320–430px, tablet/desktop, safe areas, and camera landscape without horizontal page scroll.

### 3. Performance and lifecycle cleanup
- Keep TensorFlow and Leaflet dynamically loaded with visible loading states; avoid loading their code on unrelated routes.
- Preload the canonical pose atlas and decode mouth overlays before speech; preserve silent fallback behavior.
- Retain the vision service’s ~4fps ceiling, add 120ms overlay entry fades, and prevent overlapping detection work.
- Centralize route-change cleanup so speech is cancelled and active camera, microphone, timers, and animation loops stop when a screen leaves or becomes hidden.
- Remove route-level duplication that currently causes unnecessary bundle weight while preserving file-based route splitting.

### 4. Complete screen states, motion, and honesty
- Add or verify loading, empty, error, permission-denied, degraded, and active variants for dashboard, vision, sound, transcription, sign, map, chat, profile, and emergency.
- Apply 200–250ms ease-out route transitions, 250ms dashboard crossfade, 0.97 chip press, slide-up toasts, honest linear emergency hold progress, and a restrained alert entrance with reduced-motion fallbacks.
- Use shared `ModeBadge`/status primitives for simulated sound direction/distance, indoor places, emergency dispatch, Demo Mode, and other mock values.
- Keep the emergency simulation warning prominent in both pre-activation and status views; preserve ISL validation labels and text alternatives.
- Sweep claims and copy so nothing promises perfect recognition, localization, sign translation, medical advice, or emergency response.

### 5. Demo readiness
- Add a Settings-only Demo Mode switch, persistent visible Demo badge, and a floating demo control shown only while enabled.
- Complete the scripted sequence: stairs, siren, classroom transcript, communication request, validated sign demonstration, then simulated emergency.
- Add individual recovery triggers for every step plus one Run sequence action.
- Add Reset demo to stop media/speech, clear event/session/demo state, reset the accessibility profile, and return to Splash.
- Replace the generic README with one page covering the problem, adaptive architecture, service mode table, ISL validation policy, screen/pose table, and REAL vs MOCK vs FUTURE boundaries.

## Verification

- Run focused tests for all seven non-empty accessibility profiles: navigation labels, center label, dashboard membership/order, five-card cap, live need removal, and persistence after refresh.
- Drive every content screen by keyboard, verify skip-to-content, heading/landmark counts, labels, focus, dialogs, emergency keyboard hold, and no focus traps.
- Exercise critical alerts from Vision, Sound, and DemoDirector and confirm the same overlay, visible caption, speech/haptic routing, mock labels, dismissal, and timeout.
- Verify camera/microphone tracks end after navigation and that TTS, intervals, and animations stop when leaving a screen.
- Capture 320/360/390/430px portrait, 844px tablet, 1280px desktop, and camera landscape; repeat core screens with AAA text, high contrast, and reduced motion.
- Run automated accessibility checks, targeted interaction tests, and the project’s validation pipeline; fix every reproducible finding before completion.

## Current audit baseline

- The active onboarding intro currently renders two `<main>` landmarks and no `h1`.
- Splash and the legacy Smart Alert route bypass `INAIAvatar` with a direct character image.
- Stage 3 uses a local header instead of the shared `ScreenHeader`; several controls are below 48px.
- Some motion ignores the saved reduced-motion preference, and high contrast is currently implemented as a global filter.
- DemoDirector exists but is not connected to Settings, a floating controller, manual triggers, or reset.
- The README is still the generic project template.