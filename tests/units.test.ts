import { describe, expect, it } from "vitest";
import { cmToInches, formatLength, fromCm, inchesToCm, roundForDisplay, toCm } from "@/domain/units";

describe("unit conversion", () => {
  it("converts inches to cm exactly", () => {
    expect(inchesToCm(1)).toBe(2.54);
    expect(inchesToCm(70)).toBeCloseTo(177.8, 10);
  });

  it("round-trips without drift", () => {
    for (const cm of [55, 70.5, 94, 170, 209.9]) {
      expect(toCm(fromCm(cm, "in"), "in")).toBeCloseTo(cm, 10);
      expect(inchesToCm(cmToInches(cm))).toBeCloseTo(cm, 10);
    }
  });

  it("is the identity for cm", () => {
    expect(fromCm(94, "cm")).toBe(94);
    expect(toCm(94, "cm")).toBe(94);
  });

  it("formats with one decimal", () => {
    expect(formatLength(170, "cm")).toBe("170 cm");
    expect(formatLength(170, "in")).toBe("66.9 in");
    expect(roundForDisplay(1.25, 1)).toBe(1.3);
  });
});
