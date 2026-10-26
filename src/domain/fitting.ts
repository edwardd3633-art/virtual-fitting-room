import { type BodyShape, anchorY } from "./bodyShape";
import type { GarmentAsset, ValidationLevel } from "./catalog";

/**
 * Fitting orchestration (PRD §7, FR-056).
 *
 * Business logic talks to `FittingEngine`, never to a specific solver. The
 * MVP ships one engine, `StaticAnchorEngine`, which only positions a
 * pre-made, size-specific garment mesh at a body anchor. It performs no
 * cloth simulation, no collision handling, and no deformation to the body.
 * Precomputed-animation and dynamic-cloth engines can be added behind the
 * same interface.
 */

export type FitMode = "static-anchor" | "precomputed-animation" | "dynamic-cloth";
export type Pose = "a-pose";

export interface FitRequest {
  body: BodyShape;
  asset: GarmentAsset;
  pose: Pose;
}

export interface FitResult {
  mode: FitMode;
  engineId: string;
  assetUrl: string;
  /** Where to place the garment's origin, in avatar space (metres). */
  position: [number, number, number];
  validation: ValidationLevel;
  /** Shown to the customer verbatim (FR-045, FR-047). */
  limitations: string[];
}

export interface FittingEngine {
  readonly id: string;
  readonly mode: FitMode;
  supports(req: FitRequest): boolean;
  fit(req: FitRequest): FitResult;
}

export const STATIC_MODE_LIMITATIONS = [
  "Static preview: the garment is placed on the avatar and settled onto it geometrically, not simulated. No real fabric drape, stretch, or movement.",
  "Where the garment is smaller than the body it is pushed outside the body so it stays visible, and those areas are highlighted.",
  "Not a fit prediction and not a guarantee of how the real garment fits or feels.",
] as const;

export class StaticAnchorEngine implements FittingEngine {
  readonly id = "static-anchor-v1";
  readonly mode: FitMode = "static-anchor";

  supports(req: FitRequest): boolean {
    return req.pose === "a-pose" && req.asset.file.format === "glb" && req.asset.status === "approved";
  }

  fit(req: FitRequest): FitResult {
    return {
      mode: this.mode,
      engineId: this.id,
      assetUrl: req.asset.file.url,
      position: [0, anchorY(req.body, req.asset.anchor), 0],
      validation: req.asset.provenance.validation,
      limitations: [...STATIC_MODE_LIMITATIONS, ...req.asset.provenance.limitations],
    };
  }
}

export class NoSupportedEngineError extends Error {}

/** Pick the first engine that supports the request. Order engines from most to least capable. */
export function runFit(engines: readonly FittingEngine[], req: FitRequest): FitResult {
  const engine = engines.find((e) => e.supports(req));
  if (!engine) throw new NoSupportedEngineError("No fitting mode supports this garment and pose yet.");
  return engine.fit(req);
}

export const DEFAULT_ENGINES: readonly FittingEngine[] = [new StaticAnchorEngine()];

export const VALIDATION_LABELS: Record<ValidationLevel, string> = {
  unvalidated: "Unvalidated demo asset",
  "derived-from-retailer-measurements": "Derived from retailer measurements",
  "validated-against-physical-sample": "Validated against physical sample",
};
