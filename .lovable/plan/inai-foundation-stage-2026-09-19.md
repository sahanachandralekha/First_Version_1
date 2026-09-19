# INAI foundation stage

## Goal
Create the first-stage foundation for INAI without building the 18 finished screens yet. The attached screenshots remain the visual source of truth; uploaded screenshots will be treated as references, not embedded as artwork.

## Build
- Replace the blank page with an accessible INAI foundation preview that demonstrates the exact palette, typography, control sizing, cards, mode badges, and avatar states.
- Add route shells for all 18 requested URLs, each with unique INAI metadata, so later stages can fill screens without changing the navigation structure.
- Establish shared mobile screen chrome, a skip link, one main landmark, focus states, motion reduction, high contrast, and global text scaling.
- Add the adaptive five-slot bottom navigation resolver and labels for every selected-needs combination.

## State and adaptation
- Add persisted accessibility, context, and session stores with the requested data shapes and immediate profile/pref updates.
- Implement the dashboard module registry and score-based resolver, including alert promotion and a five-module cap.
- Implement normalized events, context ranking/rate limiting, and multimodal output routing as isolated foundations.

## Services
- Define typed service contracts and explicit `REAL`, `MOCK`, or `FUTURE` modes for vision, scene understanding, audio, speech, TTS, sign language, location, emergency, haptics, and demo direction.
- Add safe browser-capability implementations and honest mock fallbacks. No model keys or production claims.
- Implement queued browser speech with emergency preemption, en-IN voice preference, boundary callbacks, cancellation, and mouth activity updates.
- Define the ElevenLabs replacement contract without implementing it.
- Add the validated-sign registry model and eight seed entries; unvalidated content cannot enter the demo set and missing phrases never fabricate signs.

## Avatar system
- Create one `INAIAvatar` API and an `AvatarDriver` abstraction.
- Build the sprite driver with pose lookup, idle fallback, mouth overlay selection, caption announcements, breathing/blink/sway/sparkle motion, and reduced-motion behavior.
- Add Rive and Three driver stubs that fail clearly as not implemented.
- Prepare `/public/inai/poses/` and `/public/inai/mouths/` manifests. Because no standalone transparent pose atlas was supplied, the preview will use a respectful non-character fallback until the exact approved sprites are added; it will not generate or extract a different character.

## Cloud foundation
- Enable Lovable Cloud for the requested future authentication, persistence, storage, and protected model calls.
- In this stage, keep service contracts ready for Cloud-backed implementations; defer tables, policies, seeds, and server functions to the later backend stage unless generated integration wiring is required now.

## Technical notes
- Preserve the project’s supported React 19 + TanStack Start routing/runtime while matching the requested React/TypeScript/Tailwind/shadcn behavior. Use TanStack server functions for later app-internal model calls rather than unsupported edge-function files.
- Add only the packages needed in this foundation, including Zustand and Framer Motion. TensorFlow and Leaflet remain behind service boundaries until their screens are built, avoiding unnecessary initial weight.

## Verification
- Verify the foundation compiles through the automatic harness.
- Check the preview at mobile and desktop sizes for overflow, focusability, readable text, reduced motion, and working live profile adaptation.
- Confirm every content route has unique title, description, Open Graph text, `og:type`, and Twitter card metadata.
