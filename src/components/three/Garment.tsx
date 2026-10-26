"use client";

import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { BufferAttribute, type BufferGeometry, Color, DoubleSide, type Mesh, type MeshStandardMaterial } from "three";
import type { BodyShape } from "@/domain/bodyShape";
import type { FitResult } from "@/domain/fitting";
import { type FitRegion, torsoRegionAt } from "@/domain/fitRegions";
import { withBasePath } from "@/lib/basePath";
import { createBodySdf } from "@/lib/bodySdf";
import { type ConformResult, conformGarment } from "@/lib/conform";
import { GARMENT_PART } from "@/lib/demoGarments";

/** Colour used to mark where the garment mesh is smaller than the body. */
export const OVERLAP_COLOR = "#ff5a7a";

export interface GarmentStats {
  maxOverlapM: number;
  overlapFraction: number;
  /** Deepest overlap per region (m), leaving out regions with only a few stray vertices. */
  regions: Partial<Record<FitRegion, number>>;
}

/** Below this share of vertices a region's overlap is noise from the approximate shapes. */
const MIN_REGION_FRACTION = 0.002;

function findMesh(root: { traverse(cb: (o: unknown) => void): void }): Mesh | null {
  let found: Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as Mesh).isMesh) found = o as Mesh;
  });
  return found;
}

/** Per-vertex colour: garment colour, a slightly deeper rib at collar/waistband, overlap tint on top. */
function paint(geo: BufferGeometry, base: Color, showOverlap: boolean) {
  const part = geo.getAttribute("part");
  const overlap = geo.getAttribute("overlap");
  const hi = new Color(OVERLAP_COLOR);
  const rib = base.clone().multiplyScalar(0.82);
  const c = new Color();
  const colors = new Float32Array(part.count * 3);
  for (let i = 0; i < part.count; i++) {
    c.copy(part.getX(i) === GARMENT_PART.collar ? rib : base);
    if (showOverlap) c.lerp(hi, overlap.getX(i) * 0.85);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
}

/**
 * Loads the exact garment file chosen by the fitting engine, then conforms
 * it to the avatar (lib/conform.ts). No Draco/Meshopt: avoids decoder
 * downloads from third-party CDNs.
 */
function GarmentMesh({
  fit,
  shape,
  showOverlap,
  onLoaded,
}: {
  fit: FitResult;
  shape: BodyShape;
  showOverlap: boolean;
  onLoaded?: (stats: GarmentStats) => void;
}) {
  // Catalog URLs are site-relative; add the deploy sub-path (GitHub Pages) when there is one.
  const gltf = useGLTF(withBasePath(fit.assetUrl), false, false);
  const source = useMemo(() => findMesh(gltf.scene), [gltf.scene]);
  const sdf = useMemo(() => createBodySdf(shape), [shape]);
  // Key on the anchor's values, not the array's identity, so an equal fit never re-runs the conform.
  const [px, py, pz] = fit.position;
  const conformed = useMemo<ConformResult | null>(() => {
    if (!source) return null;
    const regionOf = (y: number, part: number): FitRegion => (part === GARMENT_PART.sleeve ? "sleeve" : torsoRegionAt(shape, y));
    return conformGarment(source.geometry, [px, py, pz], sdf, { regionOf });
  }, [source, px, py, pz, sdf, shape]);
  const baseColor = useMemo(() => ((source?.material as MeshStandardMaterial | undefined)?.color ?? new Color("#888888")).clone(), [source]);

  useMemo(() => conformed && paint(conformed.geometry, baseColor, showOverlap), [conformed, baseColor, showOverlap]);
  useEffect(() => () => conformed?.geometry.dispose(), [conformed]);
  useEffect(() => {
    if (!conformed) return;
    const regions: GarmentStats["regions"] = {};
    for (const [r, o] of Object.entries(conformed.regionOverlap)) if (o.fraction >= MIN_REGION_FRACTION) regions[r as FitRegion] = o.maxM;
    onLoaded?.({ maxOverlapM: conformed.maxOverlapM, overlapFraction: conformed.overlapFraction, regions });
  }, [conformed, onLoaded]);

  if (!conformed) return null;
  return (
    <mesh geometry={conformed.geometry} position={fit.position} castShadow receiveShadow>
      <meshPhysicalMaterial
        key={showOverlap ? "o" : "n"}
        vertexColors
        side={DoubleSide}
        roughness={0.86}
        sheen={1}
        sheenRoughness={0.55}
        sheenColor={baseColor.clone().lerp(new Color("#ffffff"), 0.45)}
      />
    </mesh>
  );
}

interface BoundaryProps {
  resetKey: string;
  onError: (err: unknown) => void;
  children: ReactNode;
}

/** Turns a missing or corrupt asset into a callback instead of crashing the canvas (AC-9). */
class GarmentErrorBoundary extends Component<BoundaryProps, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromProps(props: BoundaryProps, state: { failed: boolean; key: string }) {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    this.props.onError(err);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function Garment(props: {
  fit: FitResult;
  shape: BodyShape;
  showOverlap?: boolean;
  onError: (err: unknown) => void;
  onLoaded?: (stats: GarmentStats) => void;
}) {
  return (
    <GarmentErrorBoundary resetKey={props.fit.assetUrl} onError={props.onError}>
      <Suspense fallback={null}>
        <GarmentMesh fit={props.fit} shape={props.shape} showOverlap={props.showOverlap ?? true} onLoaded={props.onLoaded} />
      </Suspense>
    </GarmentErrorBoundary>
  );
}
