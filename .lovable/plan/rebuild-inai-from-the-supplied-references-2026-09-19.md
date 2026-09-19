# Rebuild INAI from the supplied references

## Goal
Match the supplied INAI screens closely, use the uploaded INAI character consistently, and connect all visible controls to the existing adaptive state and browser capabilities.

## Build stages
1. **Shared visual system and avatar**
   - Keep the exact white/soft-blue palette, Plus Jakarta Sans typography, rounded cards, spacing, and mobile proportions from the references.
   - Register the uploaded transparent character as the canonical avatar and reuse it across every screen without generating variants.
   - Refine shared headers, navigation, alerts, captions, buttons, and status treatments.

2. **Entry and onboarding**
   - Build Splash, Meet INAI, needs selection, and confirmation screens.
   - Persist any combination of Visual, Hearing, and Speech needs and update the experience immediately.

3. **Daily assistance**
   - Build the adaptive Home dashboard, Environment Assist, Live Monitoring, warning overlay, Sound Awareness, and Transcription.
   - Connect camera, microphone, speech, alerts, haptics, and degraded permission states through the existing services.

4. **Communication, navigation, and safety**
   - Build Express Yourself, verified ISL phrase playback, map guidance, emergency hold flow, INAI conversation, and full-screen guidance.
   - Clearly label simulated capabilities and never imply real emergency dispatch or unverified sign translation.

5. **Profile, settings, and verification**
   - Build live profile controls and all requested settings, including service-mode disclosure and Demo Mode.
   - Verify every route and key interaction on mobile and desktop, including keyboard access, large text, high contrast, reduced motion, and no overflow.

## Technical details
- Preserve TanStack Start routing, React 19, Tailwind v4, Zustand persistence, the service interfaces, and the adaptive resolver.
- Use local/generated imagery only for environmental camera scenes; the uploaded character remains the sole INAI character asset.
- Keep AI secrets server-side and defer database schema and AI endpoints to their requested backend stage.
