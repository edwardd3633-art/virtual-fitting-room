"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeBodyShape } from "@/domain/bodyShape";
import { type GarmentMeasurementsCm, defaultSelection, findProduct, resolveAsset, sizeAvailability, variantHasTryOn } from "@/domain/catalog";
import { DEFAULT_ENGINES, NoSupportedEngineError, VALIDATION_LABELS, runFit } from "@/domain/fitting";
import { createLook, sameLook } from "@/domain/looks";
import { DEFAULT_MEASUREMENTS } from "@/domain/measurements";
import { type LengthUnit, formatLength, fromCm, roundForDisplay } from "@/domain/units";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";
import { track } from "@/adapters/analytics/analytics";
import { LazyViewport } from "./LazyViewport";
import { useProfile } from "./ProfileProvider";
import { useSavedLooks } from "./useSavedLooks";
import { ViewControls } from "./ViewControls";
import { Garment, type GarmentStats } from "./three/Garment";
import type { CameraView } from "./three/Viewport";

const catalog = DEMO_CATALOG;

/** Garment minus body, with a small centred bar. Arithmetic only: not a fit judgement. */
function Difference({ garmentCm, bodyCm, unit }: { garmentCm: number; bodyCm: number; unit: LengthUnit }) {
  const diff = garmentCm - bodyCm;
  const shown = roundForDisplay(fromCm(diff, unit));
  const pct = Math.min(50, (Math.abs(diff) / 30) * 50);
  const neg = diff < 0;
  return (
    <span className="diff">
      <span className={`diff-value${neg ? " neg" : ""}`}>
        {shown > 0 ? "+" : ""}
        {shown} {unit}
      </span>
      <span className="diff-bar" aria-hidden="true">
        <span className={neg ? "neg" : "pos"} style={neg ? { left: `${50 - pct}%`, width: `${pct}%` } : { width: `${pct}%` }} />
      </span>
    </span>
  );
}

const GARMENT_ROWS: { key: keyof GarmentMeasurementsCm; label: string; body?: "chestCm" | "waistCm" | "hipsCm" | "shoulderWidthCm" }[] = [
  { key: "chest", label: "Chest (circumference)", body: "chestCm" },
  { key: "waist", label: "Waist (circumference)", body: "waistCm" },
  { key: "hip", label: "Hip (circumference)", body: "hipsCm" },
  { key: "shoulder", label: "Shoulder width", body: "shoulderWidthCm" },
  { key: "hem", label: "Hem (circumference)" },
  { key: "sleeveLength", label: "Sleeve length" },
  { key: "length", label: "Garment length" },
];

/** Fit the garment for one size, or explain why it can't be shown. */
function useFit(productId: string, variantId: string | undefined, sizeLabel: string | null | undefined, shape: ReturnType<typeof computeBodyShape>) {
  // Memoised: a fresh object per render would re-run the fit, the garment conform and its onLoaded callback in a loop.
  const resolved = useMemo(() => (variantId && sizeLabel ? resolveAsset(catalog, productId, variantId, sizeLabel) : null), [productId, variantId, sizeLabel]);
  const outcome = useMemo(() => {
    if (!resolved?.ok) return null;
    try {
      return { ok: true as const, fit: runFit(DEFAULT_ENGINES, { body: shape, asset: resolved.asset, pose: "a-pose" }) };
    } catch (err) {
      if (err instanceof NoSupportedEngineError) return { ok: false as const, message: err.message };
      throw err;
    }
  }, [resolved, shape]);
  return { resolved, outcome, fit: outcome?.ok ? outcome.fit : null };
}

/**
 * Try-on screen. URL contract (FR-025 draft):
 *   /try-on/{productId}?variant={variantId}&size={sizeLabel}&compare={sizeLabel}
 * All query params are optional; invalid values fall back to the first available selection.
 * `compare` turns on side-by-side size comparison (FR-043).
 */
