# Stage 2 adaptive experience

## Goal
Complete only the requested adaptive onboarding, dashboard, profile, and settings experience while preserving the Stage 1 design system and `INAIAvatar` implementation.

## Build
1. **Onboarding experience**
   - Rebuild intro, setup, and confirmation to match the references and supplied copy.
   - Use the existing avatar with `wave`, `thinking`, and `thumbs_up` gestures.
   - Add muted-aware spoken lines with simultaneous visible captions, accessible multi-select cards, disabled guidance, edit mode, and explicit profile saving before entering Home.

2. **Adaptive module system**
   - Define the typed module registry with icons, accents, requirements, priorities, urgency boosts, sizes, and render components.
   - Resolve modules generically from profile requirements, promote active alerts for 30 seconds, assign display sizes, cap the grid at five, and expose overflow in a bottom sheet.
   - Keep the emergency shortcut pinned outside the grid.

3. **Adaptive Home**
   - Add the complete header, profile-generated INAI status message, and all seven requested mock preview cards.
   - Load the latest three assistance events from the signed-in anonymous cloud session, with a safe empty state.
   - Animate profile-driven grid changes over 250ms, adapt bottom navigation immediately, announce updates through voice and captions, and add the temporary development toggles.
   - Add the floating Ask INAI control with the avatar edge treatment.

4. **Profile and Settings**
   - Build profile rows, edit links, reset behavior, assistance shortcuts, reassurance copy, and marginalia.
   - Build every requested setting control, instant text/contrast effects, appearance choices, privacy row, and a service-mode sheet powered by the registry.
   - Persist each setting change immediately to Lovable Cloud while retaining local offline behavior.

5. **Verification**
   - Check keyboard selection, edit-mode return behavior, muted speech, dashboard adaptation, overflow sheet, settings persistence, event loading, and route metadata.
   - Validate phone and desktop layouts, console/runtime output, and the latest preview build result.

## Technical details
- Split the oversized screen file into focused Stage 2 components and dashboard modules without altering unrelated Stage 3–5 screens.
- Use the existing Zustand store, browser TTS service, generated cloud client, semantic tokens, shadcn controls, and Motion animations.
- Keep sensor cards explicitly mock previews; add no camera, microphone, lip-sync, or AI calls.