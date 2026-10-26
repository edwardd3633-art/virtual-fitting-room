import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import type { BodySdf } from "./bodySdf";
import { GARMENT_PART } from "./demoGarments";

/**
 * Static garment CONFORM step (no physics).
 *
 * Takes the size-specific garment mesh as authored and adjusts it against the
 * avatar's signed distance field:
 *  1. vertices inside the body are pushed out to a small clearance;
 *  2. fabric above up-facing surfaces (shoulders, tops of sleeves, collar)
 *     settles onto the body instead of floating, as gravity would make it;
 *  3. the resulting displacements are smoothed over the mesh so the cloth
 *     stays continuous, then a last collision pass guarantees clearance.
 *
 * The garment's own size is never changed. Where it had to be pushed out by
 * more than a threshold, `overlap` (0..1) records that the garment mesh is
 * smaller than the body there, so the viewer can show it honestly instead of
 * silently stretching a too-small size.
 */

export interface ConformOptions {
  /** Clearance kept between body and main panels (m). */
  clearance?: number;
  /** Extra clearance for sleeves so they layer over the bodice (m). */
  sleeveExtra?: number;
  /** Displacement-smoothing iterations. */
  iterations?: number;
  /**
   * Names the region a point belongs to (avatar-space height and part tag),
   * so overlap can be reported per region. Return null to leave it out.
   */
  regionOf?: (y: number, part: number) => string | null;
}

export interface RegionOverlap {
  /** Deepest penetration in the region (m). */
  maxM: number;
  /** Fraction of all garment vertices that overlap in this region. */
  fraction: number;
}

export interface ConformResult {
  geometry: BufferGeometry;
  /** Max penetration found before conforming (m): how much smaller than the body the garment is at its tightest. */
  maxOverlapM: number;
  /** Fraction of garment vertices flagged as overlapping. */
  overlapFraction: number;
  /** Overlap broken down by `opts.regionOf`; empty without it. */
  regionOverlap: Record<string, RegionOverlap>;
}

/** Penetration depth (m) at which the overlap highlight starts / is full. */
export const OVERLAP_START_M = 0.012;
export const OVERLAP_FULL_M = 0.025;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * @param source garment geometry in garment space (origin at its anchor)
 * @param offset where the garment origin sits in avatar space
 */
