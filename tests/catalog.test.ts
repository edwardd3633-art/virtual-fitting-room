import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Catalog,
  defaultSelection,
  flagMaterialProperties,
  listTryOnProducts,
  resolveAsset,
  sizeAvailability,
  validateCatalog,
} from "@/domain/catalog";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";

const clone = (c: Catalog): Catalog => structuredClone(c);

describe("product-size mapping (FR-023)", () => {
  it("resolves the exact asset for product + variant + size", () => {
    const r = resolveAsset(DEMO_CATALOG, "demo-relaxed-tee", "navy", "M");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.asset).toMatchObject({ productId: "demo-relaxed-tee", variantId: "navy", sizeLabel: "M", status: "approved" });
  });

  it("different sizes resolve to different assets", () => {
    const s = resolveAsset(DEMO_CATALOG, "demo-relaxed-tee", "ecru", "S");
    const m = resolveAsset(DEMO_CATALOG, "demo-relaxed-tee", "ecru", "M");
    expect(s.ok && m.ok && s.asset.assetId !== m.asset.assetId && s.asset.file.url !== m.asset.file.url).toBe(true);
  });

  it("different colours resolve to different assets", () => {
    const a = resolveAsset(DEMO_CATALOG, "demo-relaxed-tee", "ecru", "M");
    const b = resolveAsset(DEMO_CATALOG, "demo-relaxed-tee", "navy", "M");
    expect(a.ok && b.ok && a.asset.assetId !== b.asset.assetId).toBe(true);
  });

  it.each([
    ["unknown-product", "nope", "ecru", "M"],
    ["unknown-variant", "demo-relaxed-tee", "pink", "M"],
    ["unknown-size", "demo-relaxed-tee", "ecru", "XXL"],
    ["no-asset", "demo-relaxed-tee", "ecru", "XL"],
    ["asset-not-approved", "demo-a-line-skirt", "terracotta", "L"],
  ])("reports %s", (reason, p, v, s) => {
    const r = resolveAsset(DEMO_CATALOG, p, v, s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it("never substitutes an asset recorded for another size", () => {
    const c = clone(DEMO_CATALOG);
    const tee = c.products.find((p) => p.productId === "demo-relaxed-tee")!;
    const sizes = tee.variants[0]!.sizes;
    sizes.find((s) => s.label === "S")!.assetId = sizes.find((s) => s.label === "M")!.assetId;
    const r = resolveAsset(c, "demo-relaxed-tee", tee.variants[0]!.variantId, "S");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("asset-mapping-mismatch");
    expect(validateCatalog(c).some((i) => i.severity === "error")).toBe(true);
  });

  it("reports a missing asset record", () => {
    const c = clone(DEMO_CATALOG);
    c.assets = c.assets.filter((a) => a.assetId !== "demo-relaxed-tee--ecru--m");
    const r = resolveAsset(c, "demo-relaxed-tee", "ecru", "M");
    expect(!r.ok && r.reason).toBe("asset-record-missing");
  });
});

describe("catalog listing (AC-5, FR-022)", () => {
  it("lists only products with a usable asset and hides QA fixtures by default", () => {
    expect(listTryOnProducts(DEMO_CATALOG).map((p) => p.productId)).toEqual(["demo-relaxed-tee", "demo-a-line-skirt"]);
    expect(listTryOnProducts(DEMO_CATALOG, { includeQaFixtures: true })).toHaveLength(3);
  });

  it("hides products whose assets are all unapproved", () => {
    const c = clone(DEMO_CATALOG);
    for (const a of c.assets) if (a.productId === "demo-a-line-skirt") a.status = "draft";
    expect(listTryOnProducts(c).map((p) => p.productId)).toEqual(["demo-relaxed-tee"]);
  });

  it("marks per-size availability with reasons", () => {
    const sizes = sizeAvailability(DEMO_CATALOG, "demo-relaxed-tee", "ecru");
    expect(sizes.map((s) => [s.label, s.available])).toEqual([["XS", true], ["S", true], ["M", true], ["L", true], ["XL", false]]);
    expect(sizes.at(-1)!.reason).toMatch(/doesn't have a 3D garment/);
  });

  it("defaults to a middle available size", () => {
    expect(defaultSelection(DEMO_CATALOG, "demo-relaxed-tee")).toEqual({ variantId: "ecru", sizeLabel: "S" });
    expect(defaultSelection(DEMO_CATALOG, "demo-a-line-skirt")).toEqual({ variantId: "terracotta", sizeLabel: "S" });
  });
});

describe("demo catalog integrity", () => {
  it("has no structural errors", () => {
    expect(validateCatalog(DEMO_CATALOG).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("every approved asset (except the QA fixture) has a file on disk", () => {
    const fixtureIds = new Set(DEMO_CATALOG.products.filter((p) => p.isQaFixture).map((p) => p.productId));
    for (const a of DEMO_CATALOG.assets) {
      if (a.status !== "approved" || fixtureIds.has(a.productId)) continue;
      expect(existsSync(path.join(__dirname, "../public", a.file.url)), a.file.url).toBe(true);
    }
  });

  it("flags missing physical properties (FR-034)", () => {
    const flags = flagMaterialProperties(DEMO_CATALOG.assets[0]!.material);
    expect(flags).toContainEqual({ property: "composition", issue: "estimated" });
    expect(flags.filter((f) => f.issue === "missing")).toHaveLength(7);
  });

  it("records rights and provenance on every asset (FR-033)", () => {
    for (const a of DEMO_CATALOG.assets) {
      expect(a.provenance.rights.license).toBeTruthy();
      expect(a.provenance.creator).toBeTruthy();
      expect(a.provenance.validation).toBe("unvalidated");
    }
  });
});
