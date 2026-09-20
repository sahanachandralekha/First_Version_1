export type PathStatus = "CLEAR" | "CAUTION" | "OBSTACLE" | "DANGER" | "UNKNOWN";

export type RecommendedAction =
  | "CONTINUE"
  | "CAUTION"
  | "SLOW_DOWN"
  | "AVOID_LEFT"
  | "AVOID_RIGHT"
  | "STOP"
  | "UNKNOWN";

export type Position = "center" | "left" | "right";

export type Proximity = "very_close" | "near" | "medium" | "far";

export type ObjectMovement =
  | "stationary"
  | "approaching"
  | "crossing"
  | "moving_away"
  | "unknown";

export type HazardSeverity = "critical" | "high" | "medium" | "low";

export interface DetectedObject {
  type: string;
  position: Position;
  proximity: Proximity;
  confidence: number;
  blocksPath: boolean;
  movement?: ObjectMovement;
}

export interface DetectedHazard {
  type: string;
  position: Position;
  proximity: Proximity;
  confidence: number;
  severity: HazardSeverity;
  blocksPath: boolean;
}

export interface VisionAnalysisResult {
  pathStatus: PathStatus;
  pathDescription: string;
  objects: DetectedObject[];
  hazards: DetectedHazard[];
  recommendedAction: RecommendedAction;
  confidence: number;
  singleObservationDescription?: string;
}

export interface NavigationDecision {
  shouldSpeak: boolean;
  guidanceText: string;
  urgency: "CRITICAL" | "HIGH" | "NORMAL";
  pathStatus: PathStatus;
  recommendedAction: RecommendedAction;
  isNewEvent: boolean;
  visionResult?: VisionAnalysisResult;
}
