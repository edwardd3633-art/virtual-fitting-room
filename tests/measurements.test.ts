import { describe, expect, it } from "vitest";
import { DEFAULT_MEASUREMENTS, MEASUREMENT_SPECS, validateMeasurements } from "@/domain/measurements";

describe("measurement validation", () => {
  it("accepts the defaults", () => {
    expect(validateMeasurements(DEFAULT_MEASUREMENTS)).toEqual([]);
  });

  it("covers every P0 measurement (FR-011)", () => {
    expect(MEASUREMENT_SPECS.map((s) => s.key).sort()).toEqual(
      ["chestCm", "heightCm", "hipsCm", "inseamCm", "shoulderWidthCm", "waistCm"],
    );
  });

  it("rejects out-of-range values with a message in the user's unit", () => {
    const issues = validateMeasurements({ ...DEFAULT_MEASUREMENTS, heightCm: 100 }, "in");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.key).toBe("heightCm");
    expect(issues[0]!.message).toBe("Height must be between 55.1 and 82.7 in.");
  });

  it("rejects non-numbers", () => {
    const issues = validateMeasurements({ ...DEFAULT_MEASUREMENTS, waistCm: Number.NaN });
    expect(issues[0]).toEqual({ key: "waistCm", message: "Waist must be a number." });
  });

  it("accepts range boundaries", () => {
    for (const s of MEASUREMENT_SPECS) {
      // Boundaries can trip cross-field checks, so only assert no range error for this key.
      const lo = validateMeasurements({ ...DEFAULT_MEASUREMENTS, [s.key]: s.minCm });
      expect(lo.some((i) => i.key === s.key && i.message.includes("between"))).toBe(false);
    }
  });

  it("flags implausible inseam/height combinations", () => {
    const issues = validateMeasurements({ ...DEFAULT_MEASUREMENTS, heightCm: 200, inseamCm: 60 });
    expect(issues.map((i) => i.key)).toContain("inseamCm");
  });

  it("flags shoulder width entered as a circumference", () => {
    const issues = validateMeasurements({ ...DEFAULT_MEASUREMENTS, chestCm: 80, shoulderWidthCm: 55 });
    expect(issues.map((i) => i.key)).toContain("shoulderWidthCm");
  });
});
