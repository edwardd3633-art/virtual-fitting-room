import { type BodyMeasurementsCm, DEFAULT_MEASUREMENTS, MEASUREMENT_SPECS } from "./measurements";
import type { LengthUnit } from "./units";

/**
 * Saved avatar profile (FR-002/FR-003). Serialized with an explicit schema
 * version so local saves can be migrated to account-backed storage later.
 */
export interface AvatarProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  unitPreference: LengthUnit;
  measurements: BodyMeasurementsCm;
  /** Which body model produced the geometry; lets us invalidate saves when the model changes. */
  bodyModel: "prototype-parametric-v1";
  createdAt: string;
  updatedAt: string;
}

export const CURRENT_SCHEMA_VERSION = 1 as const;

export function createProfile(params: {
  id: string;
  name?: string;
  unitPreference?: LengthUnit;
  measurements?: BodyMeasurementsCm;
  now?: Date;
}): AvatarProfile {
  const ts = (params.now ?? new Date()).toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: params.id,
    name: params.name ?? "My avatar",
    unitPreference: params.unitPreference ?? "cm",
    measurements: { ...(params.measurements ?? DEFAULT_MEASUREMENTS) },
    bodyModel: "prototype-parametric-v1",
    createdAt: ts,
    updatedAt: ts,
  };
}

export function touch(profile: AvatarProfile, now: Date = new Date()): AvatarProfile {
  return { ...profile, updatedAt: now.toISOString() };
}

export function serializeProfile(profile: AvatarProfile): string {
  return JSON.stringify(profile);
}

export class ProfileParseError extends Error {}

/** Parse and structurally validate a stored profile. Throws ProfileParseError on bad input. */
export function parseProfile(raw: string | unknown): AvatarProfile {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ProfileParseError("Profile is not valid JSON.");
    }
  }
  if (!data || typeof data !== "object") throw new ProfileParseError("Profile must be an object.");
  const d = data as Record<string, unknown>;

  if (d.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new ProfileParseError(`Unsupported profile schema version: ${String(d.schemaVersion)}`);
  }
  for (const f of ["id", "name", "createdAt", "updatedAt"] as const) {
    if (typeof d[f] !== "string") throw new ProfileParseError(`Profile field "${f}" is missing.`);
  }
  if (d.unitPreference !== "cm" && d.unitPreference !== "in") {
    throw new ProfileParseError("Profile unitPreference must be cm or in.");
  }
  if (d.bodyModel !== "prototype-parametric-v1") {
    throw new ProfileParseError("Profile was created with an unknown body model.");
  }
  const m = d.measurements as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object") throw new ProfileParseError("Profile measurements are missing.");
  for (const spec of MEASUREMENT_SPECS) {
    if (typeof m[spec.key] !== "number" || !Number.isFinite(m[spec.key])) {
      throw new ProfileParseError(`Measurement "${spec.key}" is missing or invalid.`);
    }
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: d.id as string,
    name: d.name as string,
    unitPreference: d.unitPreference,
    bodyModel: d.bodyModel,
    createdAt: d.createdAt as string,
    updatedAt: d.updatedAt as string,
    measurements: Object.fromEntries(MEASUREMENT_SPECS.map((s) => [s.key, m[s.key] as number])) as unknown as BodyMeasurementsCm,
  };
}
