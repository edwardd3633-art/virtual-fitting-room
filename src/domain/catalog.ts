import type { GarmentAnchor } from "./bodyShape";

/**
 * Catalog and garment-asset model (FR-020–FR-034, PRD §6).
 *
 * Product → Variant (colour) → Size → GarmentAsset. Every size resolves to an
 * explicit asset record or to "no asset"; we never fall back to a visually
 * similar garment (FR-023).
 */

export interface Retailer {
  id: string;
  name: string;
  /** True for the platform's own demo data. Real retailers require a signed data agreement. */
  isDemo: boolean;
}

export interface RightsInfo {
  source: string;
  license: string;
  /** Who authorised use, or "n/a" for self-produced demo content. */
  authorizedBy: string;
  notes?: string;
}

export interface SizeOption {
  label: string;
  sku: string;
  /** Null means the size is sold but has no digital asset yet. */
  assetId: string | null;
}

export interface ProductVariant {
  variantId: string;
  colorName: string;
  colorHex: string;
  imageUrls: string[];
  sizes: SizeOption[];
}

export type GarmentCategory = "tops" | "bottoms" | "dresses" | "outerwear";

export interface Product {
  retailerId: string;
  productId: string;
  name: string;
  category: GarmentCategory;
  description: string;
  rights: RightsInfo;
  variants: ProductVariant[];
  /** QA fixtures exercise failure paths and are hidden from shoppers unless requested. */
  isQaFixture?: boolean;
}

export type AssetStatus = "draft" | "processing" | "quality-review" | "approved" | "rejected" | "archived";

/** Where a value came from (FR-045, PRD §6 material data). */
export type DataSource = "measured" | "manufacturer-supplied" | "retailer-measurements" | "calibrated" | "estimated" | "demo-synthetic" | "not-captured";

export interface SourcedValue<T> {
  value: T | null;
  unit?: string;
  source: DataSource;
}

export interface MaterialProperties {
  composition: SourcedValue<string>;
  arealDensity: SourcedValue<number>;
  thickness: SourcedValue<number>;
  stretchWarp: SourcedValue<number>;
  stretchWeft: SourcedValue<number>;
  bendingStiffness: SourcedValue<number>;
  friction: SourcedValue<number>;
  recovery: SourcedValue<number>;
}

export type ValidationLevel = "unvalidated" | "derived-from-retailer-measurements" | "validated-against-physical-sample";

export interface GarmentMeasurementsCm {
  chest?: number;
  waist?: number;
  hip?: number;
  hem?: number;
  shoulder?: number;
  sleeveLength?: number;
  length: number;
}

export interface GarmentAsset {
  assetId: string;
  productId: string;
  variantId: string;
  sizeLabel: string;
  status: AssetStatus;
  /** Web-optimised derived file. Canonical source files are versioned separately. */
  file: { url: string; format: "glb"; units: "m"; upAxis: "Y" };
  anchor: GarmentAnchor;
  garmentMeasurements: GarmentMeasurementsCm;
  garmentMeasurementsSource: DataSource;
  material: MaterialProperties;
  provenance: {
    creator: string;
    createdAt: string;
    revision: number;
    rights: RightsInfo;
    validation: ValidationLevel;
    limitations: string[];
  };
}

export interface Catalog {
  retailers: Retailer[];
  products: Product[];
  assets: GarmentAsset[];
}

// ---------------------------------------------------------------------------
// Resolution

export type ResolveFailure =
  | "unknown-product"
  | "unknown-variant"
  | "unknown-size"
  | "no-asset"
  | "asset-record-missing"
  | "asset-not-approved"
  | "asset-mapping-mismatch";

export type ResolveResult =
  | { ok: true; product: Product; variant: ProductVariant; size: SizeOption; asset: GarmentAsset }
  | { ok: false; reason: ResolveFailure; message: string };

export const RESOLVE_MESSAGES: Record<ResolveFailure, string> = {
  "unknown-product": "This product isn't in the catalog.",
  "unknown-variant": "This colour isn't available for this product.",
  "unknown-size": "This size isn't offered for this product.",
  "no-asset": "This size doesn't have a 3D garment yet.",
  "asset-record-missing": "The 3D garment for this size couldn't be found.",
  "asset-not-approved": "The 3D garment for this size is still in quality review.",
  "asset-mapping-mismatch": "The 3D garment on file doesn't match this product and size, so it isn't shown.",
};

function fail(reason: ResolveFailure): ResolveResult {
  return { ok: false, reason, message: RESOLVE_MESSAGES[reason] };
}

export function findProduct(catalog: Catalog, productId: string): Product | undefined {
  return catalog.products.find((p) => p.productId === productId);
}

/** Resolve the exact asset for product + variant + size (FR-023). */
export function resolveAsset(catalog: Catalog, productId: string, variantId: string, sizeLabel: string): ResolveResult {
  const product = findProduct(catalog, productId);
  if (!product) return fail("unknown-product");
  const variant = product.variants.find((v) => v.variantId === variantId);
  if (!variant) return fail("unknown-variant");
  const size = variant.sizes.find((s) => s.label === sizeLabel);
  if (!size) return fail("unknown-size");
  if (!size.assetId) return fail("no-asset");
  const asset = catalog.assets.find((a) => a.assetId === size.assetId);
  if (!asset) return fail("asset-record-missing");
  if (asset.productId !== productId || asset.variantId !== variantId || asset.sizeLabel !== sizeLabel) {
    return fail("asset-mapping-mismatch");
  }
  if (asset.status !== "approved") return fail("asset-not-approved");
  return { ok: true, product, variant, size, asset };
}

