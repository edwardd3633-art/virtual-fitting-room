import { type BodyShape, type Ellipse, shoulderJoint } from "./bodyShape";

/**
 * Body regions the try-on screen can point at: where a measurement is taken,
 * and where a garment came out smaller than the avatar. Regions are located
 * by landmark height only, so they are approximate by design.
 */
export type FitRegion = "shoulder" | "chest" | "waist" | "hip" | "sleeve";

export const REGION_LABELS: Record<FitRegion, string> = {
  shoulder: "Shoulders",
  chest: "Chest",
  waist: "Waist",
  hip: "Hips",
  sleeve: "Sleeves",
};

/** Display order, top to bottom. */
export const REGION_ORDER: readonly FitRegion[] = ["shoulder", "chest", "waist", "hip", "sleeve"];

/**
 * Region for a point on the torso at height `y` (m, avatar space). Boundaries
 * sit halfway between neighbouring landmarks.
 */
export function torsoRegionAt(shape: BodyShape, y: number): Exclude<FitRegion, "sleeve"> {
  const { shoulder, chest, waist, hip } = shape.y;
  if (y > (shoulder + chest) / 2) return "shoulder";
  if (y > (chest + waist) / 2) return "chest";
  if (y > (waist + hip) / 2) return "waist";
  return "hip";
}

/** What the viewport draws for a region: a tape around the body, a span between two points, or nothing. */
export type FocusMarker =
  | { kind: "ring"; y: number; section: Ellipse }
  | { kind: "span"; y: number; halfWidth: number }
  | { kind: "none" };

export interface RegionFocus {
  region: FitRegion;
  /** Height the camera should look at (m). */
  y: number;
  marker: FocusMarker;
}

/** Where to look and what to draw for a region on this body. */
export function regionFocus(shape: BodyShape, region: FitRegion): RegionFocus {
  switch (region) {
    case "shoulder":
      return { region, y: shape.y.shoulder, marker: { kind: "span", y: shape.y.shoulder, halfWidth: shape.shoulderHalfWidthM } };
    case "chest":
      return { region, y: shape.y.chest, marker: { kind: "ring", y: shape.y.chest, section: shape.sections.chest } };
    case "waist":
      return { region, y: shape.y.waist, marker: { kind: "ring", y: shape.y.waist, section: shape.sections.waist } };
    case "hip":
      return { region, y: shape.y.hip, marker: { kind: "ring", y: shape.y.hip, section: shape.sections.hips } };
    case "sleeve": {
      // Mid upper arm: sleeves end around there on a tee.
      const [, jy] = shoulderJoint(shape, 1);
      return { region, y: jy - shape.armLengthM * 0.2, marker: { kind: "none" } };
    }
  }
}
