import { describe, expect, it } from "vitest";
import { DEFAULT_MEASUREMENTS, type MeasurementKey } from "@/domain/measurements";
import { computeBodyShape, ellipseFromCircumference, ellipsePerimeter } from "@/domain/bodyShape";

describe("ellipse sections", () => {
  it("produces an ellipse with the requested perimeter", () => {
    for (const c of [0.6, 0.94, 1.5]) {
      const e = ellipseFromCircumference(c, 0.75);
      expect(ellipsePerimeter(e.rx, e.rz)).toBeCloseTo(c, 10);
      expect(e.rz / e.rx).toBeCloseTo(0.75, 10);
    }
  });

  it("matches a circle when depth ratio is 1", () => {
    const e = ellipseFromCircumference(2 * Math.PI, 1);
    expect(e.rx).toBeCloseTo(1, 10);
  });
});

describe("computeBodyShape responds in the expected direction (AC-2)", () => {
  const base = computeBodyShape(DEFAULT_MEASUREMENTS);
  const bump = (key: MeasurementKey, delta: number) => computeBodyShape({ ...DEFAULT_MEASUREMENTS, [key]: DEFAULT_MEASUREMENTS[key] + delta });

  it("height raises stature and the shoulder line", () => {
    const s = bump("heightCm", 10);
    expect(s.heightM).toBeGreaterThan(base.heightM);
    expect(s.y.shoulder).toBeGreaterThan(base.y.shoulder);
  });

  it("chest widens only the chest section", () => {
    const s = bump("chestCm", 10);
    expect(s.sections.chest.rx).toBeGreaterThan(base.sections.chest.rx);
    expect(s.sections.waist).toEqual(base.sections.waist);
  });

  it("waist widens only the waist section", () => {
    const s = bump("waistCm", 10);
    expect(s.sections.waist.rx).toBeGreaterThan(base.sections.waist.rx);
    expect(s.sections.hips).toEqual(base.sections.hips);
  });

  it("hips widen the hip section and thighs", () => {
    const s = bump("hipsCm", 10);
    expect(s.sections.hips.rx).toBeGreaterThan(base.sections.hips.rx);
    expect(s.thighRadiusM).toBeGreaterThan(base.thighRadiusM);
  });

  it("shoulder width widens the shoulders", () => {
    expect(bump("shoulderWidthCm", 4).shoulderHalfWidthM).toBeCloseTo(base.shoulderHalfWidthM + 0.02, 10);
  });

  it("inseam raises the crotch", () => {
    expect(bump("inseamCm", 5).y.crotch).toBeGreaterThan(base.y.crotch);
  });

  it("keeps landmarks ordered for extreme valid inputs", () => {
    for (const m of [
      { heightCm: 140, chestCm: 150, waistCm: 150, hipsCm: 160, shoulderWidthCm: 56, inseamCm: 78 },
      { heightCm: 210, chestCm: 70, waistCm: 55, hipsCm: 70, shoulderWidthCm: 30, inseamCm: 78 },
    ]) {
      const y = computeBodyShape(m).y;
      const order = [y.knee, y.crotch, y.hip, y.waist, y.chest, y.shoulder, y.neck, y.headCenter];
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });
});