export function conformGarment(source: BufferGeometry, offset: readonly [number, number, number], sdf: BodySdf, opts: ConformOptions = {}): ConformResult {
  const clearance = opts.clearance ?? 0.004;
  const sleeveExtra = opts.sleeveExtra ?? 0.0035;
  const iterations = opts.iterations ?? 14;

  // --- 1. Weld duplicate vertices so neighbours share displacement.
  const srcPos = source.getAttribute("position");
  const srcPart = source.getAttribute("_part") ?? source.getAttribute("part");
  const srcIndex = source.getIndex();
  const keyToId = new Map<string, number>();
  const triCount = srcIndex ? srcIndex.count : srcPos.count;
  const used = new Uint8Array(srcPos.count);
  for (let t = 0; t < triCount; t++) used[srcIndex ? srcIndex.getX(t) : t] = 1;
  const remap = new Uint32Array(srcPos.count);
  const pos: number[] = [];
  const part: number[] = [];
  for (let i = 0; i < srcPos.count; i++) {
    if (!used[i]) continue;
    const x = srcPos.getX(i);
    const y = srcPos.getY(i);
    const z = srcPos.getZ(i);
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let id = keyToId.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      keyToId.set(key, id);
      pos.push(x + offset[0], y + offset[1], z + offset[2]);
      part.push(srcPart ? Math.round(srcPart.getX(i)) : GARMENT_PART.shell);
    }
    remap[i] = id;
  }
  const n = pos.length / 3;
  const tri: number[] = [];
  for (let t = 0; t < triCount; t += 3) {
    const a = remap[srcIndex ? srcIndex.getX(t) : t]!;
    const b = remap[srcIndex ? srcIndex.getX(t + 1) : t + 1]!;
    const c = remap[srcIndex ? srcIndex.getX(t + 2) : t + 2]!;
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }

  // --- 2. Vertex adjacency (CSR).
  const deg = new Uint32Array(n);
  for (let t = 0; t < tri.length; t += 3) {
    deg[tri[t]!]! += 2;
    deg[tri[t + 1]!]! += 2;
    deg[tri[t + 2]!]! += 2;
  }
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i]! + deg[i]!;
  const nbr = new Uint32Array(start[n]!);
  const fill = start.slice(0, n);
  const link = (a: number, b: number) => {
    nbr[fill[a]!++] = b;
  };
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t]!;
    const b = tri[t + 1]!;
    const c = tri[t + 2]!;
    link(a, b); link(a, c); link(b, a); link(b, c); link(c, a); link(c, b);
  }

  // --- 3. Target displacement per vertex.
  const H = 0.001;
  const grad = (x: number, y: number, z: number, out: Float64Array) => {
    const d = sdf.distance(x, y, z);
    let gx = sdf.distance(x + H, y, z) - d;
    let gy = sdf.distance(x, y + H, z) - d;
    let gz = sdf.distance(x, y, z + H) - d;
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx /= l; gy /= l; gz /= l;
    out[0] = d; out[1] = gx; out[2] = gy; out[3] = gz;
  };
  const g = new Float64Array(4);
  const disp = new Float64Array(n * 3);
  const pinned = new Uint8Array(n);
  const overlap = new Float32Array(n);
  let maxOverlap = 0;
  let overlapCount = 0;
  const regionOverlap: Record<string, RegionOverlap> = {};
  const clearanceOf = (p: number) => (p === GARMENT_PART.sleeve || p === GARMENT_PART.sleeveCap ? clearance + sleeveExtra : clearance);
  // Overlap is only reported where the garment's size is defined by its measurements.
  const reportsOverlap = (p: number) => p === GARMENT_PART.shell || p === GARMENT_PART.sleeve;

  for (let i = 0; i < n; i++) {
    const p = part[i]!;
    if (p === GARMENT_PART.fold) continue;
    grad(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!, g);
    const [d, nx, ny, nz] = g as unknown as [number, number, number, number];
    const c = clearanceOf(p);
    let amount = 0;
    if (d < c) {
      amount = c - d;
      pinned[i] = 1;
      const pen = -d;
      if (reportsOverlap(p)) {
        if (pen > maxOverlap) maxOverlap = pen;
        overlap[i] = smoothstep(OVERLAP_START_M, OVERLAP_FULL_M, pen);
        if (pen > OVERLAP_START_M) {
          overlapCount++;
          const r = opts.regionOf?.(pos[i * 3 + 1]!, p);
          if (r) {
            const acc = (regionOverlap[r] ??= { maxM: 0, fraction: 0 });
            acc.maxM = Math.max(acc.maxM, pen);
            acc.fraction++;
          }
        }
      }
    } else {
      const gap = d - c;
      // Fabric settles onto surfaces that face up; collars hug regardless.
      const rest = p === GARMENT_PART.collar ? 1 : smoothstep(0.2, 0.65, ny);
      const reach = smoothstep(0.09, 0.03, gap);
      amount = -gap * rest * reach;
    }
    disp[i * 3] = nx * amount;
    disp[i * 3 + 1] = ny * amount;
    disp[i * 3 + 2] = nz * amount;
  }

  // --- 4. Smooth displacements (Jacobi). Pushed-out vertices keep at least their push.
  const target = disp.slice();
  const next = new Float64Array(n * 3);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const s0 = start[i]!;
      const s1 = start[i + 1]!;
      let ax = 0, ay = 0, az = 0;
      for (let k = s0; k < s1; k++) {
        const j = nbr[k]!;
        ax += disp[j * 3]!; ay += disp[j * 3 + 1]!; az += disp[j * 3 + 2]!;
      }
      const m = s1 - s0 || 1;
      ax /= m; ay /= m; az /= m;
      const free = part[i] === GARMENT_PART.fold;
      const w = free ? 1 : 0.55;
      let x = disp[i * 3]! * (1 - w) + ax * w;
      let y = disp[i * 3 + 1]! * (1 - w) + ay * w;
      let z = disp[i * 3 + 2]! * (1 - w) + az * w;
      if (pinned[i]) {
        // Never let smoothing pull a vertex back inside: keep the push component.
        const tx = target[i * 3]!, ty = target[i * 3 + 1]!, tz = target[i * 3 + 2]!;
        const tl2 = tx * tx + ty * ty + tz * tz;
        if (tl2 > 0) {
          const along = (x * tx + y * ty + z * tz) / tl2;
          if (along < 1) {
            x += tx * (1 - along); y += ty * (1 - along); z += tz * (1 - along);
          }
        }
      }
      next[i * 3] = x; next[i * 3 + 1] = y; next[i * 3 + 2] = z;
    }
    disp.set(next);
  }
  for (let i = 0; i < n * 3; i++) pos[i]! += disp[i]!;

  // --- 5. Final collision passes on the smoothed result. The field
  // underestimates distance in blended creases (armpits), so one push can fall
  // short: repeat on the vertices that still need it until none do.
  let pending: number[] = [];
  for (let i = 0; i < n; i++) if (part[i] !== GARMENT_PART.fold) pending.push(i);
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: number[] = [];
    for (const i of pending) {
      const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
      const c = clearanceOf(part[i]!);
      if (sdf.distance(x, y, z) >= c) continue;
      grad(x, y, z, g);
      const push = (c - g[0]!) * 1.15;
      pos[i * 3] = x + g[1]! * push;
      pos[i * 3 + 1] = y + g[2]! * push;
      pos[i * 3 + 2] = z + g[3]! * push;
      still.push(i);
    }
    pending = still;
  }

  // Back to garment space so the caller can keep positioning by `offset`.
  for (let i = 0; i < n; i++) {
    pos[i * 3]! -= offset[0];
    pos[i * 3 + 1]! -= offset[1];
    pos[i * 3 + 2]! -= offset[2];
  }

  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(pos, 3));
  out.setAttribute("part", new Float32BufferAttribute(part, 1));
  out.setAttribute("overlap", new Float32BufferAttribute(overlap, 1));
  out.setIndex(new Uint32BufferAttribute(tri, 1));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  for (const r of Object.values(regionOverlap)) r.fraction /= n;
  return { geometry: out, maxOverlapM: maxOverlap, overlapFraction: overlapCount / n, regionOverlap };
}
