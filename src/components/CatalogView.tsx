"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { defaultSelection, listTryOnProducts, sizeAvailability } from "@/domain/catalog";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";
import { ProductThumb } from "./ProductThumb";

/** Catalog grid. Reads `?qa=1` in the browser so the page can be exported as static HTML. */
export function CatalogView() {
  const qa = useSearchParams().get("qa") === "1";
  const products = listTryOnProducts(DEMO_CATALOG, { includeQaFixtures: qa });
  const retailer = DEMO_CATALOG.retailers[0]!;

  return (
    <div className="catalog">
      <header className="page-head">
        <p className="eyebrow gradient-text rise">{retailer.name}</p>
        <h1 className="rise d1">Catalog</h1>
        <p className="rise d2">
          These products are fictional and exist only to demonstrate the try-on flow. Only products with at least one approved 3D garment are
          listed.
        </p>
      </header>
      <ul className="product-grid">
        {products.map((p, i) => {
          const sel = defaultSelection(DEMO_CATALOG, p.productId)!;
          return (
            <li key={p.productId} id={p.productId} className={`product-card rise d${Math.min(3, i + 1)}${p.isQaFixture ? " qa" : ""}`}>
              <ProductThumb category={p.category} color={p.variants[0]!.colorHex} id={p.productId} />
              <div className="card-body">
                <h2>{p.name}</h2>
                <p className="muted small">{p.description}</p>
                {p.variants.map((v) => {
                  const sizes = sizeAvailability(DEMO_CATALOG, p.productId, v.variantId);
                  return (
                    <p key={v.variantId} className="small variant-line">
                      <span className="chip" style={{ background: v.colorHex }} aria-hidden="true" /> {v.colorName}:{" "}
                      {sizes.map((s, i) => (
                        <span key={s.label} className={s.available ? "" : "unavailable"} title={s.reason}>
                          {s.label}
                          {s.available ? "" : " (no 3D)"}
                          {i < sizes.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </p>
                  );
                })}
                <Link className="button-link primary" href={`/try-on/${p.productId}?variant=${sel.variantId}&size=${encodeURIComponent(sel.sizeLabel)}`}>
                  Try on
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small" style={{ marginTop: 24 }}>
        {qa ? <Link href="/catalog">Hide QA fixtures</Link> : <Link href="/catalog?qa=1">Show QA fixtures</Link>} (test products for error handling)
      </p>
    </div>
  );
}
