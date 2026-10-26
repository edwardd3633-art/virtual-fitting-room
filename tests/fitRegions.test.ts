import { describe, expect, it } from "vitest";
import { computeBodyShape } from "@/domain/bodyShape";
import { REGION_ORDER, regionFocus, torsoRegionAt } from "@/domain/fitRegions";
import { DEFAULT_MEASUREMENTS } from "@/domain/measurements";

const shape = computeBodyShape(DEFAULT_MEASUREMENTS);

describe("torso regions", () => {
  it("puts each landmark in its own region", () => {
    expect(torsoRegionAt(shape, shape.y.shoulder)).toBe("shoulder");
    expect(torsoRegionAt(shape, shape.y.chest)).toBe("chest");
    expect(torsoRegionAt(shape, shape.y.waist)).toBe("waist");
    expect(torsoRegionAt(shape, shape.y.hip)).toBe("hip");
  });

  it("runs top to bottom without gaps", () => {
    const order = ["hip", "waist", "chest", "shoulder"];
    let last = 0;
    for (let y = shape.y.crotch; y < shape.y.neck; y += 0.005) {
      const i = order.indexOf(torsoRegionAt(shape, y));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
    expect(last).toBe(3);
  });
});

describe("region focus", () => {
  it("rings circumferences with the body's own section at that height", () => {
    const f = regionFocus(shape, "chest");
    expect(f.y).toBe(shape.y.chest);
    expect(f.marker).toEqual({ kind: "ring", y: shape.y.chest, section: shape.sections.chest });
  });

  it("spans shoulder width between the shoulder points", () => {
    const f = regionFocus(shape, "shoulder");
    expect(f.marker).toEqual({ kind: "span", y: shape.y.shoulder, halfWidth: DEFAULT_MEASUREMENTS.shoulderWidthCm / 200 });
  });

  it("aims every region somewhere on the body", () => {
    for (const r of REGION_ORDER) {
      const { y } = regionFocus(shape, r);
      expect(y).toBeGreaterThan(shape.y.crotch);
      expect(y).toBeLessThan(shape.y.neck);
    }
  });
});
