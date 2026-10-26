import { describe, expect, it } from "vitest";
import { ProfileParseError, createProfile, parseProfile, serializeProfile, touch } from "@/domain/avatar";
import { DEFAULT_MEASUREMENTS } from "@/domain/measurements";

const now = new Date("2026-10-14T12:00:00Z");

describe("avatar profile serialization", () => {
  it("round-trips through JSON", () => {
    const p = createProfile({ id: "a1", unitPreference: "in", now });
    expect(parseProfile(serializeProfile(p))).toEqual(p);
  });

  it("stores measurements, units, parameters and timestamps (FR-003)", () => {
    const p = createProfile({ id: "a1", now });
    expect(p).toMatchObject({
      schemaVersion: 1,
      unitPreference: "cm",
      measurements: DEFAULT_MEASUREMENTS,
      bodyModel: "prototype-parametric-v1",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("copies measurements instead of sharing the defaults object", () => {
    const p = createProfile({ id: "a1" });
    p.measurements.heightCm = 199;
    expect(DEFAULT_MEASUREMENTS.heightCm).toBe(170);
  });

  it("touch() updates only updatedAt", () => {
    const p = createProfile({ id: "a1", now });
    const later = touch(p, new Date("2026-10-15T00:00:00Z"));
    expect(later.updatedAt).toBe("2026-10-15T00:00:00.000Z");
    expect(later.createdAt).toBe(p.createdAt);
  });

  it("strips unknown fields", () => {
    const p = createProfile({ id: "a1", now });
    const parsed = parseProfile({ ...p, extra: "x", measurements: { ...p.measurements, weightKg: 70 } });
    expect(parsed).toEqual(p);
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["wrong schema version", JSON.stringify({ ...createProfile({ id: "a" }), schemaVersion: 2 })],
    ["bad unit", JSON.stringify({ ...createProfile({ id: "a" }), unitPreference: "mm" })],
    ["missing measurement", JSON.stringify({ ...createProfile({ id: "a" }), measurements: { heightCm: 170 } })],
    ["unknown body model", JSON.stringify({ ...createProfile({ id: "a" }), bodyModel: "smpl" })],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseProfile(raw)).toThrow(ProfileParseError);
  });
});