export function TryOn({ productId }: { productId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { status, profile } = useProfile();

  const product = findProduct(catalog, productId);
  const fallback = defaultSelection(catalog, productId);
  const variantParam = params.get("variant");
  const variantId = product?.variants.some((v) => v.variantId === variantParam) ? variantParam! : fallback?.variantId;
  const sizes = useMemo(() => (variantId ? sizeAvailability(catalog, productId, variantId) : []), [productId, variantId]);
  const sizeParam = params.get("size");
  const sizeLabel = sizes.find((s) => s.label === sizeParam && s.available)?.label ?? sizes.find((s) => s.available)?.label;
  const requestedUnavailable = sizeParam && sizeParam !== sizeLabel ? sizes.find((s) => s.label === sizeParam) : undefined;
  const compareParam = params.get("compare");
  const compareLabel = sizes.find((s) => s.label === compareParam && s.available && s.label !== sizeLabel)?.label ?? null;

  const measurements = profile?.measurements ?? DEFAULT_MEASUREMENTS;
  const unit = profile?.unitPreference ?? "cm";
  const shape = useMemo(() => computeBodyShape(measurements), [measurements]);

  const { resolved, outcome: fitOutcome, fit } = useFit(productId, variantId, sizeLabel, shape);
  const { resolved: resolved2, fit: fit2 } = useFit(productId, variantId, compareLabel, shape);
  const comparing = !!fit2;

  const [view, setView] = useState<CameraView>("front");
  const [viewNonce, setViewNonce] = useState(0);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [loadedUrls, setLoadedUrls] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, GarmentStats>>({});
  const { looks, add: addLook } = useSavedLooks();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showOverlap, setShowOverlap] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  const select = useCallback(
    (next: { variant?: string; size?: string; compare?: string | null }) => {
      const q = new URLSearchParams(params.toString());
      if (next.variant) q.set("variant", next.variant);
      if (next.size) q.set("size", next.size);
      if (next.compare === null) q.delete("compare");
      else if (next.compare) q.set("compare", next.compare);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || status !== "ready" || !variantId || !sizeLabel) return;
    startedRef.current = true;
    track({ name: "tryon_started", props: { productId, variantId, size: sizeLabel, hasSavedAvatar: !!profile } });
  }, [status, productId, variantId, sizeLabel, profile]);

  const assetFailed = !!fit && failedUrls.includes(fit.assetUrl);
  const asset2Failed = !!fit2 && failedUrls.includes(fit2.assetUrl);

  const onAssetError = useCallback(
    (url: string, size: string) => (err: unknown) => {
      if (!variantId) return;
      console.warn("Garment asset failed to load", url, err);
      setFailedUrls((f) => (f.includes(url) ? f : [...f, url]));
      track({ name: "tryon_asset_failed", props: { productId, variantId, size } });
    },
    [productId, variantId],
  );
  const onAssetLoaded = useCallback(
    (url: string, size: string) => (s: GarmentStats) => {
      if (!variantId) return;
      setStats((prev) => ({ ...prev, [url]: s }));
      setLoadedUrls((prev) => {
        if (prev.includes(url)) return prev;
        track({ name: "tryon_rendered", props: { productId, variantId, size } });
        return [...prev, url];
      });
    },
    [productId, variantId],
  );
  // Stable per-URL callbacks so the garment components don't re-run their effects every render.
  const handlers = useMemo(() => {
    const make = (f: typeof fit, size: string | null | undefined) =>
      f && size ? { onError: onAssetError(f.assetUrl, size), onLoaded: onAssetLoaded(f.assetUrl, size) } : null;
    return { primary: make(fit, sizeLabel), secondary: make(fit2, compareLabel) };
  }, [fit, fit2, sizeLabel, compareLabel, onAssetError, onAssetLoaded]);

  // Ignore a handful of vertices: the shapes are approximate, so tiny overlaps aren't meaningful.
  const overlapFor = (f: typeof fit) => {
    const st = f ? stats[f.assetUrl] : undefined;
    return st && st.overlapFraction > 0.01 ? st : null;
  };
  const overlap1 = overlapFor(fit);
  const overlap2 = comparing ? overlapFor(fit2) : null;
  const loading = (fit && !assetFailed && !loadedUrls.includes(fit.assetUrl)) || (fit2 && !asset2Failed && !loadedUrls.includes(fit2.assetUrl));

  const lookDraft = variantId && sizeLabel ? { productId, variantId, sizeLabel, compareSizeLabel: compareLabel } : null;
  const alreadySaved = !!lookDraft && !!looks?.some((l) => sameLook(l, lookDraft));
  function saveLook() {
    if (!lookDraft || alreadySaved) return;
    try {
      addLook(createLook({ id: crypto.randomUUID(), ...lookDraft }));
      setSaveError(null);
      track({ name: "look_saved", props: { productId, variantId: lookDraft.variantId, size: lookDraft.sizeLabel, compareSize: compareLabel } });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save this look.");
    }
  }

  function startCompare() {
    if (!sizeLabel) return;
    const avail = sizes.filter((s) => s.available).map((s) => s.label);
    const i = avail.indexOf(sizeLabel);
    // Default to the next size up, or the one below if this is the largest.
    const other = avail[i + 1] ?? avail[i - 1];
    if (!other) return;
    track({ name: "size_compare_started", props: { productId, sizes: [sizeLabel, other] } });
    select({ compare: other });
    setViewNonce((n) => n + 1);
  }
  const canCompare = sizes.filter((s) => s.available).length > 1;

  if (!product || product.variants.every((v) => !variantHasTryOn(catalog, productId, v.variantId))) {
    return (
      <div className="panel narrow">
        <h1>Try-on unavailable</h1>
        <p>{product ? "This product doesn't have any 3D garments ready yet." : "We couldn't find this product."}</p>
        <Link href="/catalog">Back to catalog</Link>
      </div>
    );
  }

  const variant = product.variants.find((v) => v.variantId === variantId)!;
  const asset = resolved?.ok ? resolved.asset : null;
  const asset2 = comparing && resolved2?.ok ? resolved2.asset : null;
  const selectionLabel = comparing
    ? `${product.name} · ${variant.colorName} · Size ${sizeLabel} (left) and size ${compareLabel} (right)`
    : `${product.name} · ${variant.colorName} · Size ${sizeLabel ?? "—"}`;

  const garmentCols = [
    ...(asset && sizeLabel ? [{ label: sizeLabel, asset }] : []),
    ...(asset2 && compareLabel ? [{ label: compareLabel, asset: asset2 }] : []),
  ];

  const overlapChip = (st: GarmentStats, prefix: string) => (
    <span className="glass-chip overlap" role="note">
      <span className="dot" aria-hidden="true" />
      <span>
        {prefix}
        {showOverlap ? "Highlighted" : "Some"} areas: this size is smaller than the avatar by up to {formatLength(st.maxOverlapM * 100, unit)}.
      </span>
      <button type="button" aria-pressed={showOverlap} onClick={() => setShowOverlap((s) => !s)}>
        {showOverlap ? "Hide" : "Show"}
      </button>
    </span>
  );

  return (
    <div className="split">
      <section className="stage" aria-label="Try-on preview">
        <LazyViewport
          shape={shape}
          view={view}
          viewNonce={viewNonce}
          label={`Prototype mannequin wearing ${selectionLabel}. Static preview, not simulated.`}
          autoRotate={autoRotate}
          scanKey={fit && loadedUrls.includes(fit.assetUrl) ? `${fit.assetUrl}|${fit2?.assetUrl ?? ""}` : undefined}
          secondary={
            comparing && fit2 && !asset2Failed && handlers.secondary ? (
              <Garment key={fit2.assetUrl} fit={fit2} shape={shape} showOverlap={showOverlap} {...handlers.secondary} />
            ) : comparing ? null : undefined
          }
          overlay={
            <>
              <div className="stage-overlay top-left">
                {comparing ? (
                  <>
                    <span className="glass-chip live">
                      <span className="dot" aria-hidden="true" />
                      Left: size {sizeLabel}
                    </span>
                    <span className="glass-chip live">
                      <span className="dot" aria-hidden="true" />
                      Right: size {compareLabel}
                    </span>
                  </>
                ) : (
                  <span className="glass-chip live">
                    <span className="dot" aria-hidden="true" />
                    {variant.colorName} · Size {sizeLabel ?? "—"}
                  </span>
                )}
                {overlap1 && overlapChip(overlap1, comparing ? `Size ${sizeLabel}: ` : "")}
                {overlap2 && overlapChip(overlap2, `Size ${compareLabel}: `)}
              </div>
              {loading && (
                <span className="glass-chip loading-chip overlay">
                  <span className="spinner" aria-hidden="true" /> Loading garment…
                </span>
              )}
              <div className="stage-overlay bottom">
                <ViewControls
                  view={view}
                  onSelect={(v) => {
                    setAutoRotate(false);
                    setView(v);
                    setViewNonce((n) => n + 1);
                  }}
                  autoRotate={autoRotate}
                  onAutoRotate={setAutoRotate}
                />
              </div>
            </>
          }
        >
          {fit && !assetFailed && handlers.primary && (
            <Garment key={fit.assetUrl} fit={fit} shape={shape} showOverlap={showOverlap} {...handlers.primary} />
          )}
        </LazyViewport>
        {(assetFailed || asset2Failed) && (
          <div className="fallback" role="alert">
            <strong>We couldn&apos;t load the 3D garment for size {assetFailed ? sizeLabel : compareLabel}.</strong> Your avatar is still shown. Try
            another size, or check back later. The garment&apos;s measurements are listed alongside.
          </div>
        )}
        {fitOutcome && !fitOutcome.ok && (
          <div className="fallback" role="alert">
            {fitOutcome.message}
          </div>
        )}
      </section>

      <section className="panel" aria-label="Product and size">
        <p className="eyebrow gradient-text">Demo product · fictional</p>
        <h1>{product.name}</h1>
        <p className="selection" aria-live="polite">
          Showing <strong>{variant.colorName}</strong>, size <strong>{sizeLabel}</strong>
          {comparing && (
            <>
              {" "}
              next to size <strong>{compareLabel}</strong>
            </>
          )}
        </p>

        {status === "ready" && !profile && (
          <p className="notice">
            You&apos;re seeing a default avatar. <Link href="/avatar">Create your avatar</Link> to use your own measurements.
          </p>
        )}

        <fieldset>
          <legend>Colour</legend>
          <div className="swatches">
            {product.variants.map((v) => {
              const usable = variantHasTryOn(catalog, productId, v.variantId);
              return (
                <button
                  key={v.variantId}
                  type="button"
                  className="swatch"
                  aria-pressed={v.variantId === variantId}
                  disabled={!usable}
                  onClick={() => select({ variant: v.variantId, size: sizeLabel, compare: compareLabel })}
                >
                  <span className="chip" style={{ background: v.colorHex }} aria-hidden="true" />
                  {v.colorName}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend>Size</legend>
          <div className="sizes">
            {sizes.map((s) => (
              <button
                key={s.label}
                type="button"
                aria-pressed={s.label === sizeLabel}
                disabled={!s.available}
                aria-describedby={s.available ? undefined : `size-${s.label}-why`}
                onClick={() => {
                  if (sizeLabel && s.label !== sizeLabel) track({ name: "size_switched", props: { productId, from: sizeLabel, to: s.label } });
                  // Picking the size being compared against swaps the pair rather than comparing a size with itself.
                  select({ variant: variantId, size: s.label, compare: s.label === compareLabel ? sizeLabel : undefined });
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <ul className="size-notes">
            {sizes
              .filter((s) => !s.available)
              .map((s) => (
                <li key={s.label} id={`size-${s.label}-why`}>
                  {s.label}: {s.reason}
                </li>
              ))}
          </ul>
          <div className="compare-row">
            {comparing ? (
              <>
                <span id="compare-label">Compare with:</span>
                <div className="sizes" role="group" aria-labelledby="compare-label">
                  {sizes
                    .filter((s) => s.available && s.label !== sizeLabel)
                    .map((s) => (
                      <button key={s.label} type="button" aria-pressed={s.label === compareLabel} onClick={() => select({ compare: s.label })}>
                        {s.label}
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    select({ compare: null });
                    setViewNonce((n) => n + 1);
                  }}
                >
                  Stop comparing
                </button>
              </>
            ) : (
              canCompare && (
                <button type="button" onClick={startCompare}>
                  Compare two sizes side by side
                </button>
              )
            )}
          </div>
          {requestedUnavailable && (
            <p className="notice" role="status">
              Size {requestedUnavailable.label} can&apos;t be shown, so we&apos;re showing {sizeLabel}. {requestedUnavailable.reason}
            </p>
          )}
        </fieldset>

        {asset && (
          <>
            <h2>Garment vs. your measurements</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Measurement</th>
                    {garmentCols.map((c) => (
                      <th scope="col" className="num" key={c.label}>
                        {comparing ? `Size ${c.label}` : `Garment (${c.label})`}
                      </th>
                    ))}
                    <th scope="col" className="num">
                      You
                    </th>
                    {!comparing && (
                      <th scope="col" className="num">
                        Difference
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {GARMENT_ROWS.filter((r) => garmentCols.some((c) => c.asset.garmentMeasurements[r.key] != null)).map((r) => (
                    <tr key={r.key}>
                      <th scope="row">{r.label}</th>
                      {garmentCols.map((c) => {
                        const g = c.asset.garmentMeasurements[r.key];
                        return (
                          <td className="num" key={c.label}>
                            {g == null ? "—" : formatLength(g, unit)}
                            {/* In compare mode the difference sits under each size's value. */}
                            {comparing && g != null && r.body && <Difference garmentCm={g} bodyCm={measurements[r.body]} unit={unit} />}
                          </td>
                        );
                      })}
                      <td className="num">{r.body ? formatLength(measurements[r.body], unit) : "—"}</td>
                      {!comparing && (
                        <td className="num">
                          {r.body && asset.garmentMeasurements[r.key] != null ? (
                            <Difference garmentCm={asset.garmentMeasurements[r.key]!} bodyCm={measurements[r.body]} unit={unit} />
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caveat">
              Garment figures are demo data, not taken from a real product. Difference is garment minus body; comparing numbers is not a fit
              recommendation.
            </p>

            <h2>About this preview</h2>
            <ul className="badges">
              <li>
                <span className="badge warn">{VALIDATION_LABELS[asset.provenance.validation]}</span>
              </li>
              <li>
                <span className="badge">Mode: static (no physics)</span>
              </li>
            </ul>
            <ul className="limitations">
              {(fit?.limitations ?? []).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </>
        )}

        <div className="actions">
          <button type="button" onClick={saveLook} disabled={!lookDraft || alreadySaved || looks === null} aria-describedby="save-look-status">
            {alreadySaved ? "Saved ✓" : comparing ? "Save this comparison" : "Save this look"}
          </button>
          <Link
            className="button-link primary"
            href={`/catalog#${productId}`}
            onClick={() => variantId && sizeLabel && track({ name: "return_to_product", props: { productId, variantId, size: sizeLabel } })}
          >
            Return to product
          </Link>
          <Link className="button-link" href="/avatar">
            Edit avatar
          </Link>
        </div>
        <p id="save-look-status" className={saveError ? "error" : "muted small"} role="status">
          {saveError ?? (alreadySaved ? <>Saved in this browser. <Link href="/saved">View saved looks</Link></> : null)}
        </p>
      </section>
    </div>
  );
}
