"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeBodyShape } from "@/domain/bodyShape";
import { type GarmentMeasurementsCm, defaultSelection, findProduct, resolveAsset, sizeAvailability, variantHasTryOn } from "@/domain/catalog";
import { DEFAULT_ENGINES, NoSupportedEngineError, VALIDATION_LABELS, runFit } from "@/domain/fitting";
import { DEFAULT_MEASUREMENTS } from "@/domain/measurements";
import { type LengthUnit, formatLength, fromCm, roundForDisplay } from "@/domain/units";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";
import { track } from "@/adapters/analytics/analytics";
import { LazyViewport } from "./LazyViewport";
import { useProfile } from "./ProfileProvider";
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

/**
 * Try-on screen. URL contract (FR-025 draft): /try-on/{productId}?variant={variantId}&size={sizeLabel}
 * Both query params are optional; invalid values fall back to the first available selection.
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

  const measurements = profile?.measurements ?? DEFAULT_MEASUREMENTS;
  const unit = profile?.unitPreference ?? "cm";
  const shape = useMemo(() => computeBodyShape(measurements), [measurements]);

  // Memoised: a fresh object per render would re-run the fit, the garment conform and its onLoaded callback in a loop.
  const resolved = useMemo(() => (variantId && sizeLabel ? resolveAsset(catalog, productId, variantId, sizeLabel) : null), [productId, variantId, sizeLabel]);
  const fitOutcome = useMemo(() => {
    if (!resolved?.ok) return null;
    try {
      return { ok: true as const, fit: runFit(DEFAULT_ENGINES, { body: shape, asset: resolved.asset, pose: "a-pose" }) };
    } catch (err) {
      if (err instanceof NoSupportedEngineError) return { ok: false as const, message: err.message };
      throw err;
    }
  }, [resolved, shape]);

  const [view, setView] = useState<CameraView>("front");
  const [viewNonce, setViewNonce] = useState(0);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<(GarmentStats & { url: string }) | null>(null);
  const [showOverlap, setShowOverlap] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  const select = useCallback(
    (next: { variant?: string; size?: string }) => {
      const q = new URLSearchParams(params.toString());
      if (next.variant) q.set("variant", next.variant);
      if (next.size) q.set("size", next.size);
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

  const fit = fitOutcome?.ok ? fitOutcome.fit : null;
  const assetFailed = !!fit && failedUrl === fit.assetUrl;
  const onAssetError = useCallback(
    (err: unknown) => {
      if (!fit || !variantId || !sizeLabel) return;
      console.warn("Garment asset failed to load", fit.assetUrl, err);
      setFailedUrl(fit.assetUrl);
      track({ name: "tryon_asset_failed", props: { productId, variantId, size: sizeLabel } });
    },
    [fit, productId, variantId, sizeLabel],
  );
  const onAssetLoaded = useCallback(
    (s: GarmentStats) => {
      if (!fit || !variantId || !sizeLabel) return;
      setStats({ url: fit.assetUrl, ...s });
      if (loadedUrl === fit.assetUrl) return;
      setLoadedUrl(fit.assetUrl);
      track({ name: "tryon_rendered", props: { productId, variantId, size: sizeLabel } });
    },
    [fit, loadedUrl, productId, variantId, sizeLabel],
  );
  const currentStats = fit && stats?.url === fit.assetUrl ? stats : null;
  // Ignore a handful of vertices: the shapes are approximate, so tiny overlaps aren't meaningful.
  const showsOverlap = !!currentStats && currentStats.overlapFraction > 0.01;

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
  const selectionLabel = `${product.name} · ${variant.colorName} · Size ${sizeLabel ?? "—"}`;

  return (
    <div className="split">
      <section className="stage" aria-label="Try-on preview">
        <LazyViewport
          shape={shape}
          view={view}
          viewNonce={viewNonce}
          label={`Prototype mannequin wearing ${selectionLabel}. Static preview, not simulated.`}
          autoRotate={autoRotate}
          scanKey={fit && loadedUrl === fit.assetUrl ? fit.assetUrl : undefined}
          overlay={
            <>
              <div className="stage-overlay top-left">
                <span className="glass-chip live">
                  <span className="dot" aria-hidden="true" />
                  {variant.colorName} · Size {sizeLabel ?? "—"}
                </span>
                {showsOverlap && (
                  <span className="glass-chip overlap" role="note">
                    <span className="dot" aria-hidden="true" />
                    <span>
                      {showOverlap ? "Highlighted" : "Some"} areas: this size is smaller than the avatar by up to{" "}
                      {formatLength(currentStats.maxOverlapM * 100, unit)}.
                    </span>
                    <button type="button" aria-pressed={showOverlap} onClick={() => setShowOverlap((s) => !s)}>
                      {showOverlap ? "Hide" : "Show"}
                    </button>
                  </span>
                )}
              </div>
              {fit && !assetFailed && loadedUrl !== fit.assetUrl && (
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
          {fit && !assetFailed && (
            <Garment key={fit.assetUrl} fit={fit} shape={shape} showOverlap={showOverlap} onError={onAssetError} onLoaded={onAssetLoaded} />
          )}
        </LazyViewport>
        {assetFailed && (
          <div className="fallback" role="alert">
            <strong>We couldn&apos;t load the 3D garment for this size.</strong> Your avatar is still shown. Try another size, or check back later.
            The garment&apos;s measurements are listed alongside.
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
                  onClick={() => select({ variant: v.variantId, size: sizeLabel })}
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
                  select({ variant: variantId, size: s.label });
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
                    <th scope="col" className="num">
                      Garment ({sizeLabel})
                    </th>
                    <th scope="col" className="num">
                      You
                    </th>
                    <th scope="col" className="num">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {GARMENT_ROWS.filter((r) => asset.garmentMeasurements[r.key] != null).map((r) => (
                    <tr key={r.key}>
                      <th scope="row">{r.label}</th>
                      <td className="num">{formatLength(asset.garmentMeasurements[r.key]!, unit)}</td>
                      <td className="num">{r.body ? formatLength(measurements[r.body], unit) : "—"}</td>
                      <td className="num">
                        {r.body ? <Difference garmentCm={asset.garmentMeasurements[r.key]!} bodyCm={measurements[r.body]} unit={unit} /> : "—"}
                      </td>
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
      </section>
    </div>
  );
}
