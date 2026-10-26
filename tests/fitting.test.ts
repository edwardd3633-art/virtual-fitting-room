import { describe, expect, it } from "vitest";
import { computeBodyShape } from "@/domain/bodyShape";
import { DEFAULT_MEASUREMENTS } from "@/domain/measurements";
import { DEFAULT_ENGINES, NoSupportedEngineError, STATIC_MODE_LIMITATIONS, runFit } from "@/domain/fitting";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";

const asset = (id: string) => DEMO_CATALOG.assets.find((a) => a.assetId === id)!;

describe("static anchor fitting", () => {
  const body = computeBodyShape(DEFAULT_MEASUREMENTS);

  it("anchors tops at the shoulder and skirts at the waist", () => {
    expect(runFit(DEFAULT_ENGINES, { body, asset: asset("demo-relaxed-tee--ecru--m"), pose: "a-pose" }).position[1]).toBe(body.y.shoulder);
    expect(runFit(DEFAULT_ENGINES, { body, asset: asset("demo-a-line-skirt--terracotta--m"), pose: "a-pose" }).position[1]).toBe(body.y.waist);
  });

  it("always discloses its limitations", () => {
    const r = runFit(DEFAULT_ENGINES, { body, asset: asset("demo-relaxed-tee--ecru--m"), pose: "a-pose" });
    expect(r.mode).toBe("static-anchor");
    for (const l of STATIC_MODE_LIMITATIONS) expect(r.limitations).toContain(l);
    expect(r.validation).toBe("unvalidated");
  });

  it("refuses unapproved assets", () => {
    expect(() => runFit(DEFAULT_ENGINES, { body, asset: asset("demo-a-line-skirt--terracotta--l"), pose: "a-pose" })).toThrow(NoSupportedEngineError);
  });

  it("keeps the garment the same when only the body changes (no fake fitting)", () => {
    const a = asset("demo-relaxed-tee--ecru--m");
    const tall = computeBodyShape({ ...DEFAULT_MEASUREMENTS, heightCm: 190 });
    const r1 = runFit(DEFAULT_ENGINES, { body, asset: a, pose: "a-pose" });
    const r2 = runFit(DEFAULT_ENGINES, { body: tall, asset: a, pose: "a-pose" });
    expect(r1.assetUrl).toBe(r2.assetUrl);
    expect(r2.position[1]).toBeGreaterThan(r1.position[1]);
  });
});
