# INAI

INAI is an adaptive accessibility companion that combines visual guidance, sound awareness, live transcription, communication support, reviewed Indian Sign Language references, navigation, and clearly simulated emergency demonstrations. It adapts its navigation and dashboard to the assistance areas each person chooses.

## Adaptive architecture

The persisted accessibility profile controls the dashboard resolver and five-slot navigation without per-combination page branches. Sensor events are normalized, ranked for relevance and urgency, and routed through visual, caption, speech, sign, and haptic channels. Critical events from vision, sound, or Demo Mode use the same global Smart Alert.

The app uses TanStack Start, React, TypeScript, Tailwind CSS, Zustand, TanStack Query, Motion, and Lovable Cloud. Run locally with `bun install` and `bun run dev`.

## Service modes

| Capability | Mode | Boundary |
| --- | --- | --- |
| Browser speech output and lip sync | REAL | Uses available browser voices; unavailable voices degrade to visible captions. |
| Browser speech recognition | REAL | Browser support and microphone permission are required. |
| Camera object recognition | REAL | Runs a lazily loaded on-device model and does not promise perfect detection. |
| Sound classification | REAL | Uses on-device audio heuristics; direction and distance remain simulated. |
| AI understanding | REAL | Sends only the explicit text or selected frame needed for a request. |
| Accessible campus places | MOCK | Seeded demonstration locations, clearly labelled in the interface. |
| Indoor route position and distance | MOCK | Demonstration values, not precise localization. |
| Emergency dispatch | MOCK | Never contacts real responders; every emergency surface says SIMULATED. |
| Rive and 3D avatar drivers | FUTURE | Present only as replaceable driver interfaces. |

## Indian Sign Language policy

Only phrases in the reviewed ISL registry can appear in the sign player. Every step includes a written description and a spoken fallback. Missing approved artwork produces a text-first fallback rather than an invented gesture. INAI does not claim universal sign translation.

## Character and pose audit

Every active appearance is rendered by the shared `INAIAvatar`; screens never import an avatar driver directly. The approved transparent pose atlas is still pending, so the driver currently falls back to the same canonical INAI artwork without visual drift.

| Screen | Pose or state |
| --- | --- |
| Splash, Home, Profile, Settings, INAI chat | idle |
| Onboarding intro | wave |
| Onboarding setup | thinking |
| Onboarding confirmation | thumbs up |
| Vision, Live monitoring, Navigation | guiding / open palms |
| Sound awareness | listening / concerned when warning |
| Live transcription | listening |
| Communication | guiding |
| Sign communication | signing |
| Emergency | emergency |
| Smart Alert | warning / stop palm |

## Demo Mode

Demo Mode is off by default. Enable it in Settings to reveal the persistent Demo badge and controller. The full sequence demonstrates stairs, a siren, a classroom transcript, a communication request, a reviewed sign, and a simulated emergency. Each step also has a manual recovery trigger. Reset Demo stops speech, camera, microphone, vibration, and timers, clears local demo state, and returns to Splash.

## Safety and privacy

INAI offers assistance, not medical advice. It does not promise perfect recognition, localization, universal sign translation, or guaranteed emergency response. Camera and microphone streams stop when their screen closes. Spoken output is cancelled on navigation. The Privacy & Data screen explains stored data and provides deletion controls.
