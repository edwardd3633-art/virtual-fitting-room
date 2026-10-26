import type { AvatarProfile } from "./avatar";

/**
 * A saved try-on (customer journey step 11): product, colour, size and an
 * optional second size it was compared against. Stores identifiers only; the
 * catalog is the source of truth for names and availability.
 */
export interface SavedLook {
  schemaVersion: 1;
  id: string;
  productId: string;
  variantId: string;
  sizeLabel: string;
  compareSizeLabel: string | null;
  savedAt: string;
}

export class LookParseError extends Error {}

export function createLook(params: {
  id: string;
  productId: string;
  variantId: string;
  sizeLabel: string;
  compareSizeLabel?: string | null;
  now?: Date;
}): SavedLook {
  return {
    schemaVersion: 1,
    id: params.id,
    productId: params.productId,
    variantId: params.variantId,
    sizeLabel: params.sizeLabel,
    compareSizeLabel: params.compareSizeLabel ?? null,
    savedAt: (params.now ?? new Date()).toISOString(),
  };
}

/** Two looks are the same if they show the same product, colour and sizes (order of sizes ignored). */
export function sameLook(a: Omit<SavedLook, "id" | "savedAt" | "schemaVersion">, b: Omit<SavedLook, "id" | "savedAt" | "schemaVersion">): boolean {
  const sizes = (l: typeof a) => [l.sizeLabel, l.compareSizeLabel ?? ""].sort().join("|");
  return a.productId === b.productId && a.variantId === b.variantId && sizes(a) === sizes(b);
}

export function parseLook(data: unknown): SavedLook {
  if (!data || typeof data !== "object") throw new LookParseError("Saved look must be an object.");
  const d = data as Record<string, unknown>;
  if (d.schemaVersion !== 1) throw new LookParseError(`Unsupported saved look version: ${String(d.schemaVersion)}`);
  for (const f of ["id", "productId", "variantId", "sizeLabel", "savedAt"] as const) {
    if (typeof d[f] !== "string" || d[f] === "") throw new LookParseError(`Saved look field "${f}" is missing.`);
  }
  if (d.compareSizeLabel !== null && d.compareSizeLabel !== undefined && typeof d.compareSizeLabel !== "string") {
    throw new LookParseError("Saved look compareSizeLabel must be a string or null.");
  }
  return {
    schemaVersion: 1,
    id: d.id as string,
    productId: d.productId as string,
    variantId: d.variantId as string,
    sizeLabel: d.sizeLabel as string,
    compareSizeLabel: (d.compareSizeLabel as string | null | undefined) ?? null,
    savedAt: d.savedAt as string,
  };
}

/** Everything this app stores about the customer, for "Download my data" (PRD §8). */
export interface DataExport {
  format: "virtual-fitting-room/data-export";
  version: 1;
  exportedAt: string;
  storedWhere: string;
  avatars: AvatarProfile[];
  savedLooks: SavedLook[];
}

export function buildDataExport(params: { avatars: AvatarProfile[]; savedLooks: SavedLook[]; now?: Date }): DataExport {
  return {
    format: "virtual-fitting-room/data-export",
    version: 1,
    exportedAt: (params.now ?? new Date()).toISOString(),
    storedWhere: "This browser's local storage only. Nothing is stored on a server.",
    avatars: params.avatars,
    savedLooks: params.savedLooks,
  };
}