export interface SizeAvailability {
  label: string;
  available: boolean;
  reason?: string;
}

export function sizeAvailability(catalog: Catalog, productId: string, variantId: string): SizeAvailability[] {
  const product = findProduct(catalog, productId);
  const variant = product?.variants.find((v) => v.variantId === variantId);
  if (!variant) return [];
  return variant.sizes.map((s) => {
    const r = resolveAsset(catalog, productId, variantId, s.label);
    return r.ok ? { label: s.label, available: true } : { label: s.label, available: false, reason: r.message };
  });
}

export function variantHasTryOn(catalog: Catalog, productId: string, variantId: string): boolean {
  return sizeAvailability(catalog, productId, variantId).some((s) => s.available);
}

/** Products a shopper can try on: at least one variant with an approved, correctly mapped asset (AC-5). */
export function listTryOnProducts(catalog: Catalog, opts: { includeQaFixtures?: boolean } = {}): Product[] {
  return catalog.products.filter(
    (p) => (opts.includeQaFixtures || !p.isQaFixture) && p.variants.some((v) => variantHasTryOn(catalog, p.productId, v.variantId)),
  );
}

/** First variant/size that can be tried on, for default selection. */
export function defaultSelection(catalog: Catalog, productId: string): { variantId: string; sizeLabel: string } | null {
  const product = findProduct(catalog, productId);
  if (!product) return null;
  for (const v of product.variants) {
    const sizes = sizeAvailability(catalog, productId, v.variantId).filter((s) => s.available);
    if (sizes.length > 0) {
      // Prefer a middle size so the first view isn't an extreme.
      const mid = sizes[Math.floor((sizes.length - 1) / 2)]!;
      return { variantId: v.variantId, sizeLabel: mid.label };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Data-quality checks (FR-034, FR-036)

const MATERIAL_KEYS: (keyof MaterialProperties)[] = [
  "composition",
  "arealDensity",
  "thickness",
  "stretchWarp",
  "stretchWeft",
  "bendingStiffness",
  "friction",
  "recovery",
];

export interface MaterialFlag {
  property: keyof MaterialProperties;
  issue: "missing" | "estimated";
}

export function flagMaterialProperties(material: MaterialProperties): MaterialFlag[] {
  const flags: MaterialFlag[] = [];
  for (const k of MATERIAL_KEYS) {
    const v = material[k];
    if (v.value === null || v.source === "not-captured") flags.push({ property: k, issue: "missing" });
    else if (v.source === "estimated" || v.source === "demo-synthetic") flags.push({ property: k, issue: "estimated" });
  }
  return flags;
}

export interface CatalogIssue {
  severity: "error" | "warning";
  ref: string;
  message: string;
}

/** Structural integrity checks for a catalog. Errors should block publishing. */
export function validateCatalog(catalog: Catalog): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const retailerIds = new Set(catalog.retailers.map((r) => r.id));
  const assetIds = new Set<string>();
  for (const a of catalog.assets) {
    if (assetIds.has(a.assetId)) issues.push({ severity: "error", ref: a.assetId, message: "Duplicate asset ID." });
    assetIds.add(a.assetId);
  }

  const productIds = new Set<string>();
  const referenced = new Map<string, string>();
  for (const p of catalog.products) {
    if (productIds.has(p.productId)) issues.push({ severity: "error", ref: p.productId, message: "Duplicate product ID." });
    productIds.add(p.productId);
    if (!retailerIds.has(p.retailerId)) issues.push({ severity: "error", ref: p.productId, message: `Unknown retailer "${p.retailerId}".` });
    if (!p.rights.license || !p.rights.source) issues.push({ severity: "error", ref: p.productId, message: "Missing rights/source metadata." });

    for (const v of p.variants) {
      const labels = new Set<string>();
      for (const s of v.sizes) {
        const ref = `${p.productId}/${v.variantId}/${s.label}`;
        if (labels.has(s.label)) issues.push({ severity: "error", ref, message: "Duplicate size label." });
        labels.add(s.label);
        if (!s.assetId) continue;
        if (referenced.has(s.assetId)) {
          issues.push({ severity: "error", ref, message: `Asset ${s.assetId} is also mapped to ${referenced.get(s.assetId)}.` });
        }
        referenced.set(s.assetId, ref);
        const asset = catalog.assets.find((a) => a.assetId === s.assetId);
        if (!asset) {
          issues.push({ severity: "error", ref, message: `Size maps to unknown asset ${s.assetId}.` });
        } else if (asset.productId !== p.productId || asset.variantId !== v.variantId || asset.sizeLabel !== s.label) {
          issues.push({ severity: "error", ref, message: `Asset ${s.assetId} is recorded for a different product/variant/size.` });
        }
      }
    }
  }

  for (const a of catalog.assets) {
    if (a.status !== "approved") continue;
    if (!a.provenance.rights.license) issues.push({ severity: "error", ref: a.assetId, message: "Approved asset has no license recorded." });
    if (!a.file.url) issues.push({ severity: "error", ref: a.assetId, message: "Approved asset has no file." });
    if (!referenced.has(a.assetId)) issues.push({ severity: "warning", ref: a.assetId, message: "Approved asset isn't mapped to any size." });
    const missing = flagMaterialProperties(a.material).filter((f) => f.issue === "missing").length;
    if (missing > 0) issues.push({ severity: "warning", ref: a.assetId, message: `${missing} physical material properties not captured.` });
  }
  return issues;
}
