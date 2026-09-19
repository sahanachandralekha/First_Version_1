import type { VisionDetection } from "./vision";

/**
 * Deterministic, non-fabricating scene reading.
 *
 * Everything here is derived from the boxes the detector actually returned:
 * where they sit across the frame (left / centre / right) and how close they
 * roughly are. Nothing is invented, and low-confidence frames get cautious
 * wording instead of a confident instruction.
 */

export type Zone = "left" | "center" | "right";

export interface SceneReading {
  /** One short, plain-English sentence for voice and captions. */
  message: string;
  /** Zones that currently hold something worth mentioning. */
  blocked: Zone[];
  /** True when nothing relevant is close enough to matter. */
  clear: boolean;
  /** "low" when the detector was unsure, so wording stays cautious. */
  certainty: "low" | "good";
  /** Stable key so the same reading is not spoken again and again. */
  key: string;
}

/** Objects that are never worth a navigation sentence. */
const IGNORED = new Set(["pathway", "cell phone", "cup", "bottle", "book", "remote", "mouse", "keyboard"]);

/** Anything closer than this is treated as relevant to the next few steps. */
const RELEVANT_METRES = 6;

function zoneOf(detection: VisionDetection, frameWidth: number): Zone {
  const centre = (detection.box.x + detection.box.width / 2) / Math.max(1, frameWidth);
  if (centre < 0.38) return "left";
  if (centre > 0.62) return "right";
  return "center";
}

function listPeople(count: number) {
  if (count === 1) return "There is a person";
  if (count === 2) return "There are two people";
  return `There are ${count} people`;
}

/** Builds the sentence for a set of detections. Frame width comes from the video. */
export function readScene(detections: VisionDetection[], frameWidth: number): SceneReading {
  const relevant = detections.filter(
    (detection) => !IGNORED.has(detection.rawClass) && detection.approxDistance <= RELEVANT_METRES,
  );

  if (relevant.length === 0) {
    return {
      message: "The path looks clear. You can walk straight.",
      blocked: [], clear: true, certainty: "good", key: "clear",
    };
  }

  const certainty = relevant.every((detection) => detection.confidence < 0.6) ? "low" : "good";
  if (certainty === "low") {
    return {
      message: "I can see something ahead. Please move carefully.",
      blocked: [], clear: false, certainty: "low", key: "unsure",
    };
  }

  const byZone: Record<Zone, VisionDetection[]> = { left: [], center: [], right: [] };
  for (const detection of relevant) byZone[zoneOf(detection, frameWidth)].push(detection);

  const blocked = (Object.keys(byZone) as Zone[]).filter((zone) => byZone[zone].length > 0);
  const openSides = (["left", "right"] as const).filter((side) => byZone[side].length === 0);

  const describe = (zone: Zone) => {
    const items = byZone[zone];
    const people = items.filter((item) => item.rawClass === "person").length;
    if (people === items.length && people > 0) return listPeople(people).toLowerCase();
    if (items.length === 1) return `a ${items[0]!.label.toLowerCase()}`;
    return "some obstacles";
  };

  const centreBusy = byZone["center"].length > 0;

  let message: string;
  if (centreBusy && blocked.length === 1) {
    const people = byZone["center"].filter((item) => item.rawClass === "person").length;
    if (people === byZone["center"].length) {
      message = `${listPeople(people)} in front of you. Please move carefully around them.`;
    } else {
      message = "There is an obstacle in front of you. Please slow down.";
    }
    if (openSides.length === 1) message += ` The ${openSides[0]} side looks clear.`;
  } else if (!centreBusy && byZone["right"].length > 0 && byZone["left"].length === 0) {
    const what = describe("right");
    message = `There ${what.startsWith("there are") || what.includes("people") ? "are" : "is"} ${what.replace(/^there (is|are) /, "")} on your right. The left side looks clear, so you can move left.`;
  } else if (!centreBusy && byZone["left"].length > 0 && byZone["right"].length === 0) {
    const what = describe("left");
    message = `There ${what.includes("people") ? "are" : "is"} ${what.replace(/^there (is|are) /, "")} on your left. The right side looks clear, so you can move right.`;
  } else if (blocked.length >= 2 && openSides.length === 1) {
    message = `There are obstacles ahead and on your ${openSides[0] === "left" ? "right" : "left"}. Please move carefully toward the ${openSides[0]}.`;
  } else {
    message = "There are obstacles around you. Please slow down and move carefully.";
  }

  return { message, blocked, clear: false, certainty: "good", key: `${blocked.join("-")}|${message}` };
}
