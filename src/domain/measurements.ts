import { type LengthUnit, fromCm, roundForDisplay } from "./units";

/** The P0 body measurements (FR-011). Values are canonical centimetres. */
export interface BodyMeasurementsCm {
  heightCm: number;
  chestCm: number;
  waistCm: number;
  hipsCm: number;
  shoulderWidthCm: number;
  inseamCm: number;
}

export type MeasurementKey = keyof BodyMeasurementsCm;

export interface MeasurementSpec {
  key: MeasurementKey;
  label: string;
  help: string;
  minCm: number;
  maxCm: number;
  stepCm: number;
}

/**
 * Accepted input ranges. These are UI sanity bounds for the prototype, not
 * anthropometric limits; widen them once a calibrated body model is chosen.
 */
export const MEASUREMENT_SPECS: readonly MeasurementSpec[] = [
  { key: "heightCm", label: "Height", help: "Standing height without shoes.", minCm: 140, maxCm: 210, stepCm: 0.5 },
  { key: "chestCm", label: "Chest / bust", help: "Around the fullest part of the chest.", minCm: 70, maxCm: 150, stepCm: 0.5 },
  { key: "waistCm", label: "Waist", help: "Around the natural waist.", minCm: 55, maxCm: 150, stepCm: 0.5 },
  { key: "hipsCm", label: "Hips", help: "Around the fullest part of the hips.", minCm: 70, maxCm: 160, stepCm: 0.5 },
  { key: "shoulderWidthCm", label: "Shoulder width", help: "Straight across the back, shoulder point to shoulder point.", minCm: 30, maxCm: 56, stepCm: 0.5 },
  { key: "inseamCm", label: "Inseam", help: "Crotch to floor along the inside leg.", minCm: 55, maxCm: 100, stepCm: 0.5 },
] as const;

export const DEFAULT_MEASUREMENTS: BodyMeasurementsCm = {
  heightCm: 170,
  chestCm: 94,
  waistCm: 80,
  hipsCm: 98,
  shoulderWidthCm: 42,
  inseamCm: 78,
};

export function getSpec(key: MeasurementKey): MeasurementSpec {
  const spec = MEASUREMENT_SPECS.find((s) => s.key === key);
  if (!spec) throw new Error(`Unknown measurement: ${key}`);
  return spec;
}

export interface ValidationIssue {
  key: MeasurementKey | "form";
  message: string;
}

function rangeMessage(spec: MeasurementSpec, unit: LengthUnit): string {
  const min = roundForDisplay(fromCm(spec.minCm, unit));
  const max = roundForDisplay(fromCm(spec.maxCm, unit));
  return `${spec.label} must be between ${min} and ${max} ${unit}.`;
}

/**
 * Validate a full measurement set (FR-015). `unit` only affects how errors
 * are worded so they match what the customer typed.
 */
export function validateMeasurements(m: BodyMeasurementsCm, unit: LengthUnit = "cm"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const spec of MEASUREMENT_SPECS) {
    const v = m[spec.key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      issues.push({ key: spec.key, message: `${spec.label} must be a number.` });
    } else if (v < spec.minCm || v > spec.maxCm) {
      issues.push({ key: spec.key, message: rangeMessage(spec, unit) });
    }
  }
  if (issues.length > 0) return issues;

  // Cross-field plausibility. Kept loose: these catch typos, not body diversity.
  const inseamRatio = m.inseamCm / m.heightCm;
  if (inseamRatio < 0.37 || inseamRatio > 0.56) {
    issues.push({ key: "inseamCm", message: "Inseam looks unusual for this height. Please double-check both values." });
  }
  if (m.shoulderWidthCm > m.chestCm * 0.6) {
    issues.push({ key: "shoulderWidthCm", message: "Shoulder width looks large relative to chest. Shoulder width is measured straight across, not around." });
  }
  return issues;
}

export function isValid(m: BodyMeasurementsCm): boolean {
  return validateMeasurements(m).length === 0;
}
