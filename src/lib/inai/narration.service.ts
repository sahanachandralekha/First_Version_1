import type {
  VisionAnalysisResult,
  NavigationDecision,
  PathStatus,
  RecommendedAction,
  Position,
  Proximity,
  HazardSeverity,
  ObjectMovement,
  DetectedObject,
  DetectedHazard,
} from "./vision-models";

export interface NarrationSettings {
  speechCooldownSeconds: number;
  criticalCooldownSeconds: number;
}

const DEFAULT_SETTINGS: NarrationSettings = {
  speechCooldownSeconds: 3.5,
  criticalCooldownSeconds: 1.0,
};

export class NarrationService {
  private settings: NarrationSettings;

  constructor(settings: Partial<NarrationSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  evaluateNavigationFrame(
    current: VisionAnalysisResult,
    prevResult: VisionAnalysisResult | null,
    lastSpokenMessage: string | null,
    lastSpokenTime: number | null,
    consecutiveClearCount: number = 0
  ): NavigationDecision {
    const now = Date.now() / 1000;
    const timeSinceSpeech = lastSpokenTime ? now - lastSpokenTime : 999.0;

    // Step 1: Detect Critical Hazards
    const criticalDecision = this.checkCriticalHazards(current, prevResult);
    if (criticalDecision) {
      const isSameAsLast = lastSpokenMessage === criticalDecision.guidanceText;
      if (!isSameAsLast || timeSinceSpeech > this.settings.criticalCooldownSeconds) {
        return criticalDecision;
      }
    }

    // Step 2: Detect High Hazards (Holes, Stairs, Curbs, Uneven ground)
    const hazardDecision = this.checkHazards(current, prevResult);
    if (hazardDecision) {
      if (lastSpokenMessage !== hazardDecision.guidanceText || timeSinceSpeech > this.settings.speechCooldownSeconds) {
        return hazardDecision;
      }
    }

    // Step 3: Detect Approaching Vehicles or Moving Objects
    const movingObjDecision = this.checkMovingObjects(current, prevResult);
    if (movingObjDecision) {
      if (lastSpokenMessage !== movingObjDecision.guidanceText || timeSinceSpeech > this.settings.speechCooldownSeconds) {
        return movingObjDecision;
      }
    }

    // Step 4: Detect Obstacle Changes (New, Closer, Moved into path)
    const obstacleDecision = this.checkObstacles(current, prevResult);
    if (obstacleDecision) {
      if (lastSpokenMessage !== obstacleDecision.guidanceText || timeSinceSpeech > this.settings.speechCooldownSeconds) {
        return obstacleDecision;
      }
    }

    // Step 5: Detect Path Status Transitions (e.g. Blocked -> Clear, or Clear -> Caution)
    const statusDecision = this.checkStatusTransitions(current, prevResult, consecutiveClearCount);
    if (statusDecision) {
      if (lastSpokenMessage !== statusDecision.guidanceText || timeSinceSpeech > this.settings.speechCooldownSeconds) {
        return statusDecision;
      }
    }

    // Step 6: Periodic Affirmation if Clear for a prolonged time (e.g., every 15 seconds)
    if (current.pathStatus === "CLEAR" && timeSinceSpeech > 15.0) {
      return {
        shouldSpeak: true,
        guidanceText: "The path ahead appears clear. You can continue.",
        urgency: "NORMAL",
        pathStatus: "CLEAR",
        recommendedAction: "CONTINUE",
        isNewEvent: false,
        visionResult: current,
      };
    }

    // Default: Path unchanged, stay silent
    const displayText = this.generateDisplayText(current);
    return {
      shouldSpeak: false,
      guidanceText: displayText,
      urgency: "NORMAL",
      pathStatus: current.pathStatus,
      recommendedAction: current.recommendedAction,
      isNewEvent: false,
      visionResult: current,
    };
  }

  private checkCriticalHazards(
    current: VisionAnalysisResult,
    _prev: VisionAnalysisResult | null
  ): NavigationDecision | null {
    for (const h of current.hazards || []) {
      const isCritical =
        h.severity === "critical" ||
        h.proximity === "very_close" ||
        current.pathStatus === "DANGER" ||
        current.recommendedAction === "STOP";

      if (isCritical && h.blocksPath) {
        const loc = this.formatPosition(h.position);
        const hName = h.type.toLowerCase();

        let text: string;
        if (hName.includes("hole") || hName.includes("pothole") || hName.includes("drain") || hName.includes("drop")) {
          text = `Stop. There is a ${hName} directly in front of you.`;
        } else if (hName.includes("vehicle") || hName.includes("car")) {
          text = "Stop. A vehicle is directly in front of you.";
        } else {
          text = `Stop. There is a hazard ${loc}.`;
        }

        return {
          shouldSpeak: true,
          guidanceText: text,
          urgency: "CRITICAL",
          pathStatus: "DANGER",
          recommendedAction: "STOP",
          isNewEvent: true,
          visionResult: current,
        };
      }
    }

    for (const obj of current.objects || []) {
      if (obj.blocksPath && obj.proximity === "very_close") {
        const objType = obj.type.charAt(0).toUpperCase() + obj.type.slice(1);
        const text = `Stop. ${objType} is directly ahead.`;
        return {
          shouldSpeak: true,
          guidanceText: text,
          urgency: "CRITICAL",
          pathStatus: "DANGER",
          recommendedAction: "STOP",
          isNewEvent: true,
          visionResult: current,
        };
      }
    }

    return null;
  }

  private checkHazards(
    current: VisionAnalysisResult,
    _prev: VisionAnalysisResult | null
  ): NavigationDecision | null {
    for (const h of current.hazards || []) {
      const hName = h.type.toLowerCase();
      const loc = this.formatPosition(h.position);

      if (hName.includes("hole") || hName.includes("pothole") || hName.includes("drain")) {
        const text =
          h.confidence < 0.7
            ? `There may be a hole or uneven area ${loc}. Please be careful.`
            : `There is a ${hName} ${loc}. Please avoid it.`;
        return {
          shouldSpeak: true,
          guidanceText: text,
          urgency: "HIGH",
          pathStatus: h.blocksPath ? "DANGER" : "CAUTION",
          recommendedAction: current.recommendedAction,
          isNewEvent: true,
          visionResult: current,
        };
      } else if (hName.includes("stair") || hName.includes("step")) {
        return {
          shouldSpeak: true,
          guidanceText: `There are stairs or steps ${loc}. Please be careful.`,
          urgency: "HIGH",
          pathStatus: "CAUTION",
          recommendedAction: "CAUTION",
          isNewEvent: true,
          visionResult: current,
        };
      } else if (hName.includes("uneven") || hName.includes("curb") || hName.includes("drop")) {
        return {
          shouldSpeak: true,
          guidanceText: `The ground ${loc} looks uneven. Please proceed with caution.`,
          urgency: "HIGH",
          pathStatus: "CAUTION",
          recommendedAction: "CAUTION",
          isNewEvent: true,
          visionResult: current,
        };
      }
    }

    return null;
  }

  private checkMovingObjects(
    current: VisionAnalysisResult,
    _prev: VisionAnalysisResult | null
  ): NavigationDecision | null {
    for (const obj of current.objects || []) {
      if (obj.movement === "approaching") {
        const loc = this.formatPosition(obj.position);
        const objName = obj.type.toLowerCase();
        if (
          objName.includes("vehicle") ||
          objName.includes("car") ||
          objName.includes("bike") ||
          objName.includes("bicycle")
        ) {
          const isClose = obj.proximity === "very_close" || obj.proximity === "near";
          const urgency = isClose ? "CRITICAL" : "HIGH";
          const action: RecommendedAction = isClose ? "STOP" : "SLOW_DOWN";
          const text = isClose
            ? `Stop. A ${objName} is approaching from ${loc}.`
            : `There is a ${objName} approaching from ${loc}.`;

          return {
            shouldSpeak: true,
            guidanceText: text,
            urgency,
            pathStatus: urgency === "CRITICAL" ? "DANGER" : "CAUTION",
            recommendedAction: action,
            isNewEvent: true,
            visionResult: current,
          };
        }
      }
    }
    return null;
  }

  private checkObstacles(
    current: VisionAnalysisResult,
    prev: VisionAnalysisResult | null
  ): NavigationDecision | null {
    const currentBlocking = (current.objects || []).filter((o) => o.blocksPath);
    const prevBlocking = (prev?.objects || []).filter((o) => o.blocksPath);

    if (currentBlocking.length > 0) {
      const primary = currentBlocking[0]!;
      const loc = this.formatPosition(primary.position);
      const objName = primary.type.toLowerCase();

      if (prevBlocking.length > 0) {
        const prevPrimary = prevBlocking[0]!;
        const isCloser =
          (prevPrimary.proximity === "far" && (primary.proximity === "medium" || primary.proximity === "near")) ||
          (prevPrimary.proximity === "medium" && primary.proximity === "near") ||
          (prevPrimary.proximity === "near" && primary.proximity === "very_close");

        if (isCloser) {
          return {
            shouldSpeak: true,
            guidanceText: `Please slow down. The ${objName} is getting closer.`,
            urgency: "HIGH",
            pathStatus: "OBSTACLE",
            recommendedAction: "SLOW_DOWN",
            isNewEvent: true,
            visionResult: current,
          };
        }
      }

      if (prevBlocking.length === 0) {
        let spaceInfo = "";
        if (current.recommendedAction === "AVOID_LEFT") {
          spaceInfo = " There appears to be space on your left.";
        } else if (current.recommendedAction === "AVOID_RIGHT") {
          spaceInfo = " There appears to be space on your right.";
        }

        return {
          shouldSpeak: true,
          guidanceText: `There is a ${objName} blocking the path ${loc}.${spaceInfo}`,
          urgency: "HIGH",
          pathStatus: "OBSTACLE",
          recommendedAction: current.recommendedAction,
          isNewEvent: true,
          visionResult: current,
        };
      }
    }

    return null;
  }

  private checkStatusTransitions(
    current: VisionAnalysisResult,
    prev: VisionAnalysisResult | null,
    _consecutiveClearCount: number
  ): NavigationDecision | null {
    if (!prev) {
      const text = this.generateDisplayText(current);
      return {
        shouldSpeak: true,
        guidanceText: text,
        urgency: "NORMAL",
        pathStatus: current.pathStatus,
        recommendedAction: current.recommendedAction,
        isNewEvent: true,
        visionResult: current,
      };
    }

    if (
      (prev.pathStatus === "OBSTACLE" || prev.pathStatus === "DANGER" || prev.pathStatus === "CAUTION") &&
      current.pathStatus === "CLEAR"
    ) {
      return {
        shouldSpeak: true,
        guidanceText: "The path ahead appears clear. You can continue.",
        urgency: "NORMAL",
        pathStatus: "CLEAR",
        recommendedAction: "CONTINUE",
        isNewEvent: true,
        visionResult: current,
      };
    }

    if (current.pathStatus === "UNKNOWN" && prev.pathStatus !== "UNKNOWN") {
      return {
        shouldSpeak: true,
        guidanceText: "I cannot clearly determine the path ahead. Please be cautious.",
        urgency: "NORMAL",
        pathStatus: "UNKNOWN",
        recommendedAction: "CAUTION",
        isNewEvent: true,
        visionResult: current,
      };
    }

    return null;
  }

  formatPosition(pos: Position): string {
    if (pos === "left") return "slightly to your left";
    if (pos === "right") return "slightly to your right";
    return "directly ahead";
  }

  generateDisplayText(result: VisionAnalysisResult): string {
    if (result.singleObservationDescription) {
      return result.singleObservationDescription;
    }
    if (result.pathStatus === "CLEAR") {
      return "The path ahead appears clear.";
    }
    if (result.pathStatus === "DANGER") {
      return "Danger ahead. Please stop.";
    }
    if (result.pathStatus === "OBSTACLE") {
      return result.pathDescription || "There is an obstacle ahead.";
    }
    if (result.pathStatus === "CAUTION") {
      return result.pathDescription || "Caution: the path ahead requires attention.";
    }
    return "Observing forward environment...";
  }

  /**
   * Generates a rich, intelligent single observation description explaining the scene
   * and providing actionable guidance when synthesizing from local detection frames.
   */
  generateFallbackObservationDescription(
    objects: Array<{ label: string; position?: "left" | "center" | "right"; approxDistance?: number; confidence?: number }>,
    pathStatus: PathStatus = "CLEAR"
  ): string {
    if (objects.length === 0) {
      return "The forward camera view appears open and free of immediate obstacles. The path ahead appears clear.";
    }

    const byPos = {
      center: objects.filter((o) => !o.position || o.position === "center"),
      left: objects.filter((o) => o.position === "left"),
      right: objects.filter((o) => o.position === "right"),
    };

    const centerPeople = byPos.center.filter((o) => o.label.toLowerCase() === "person");
    const leftPeople = byPos.left.filter((o) => o.label.toLowerCase() === "person");
    const rightPeople = byPos.right.filter((o) => o.label.toLowerCase() === "person");

    const hasLeft = byPos.left.length > 0;
    const hasCenter = byPos.center.length > 0;
    const hasRight = byPos.right.length > 0;

    // Case 1: Multiple people in front blocking path
    if (centerPeople.length >= 2) {
      if (!hasRight) {
        return "Two people are directly in front of you and the path is blocked. There is open space on your right, so you can move on the right side.";
      } else if (!hasLeft) {
        return "Two people are directly in front of you and the path is blocked. There is open space on your left, so you can move on the left side.";
      } else {
        return "Two people are directly in front of you and the path is blocked. Please pause a moment, ask them to excuse you, or wait for the path to clear.";
      }
    }

    // Case 2: One person in center
    if (centerPeople.length === 1) {
      if (!hasRight) {
        return "A person is directly in front of you and the path is blocked. There is clear space on your right, so you can move on the right side.";
      } else if (!hasLeft) {
        return "A person is directly in front of you and the path is blocked. There is clear space on your left, so you can move on the left side.";
      } else {
        return "A person is directly in front of you and the path is blocked on both sides. Please pause a moment and ask them to move.";
      }
    }

    // Case 3: Person / Item on Left only
    if (hasLeft && !hasRight && !hasCenter) {
      const isPerson = leftPeople.length > 0;
      const name = isPerson ? "person" : byPos.left[0]?.label.toLowerCase() || "obstacle";
      return `The ${name} is detected on your left and there is space on your right, so you can move on the right side.`;
    }

    // Case 4: Person / Item on Right only
    if (hasRight && !hasLeft && !hasCenter) {
      const isPerson = rightPeople.length > 0;
      const name = isPerson ? "person" : byPos.right[0]?.label.toLowerCase() || "obstacle";
      return `The ${name} is detected on your right and there is space on your left, so you can move on the left side.`;
    }

    // Case 5: Left and Right both have items, Center is clear
    if (hasLeft && hasRight && !hasCenter) {
      return "There are obstacles on your left and right, but the center path is open. You can walk straight ahead with care.";
    }

    // Default detailed description
    const parts: string[] = [];
    if (byPos.center.length > 0) {
      const items = byPos.center.map((d) => `a ${d.label.toLowerCase()}${d.approxDistance ? ` about ${Math.round(d.approxDistance)} metres away` : ""}`).join(" and ");
      parts.push(`Directly in front of you, there is ${items}.`);
    }
    if (byPos.left.length > 0) {
      const items = byPos.left.map((d) => `a ${d.label.toLowerCase()}${d.approxDistance ? ` about ${Math.round(d.approxDistance)} metres away` : ""}`).join(" and ");
      parts.push(`To your left, there is ${items}.`);
    }
    if (byPos.right.length > 0) {
      const items = byPos.right.map((d) => `a ${d.label.toLowerCase()}${d.approxDistance ? ` about ${Math.round(d.approxDistance)} metres away` : ""}`).join(" and ");
      parts.push(`To your right, there is ${items}.`);
    }

    let pathSummary = "The forward path appears clear to continue.";
    if (pathStatus === "OBSTACLE" || byPos.center.length > 0) {
      if (!hasRight) {
        pathSummary = "The center is occupied, but there is space on your right to move.";
      } else if (!hasLeft) {
        pathSummary = "The center is occupied, but there is space on your left to move.";
      } else {
        pathSummary = "The path ahead is blocked; please pause and move carefully.";
      }
    } else if (pathStatus === "CAUTION") {
      pathSummary = "Please proceed cautiously and check your footing.";
    }

    return `${parts.join(" ")} ${pathSummary}`.trim();
  }
}

export const narrationService = new NarrationService();
