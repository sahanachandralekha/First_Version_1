import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { createAvatarDriver } from "@/avatar/driver";
import type { AvatarRenderState, AvatarSize, AvatarState } from "@/avatar/types";
import { CaptionRegion } from "./CaptionRegion";
import fallbackAsset from "@/assets/inai-avatar.png.asset.json";

interface INAIAvatarProps {
  state?: AvatarState; gesture?: string; mouthOpenness?: number;
  gaze?: AvatarRenderState["gaze"]; size?: AvatarSize; intensity?: number;
  signSequence?: string[]; speech?: string;
}

const sizeClasses: Record<AvatarSize, string> = { xs: "size-16", sm: "size-24", md: "size-40", lg: "size-60", full: "h-[52vh] w-full" };
const labels: Record<AvatarState, string> = {
  idle: "INAI is ready", listening: "INAI is listening", thinking: "INAI is thinking",
  speaking: "INAI is speaking", warning: "INAI is sharing a warning",
  emergency: "INAI is supporting an emergency flow", signing: "INAI is demonstrating a sign",
  guiding: "INAI is guiding you",
};
const IDLE_POSE = "/inai/poses/idle_seated.png";

function SparkleDrift({ intensity }: { intensity: number }) {
  const stars = [
    { left: "10%", top: "16%", delay: 0 },
    { left: "80%", top: "28%", delay: 1.2 },
    { left: "64%", top: "6%", delay: 2.4 },
  ];
  return (
    <>
      {stars.map((s, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="absolute text-primary/40"
          style={{ left: s.left, top: s.top }}
          animate={{ y: [0, -8 * intensity, 0], opacity: [0.35, 0.9, 0.35], rotate: [0, 90, 0] }}
          transition={{ duration: 6, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
          </svg>
        </motion.span>
      ))}
    </>
  );
}

export function INAIAvatar({
  state = "idle", gesture, mouthOpenness = 0, gaze = "center", size = "md",
  intensity = 1, signSequence, speech = "",
}: INAIAvatarProps) {
  const driver = useMemo(() => createAvatarDriver(), []);
  const reduceMotion = useReducedMotion();
  const renderState: AvatarRenderState = { state, mouthOpenness, gaze, size, intensity };
  if (gesture !== undefined) renderState.gesture = gesture;
  if (signSequence !== undefined) renderState.signSequence = signSequence;

  const poseSrc = driver.getPose(renderState);
  const mouthSrc = driver.getMouth(mouthOpenness) || null;
  const [pose, setPose] = useState(poseSrc);
  const [mouth, setMouth] = useState<string | null>(mouthSrc);
  // Randomized blink timing is client-only so server and client markup match.
  const [blink, setBlink] = useState<string | undefined>(undefined);

  useEffect(() => { setPose(poseSrc); }, [poseSrc]);
  useEffect(() => { setMouth(mouthSrc); }, [mouthSrc]);
  useEffect(() => { setBlink(`inai-blink ${(3 + Math.random() * 3).toFixed(2)}s ease-in-out infinite`); }, []);

  // Missing sprite asset falls back to idle, then to the bundled character — silently.
  const onPoseError = () => {
    if (pose !== IDLE_POSE && pose !== fallbackAsset.url) setPose(IDLE_POSE);
    else if (pose !== fallbackAsset.url) setPose(fallbackAsset.url);
  };

  return (
    <div className={`relative isolate ${sizeClasses[size]}`}>
      <motion.div
        role="img"
        aria-label={labels[state]}
        data-gaze={gaze}
        className="relative size-full overflow-hidden"
        {...(reduceMotion ? {} : { animate: { rotate: [-1.5 * intensity, 1.5 * intensity, -1.5 * intensity] }, transition: { duration: 7, repeat: Infinity, ease: "easeInOut" as const } })}
      >
        <motion.div
          className="absolute inset-0"
          {...(reduceMotion ? {} : { animate: { scale: [1, 1 + 0.015 * intensity, 1] }, transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const } })}
        >
          <img
            src={pose}
            onError={onPoseError}
            alt=""
            className="absolute inset-0 size-full object-contain"
            style={reduceMotion || !blink ? undefined : { animation: blink }}
          />
          {!reduceMotion && mouth && (
            <img
              src={mouth}
              onError={() => setMouth(null)}
              alt=""
              className="absolute bottom-[18%] left-1/2 h-[6%] max-w-full -translate-x-1/2 object-contain"
            />
          )}
        </motion.div>
        {!reduceMotion && <SparkleDrift intensity={intensity} />}
      </motion.div>
      <CaptionRegion message={speech} critical={state === "warning" || state === "emergency"} />
    </div>
  );
}
