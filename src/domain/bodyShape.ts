import type { BodyMeasurementsCm } from "./measurements";

/**
 * PROTOTYPE body-shape mapping (FR-013).
 *
 * Turns measurements into proportions for a simple parametric mannequin.
 * Landmark heights use fixed fractions of stature and torso cross-sections
 * are ellipses whose perimeter matches the entered circumference. This is
 * enough to make the avatar respond in the expected direction; it is NOT an
 * anatomically calibrated body model (see PRD FR-016).
 *
 * Coordinates: metres, +Y up, feet on Y=0, avatar faces +Z.
 */

export interface Ellipse {
  /** Half-width (X). */
  rx: number;
  /** Half-depth (Z). */
  rz: number;
}

export interface BodyShape {
  heightM: number;
  y: {
    knee: number;
    crotch: number;
    hip: number;
    waist: number;
    chest: number;
    shoulder: number;
    neck: number;
    headCenter: number;
  };
  sections: { hips: Ellipse; waist: Ellipse; chest: Ellipse };
  shoulderHalfWidthM: number;
  headRadiusM: number;
  neckRadiusM: number;
  thighRadiusM: number;
  calfRadiusM: number;
  upperArmRadiusM: number;
  armLengthM: number;
  legOffsetXM: number;
}

/** Anchor points garments attach to in the static fitting mode. */
export type GarmentAnchor = "shoulder" | "waist";

/** Depth-to-width ratios of the torso cross-sections. Fixed for the prototype. */
const DEPTH_RATIO = { hips: 0.8, waist: 0.78, chest: 0.72 } as const;

/** Ramanujan's approximation of an ellipse perimeter. */
export function ellipsePerimeter(rx: number, rz: number): number {
  return Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz)));
}

/** Ellipse whose perimeter equals `circumference` with depth = ratio × width. */
export function ellipseFromCircumference(circumference: number, depthRatio: number): Ellipse {
  const k = depthRatio;
  const factor = Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k)));
  const rx = circumference / factor;
  return { rx, rz: rx * k };
}

export function sectionFromCircumferenceCm(cm: number, part: keyof typeof DEPTH_RATIO): Ellipse {
  return ellipseFromCircumference(cm / 100, DEPTH_RATIO[part]);
}

export function computeBodyShape(m: BodyMeasurementsCm): BodyShape {
  const H = m.heightCm / 100;
  const crotch = clamp(m.inseamCm / 100, 0.37 * H, 0.56 * H);
  const hip = crotch + 0.05 * H;
  const waist = Math.max(0.61 * H, hip + 0.05 * H);
  const shoulder = 0.815 * H;
  const chest = Math.min(0.72 * H, shoulder - 0.06 * H);
  const neck = 0.86 * H;
  const headRadius = 0.062 * H;

  const hips = sectionFromCircumferenceCm(m.hipsCm, "hips");
  const thighRadius = (0.6 * m.hipsCm) / 100 / (2 * Math.PI);

  return {
    heightM: H,
    y: {
      knee: crotch * 0.53,
      crotch,
      hip,
      waist,
      chest,
      shoulder,
      neck,
      headCenter: H - headRadius,
    },
    sections: {
      hips,
      waist: sectionFromCircumferenceCm(m.waistCm, "waist"),
      chest: sectionFromCircumferenceCm(m.chestCm, "chest"),
    },
    shoulderHalfWidthM: m.shoulderWidthCm / 200,
    headRadiusM: headRadius,
    neckRadiusM: 0.054 * (H / 1.7),
    thighRadiusM: thighRadius,
    calfRadiusM: thighRadius * 0.62,
    upperArmRadiusM: (0.31 * m.chestCm) / 100 / (2 * Math.PI),
    armLengthM: 0.36 * H,
    legOffsetXM: Math.max(hips.rx - thighRadius, thighRadius * 0.6),
  };
}

export function anchorY(shape: BodyShape, anchor: GarmentAnchor): number {
  return anchor === "shoulder" ? shape.y.shoulder : shape.y.waist;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Arms hang away from the body (A-pose) so sleeves and arms clear the torso. */
export const ARM_ABDUCTION_RAD = (24 * Math.PI) / 180;

/** Shoulder joint centre for side +1 (avatar's left, +X) or -1. */
export function shoulderJoint(shape: BodyShape, side: 1 | -1): [number, number, number] {
  return [side * (shape.shoulderHalfWidthM - shape.upperArmRadiusM * 0.6), shape.y.shoulder - shape.upperArmRadiusM * 0.8, 0];
}

/** Unit direction the arm points in the A-pose. */
export function armDirection(side: 1 | -1): [number, number, number] {
  return [side * Math.sin(ARM_ABDUCTION_RAD), -Math.cos(ARM_ABDUCTION_RAD), 0];
}
