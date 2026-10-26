"use client";

import Link from "next/link";
import { findProduct, resolveAsset } from "@/domain/catalog";
import type { SavedLook } from "@/domain/looks";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";
import { track } from "@/adapters/analytics/analytics";
import { ProductThumb } from "./ProductThumb";
import { useSavedLooks } from "./useSavedLooks";

function tryOnHref(l: SavedLook): string {
  const q = new URLSearchParams({ variant: l.variantId, size: l.sizeLabel });
  if (l.compareSizeLabel) q.set("compare", l.compareSizeLabel);
  return `/try-on/${l.productId}?${q.toString()}`;
}

/** Saved try-ons (customer journey step 11). Availability is re-checked against the catalog every time. */
export function SavedLooks() {
  const { looks, remove } = useSavedLooks();

  return (
    <div className="catalog">
      <header className="page-head">
        <p className="eyebrow gradient-text">Your shortlist</p>
        <h1>Saved looks</h1>
        <p>Products and sizes you saved from the try-on screen. They&apos;re stored in this browser only.</p>
      </header>

      {looks === null ? (
        <p className="muted">Loading…</p>
      ) : looks.length === 0 ? (
        <div className="panel narrow">
          <p>You haven&apos;t saved any looks yet.</p>
          <p className="muted small">On a try-on screen, choose &ldquo;Save this look&rdquo; to keep a product and size here.</p>
          <Link className="button-link primary" href="/catalog">
            Browse the catalog
          </Link>
        </div>
      ) : (
        <ul className="product-grid saved-grid">
          {looks.map((l) => {
            const product = findProduct(DEMO_CATALOG, l.productId);
            const variant = product?.variants.find((v) => v.variantId === l.variantId);
            const sizes = [l.sizeLabel, ...(l.compareSizeLabel ? [l.compareSizeLabel] : [])];
            // A saved look can go stale if the catalog changes; say so instead of linking to a broken try-on.
            const unavailable = sizes.filter((s) => !resolveAsset(DEMO_CATALOG, l.productId, l.variantId, s).ok);
            return (
              <li key={l.id} className="product-card">
                <ProductThumb category={product?.category ?? "tops"} color={variant?.colorHex ?? "#777777"} id={`saved-${l.id}`} />
                <div className="card-body">
                  <h2>{product?.name ?? "Product no longer listed"}</h2>
                  <p className="small">
                    {variant?.colorName ?? l.variantId} · {l.compareSizeLabel ? `Size ${l.sizeLabel} vs ${l.compareSizeLabel}` : `Size ${l.sizeLabel}`}
                  </p>
                  <p className="muted small">Saved {new Date(l.savedAt).toLocaleDateString()}</p>
                  {unavailable.length > 0 && (
                    <p className="error small">Size {unavailable.join(", ")} can&apos;t be shown in 3D any more.</p>
                  )}
                  <div className="actions">
                    {product && (
                      <Link className="button-link primary" href={tryOnHref(l)}>
                        {l.compareSizeLabel ? "Open comparison" : "Try on again"}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        remove(l.id);
                        track({ name: "look_removed", props: {} });
                      }}
                      aria-label={`Remove ${product?.name ?? "look"}, size ${sizes.join(" and ")}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
