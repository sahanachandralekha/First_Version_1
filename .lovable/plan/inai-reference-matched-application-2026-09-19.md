# INAI reference-matched application

## Goal
Replace the current foundation preview and placeholder pages with the complete mobile-first INAI experience. The supplied screenshots are the visual source of truth, and the supplied transparent avatar becomes the canonical INAI character.

## Build
1. **Shared visual system and avatar**
   - Match the reference typography, white/canvas surfaces, blue/green/rose assistance colors, compact shadows, rounded controls, mobile status spacing, and bottom navigation.
   - Store the supplied avatar through the project asset flow and render it consistently through `INAIAvatar`, with state labels, reduced-motion behavior, captions, and graceful pose reuse where no separate approved pose exists.

2. **Entry and onboarding**
   - Build the splash, introduction, assistance selection, and confirmation screens to match references.
   - Connect Skip, Next, Back, multi-select validation, confirmation, persisted profile state, and immediate accessibility announcements.

3. **Adaptive daily assistance**
   - Build Home, Vision, Smart Alert, Live Vision, Sound Awareness, and Transcription with the reference layouts.
   - Connect profile-driven module ordering and navigation, live/mock mode labels, dismissible guidance, alert acknowledgement, camera/microphone permission states, and safe degraded states.

4. **Communication, navigation, and safety**
   - Build Speak/Type/Sign communication, verified ISL phrase playback, map guidance, three-second emergency hold, INAI chat, and full guidance.
   - Keep simulated direction, indoor place, and emergency behavior visibly labeled; never imply real dispatch or unverified signing.

5. **Profile, settings, and verification**
   - Build profile and settings controls, service-mode disclosure, text sizing, contrast, haptics, reduced motion, voice controls, and the hidden demo sequence.
   - Verify all 18 routes and key flows at phone and desktop sizes, checking overflow, keyboard access, focus, captions, route metadata, and build health.

## Technical details
- Keep the existing TanStack Start architecture while implementing the requested user experience; use existing persisted Zustand stores and service interfaces.
- Use browser capabilities only through the existing REAL/MOCK/FUTURE service boundary and preserve safe fallbacks when permissions or AI are unavailable.
- Reuse the single supplied avatar image for approved states until additional matching transparent pose and mouth assets are supplied; do not invent or generate alternate character art.
- Keep every screen usable without a model response, with local quick phrases, signs, speech, raw detections, and the simulated emergency flow available.