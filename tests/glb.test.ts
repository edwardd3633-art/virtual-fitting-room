import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GARMENT_PART, buildALineSkirt, buildTee } from "@/lib/demoGarments";
import { geometryToGlb, readGlbJson, srgbHexToLinear } from "@/lib/glb";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";

describe("GLB writer", () => {
  it("writes a valid GLB header and JSON chunk", () => {
    const glb = geometryToGlb(buildTee({ chest: 104, shoulder: 44, length: 66 }), { name: "t", colorHex: "#ffffff", extras: { demo: true } });
    expect(glb.byteLength % 4).toBe(0);
    const json = readGlbJson(glb) as any;
    expect(json.asset.version).toBe("2.0");
    expect(json.extras).toEqual({ demo: true });
    expect(json.accessors[0].count).toBeGreaterThan(0);
    expect(json.buffers[0].byteLength).toBe(glb.byteLength - 20 - Math.ceil(JSON.stringify(json).length / 4) * 4 - 8);
  });

  it("converts sRGB to linear", () => {
    expect(srgbHexToLinear("#ffffff")).toEqual([1, 1, 1]);
    expect(srgbHexToLinear("#000000")).toEqual([0, 0, 0]);
    expect(srgbHexToLinear("#808080")[0]).toBeCloseTo(0.2158, 3);
  });
});

describe("demo garment geometry", () => {
  const bbox = (g: ReturnType<typeof buildTee>) => {
    g.computeBoundingBox();
    return g.boundingBox!;
  };

  it("bigger sizes are wider", () => {
    const s = bbox(buildALineSkirt({ waist: 70, hip: 98, hem: 166, length: 71 }));
    const m = bbox(buildALineSkirt({ waist: 76, hip: 104, hem: 172, length: 72 }));
    expect(m.max.x).toBeGreaterThan(s.max.x);
    expect(m.min.y).toBeLessThan(s.min.y);
  });

  it("garments hang down from their anchor", () => {
    const b = bbox(buildTee({ chest: 104, shoulder: 44, length: 66 }));
    // Only the collar rises above the shoulder line, up the base of the neck.
    expect(b.max.y).toBeLessThan(0.08);
    expect(b.min.y).toBeCloseTo(-0.66, 2);
  });

  it("tags every vertex with a garment part", () => {
    const g = buildTee({ chest: 104, shoulder: 44, sleeveLength: 20, length: 66 });
    const part = g.getAttribute("part");
    expect(part.count).toBe(g.getAttribute("position").count);
    const kinds = new Set(Array.from(part.array as Float32Array));
    expect(kinds).toEqual(new Set(Object.values(GARMENT_PART)));
  });

  it("writes the part tag into the GLB as _PART", () => {
    const json = readGlbJson(geometryToGlb(buildTee({ chest: 104, length: 66 }), { name: "t", colorHex: "#ffffff" })) as any;
    expect(json.meshes[0].primitives[0].attributes._PART).toBe(3);
  });

  it("committed demo files are GLBs tagged as demo content", () => {
    const a = DEMO_CATALOG.assets.find((x) => x.assetId === "demo-relaxed-tee--ecru--m")!;
    const json = readGlbJson(new Uint8Array(readFileSync(path.join(__dirname, "../public", a.file.url)))) as any;
    expect(json.extras).toMatchObject({ assetId: a.assetId, demo: true, anchor: "shoulder" });
  });
});
