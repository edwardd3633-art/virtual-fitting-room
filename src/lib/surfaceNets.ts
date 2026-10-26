import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import type { BodySdf } from "./bodySdf";

const GH = 0.001;

/**
 * Sparse naive surface nets: polygonise an SDF into an indexed, smooth-normal
 * mesh. Only blocks of the grid that can contain the surface are sampled, and
 * each vertex is projected onto the zero level set, so the mesh sits on the
 * exact same surface the garment conform step collides against.
 */
export function meshSdf(sdf: BodySdf, cell = 0.0075): BufferGeometry {
  const { min, max } = sdf.bounds;
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const ox = min[0];
  const oy = min[1];
  const oz = min[2];

  const nPts = nx * ny * nz;
  const field = new Float32Array(nPts).fill(Number.NaN);
  const pIdx = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const sample = (i: number, j: number, k: number) => {
    const id = pIdx(i, j, k);
    let v = field[id]!;
    if (Number.isNaN(v)) {
      v = sdf.distance(ox + i * cell, oy + j * cell, oz + k * cell);
      field[id] = v;
    }
    return v;
  };

  // 1. Coarse block culling.
  const B = 4;
  const bx = Math.ceil((nx - 1) / B);
  const by = Math.ceil((ny - 1) / B);
  const bz = Math.ceil((nz - 1) / B);
  // Generous: the field is only approximately Lipschitz (blends, ellipsoid estimates).
  const reach = Math.sqrt(3) * (B / 2) * cell * 2.5 + 2 * cell;
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cIdx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);

  const positions: number[] = [];
  const normals: number[] = [];
  const g: [number, number, number] = [0, 0, 0];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ] as const;
  // Corner c ↔ offset (c&1, (c>>1)&1, (c>>2)&1).

  const activeCells: number[] = [];
  for (let kb = 0; kb < bz; kb++) {
    for (let jb = 0; jb < by; jb++) {
      for (let ib = 0; ib < bx; ib++) {
        const cx = ox + (ib * B + B / 2) * cell;
        const cy = oy + (jb * B + B / 2) * cell;
        const cz = oz + (kb * B + B / 2) * cell;
        if (Math.abs(sdf.distance(cx, cy, cz)) > reach) continue;
        const i1 = Math.min(nx - 1, (ib + 1) * B);
        const j1 = Math.min(ny - 1, (jb + 1) * B);
        const k1 = Math.min(nz - 1, (kb + 1) * B);
        for (let k = kb * B; k < k1; k++) {
          for (let j = jb * B; j < j1; j++) {
            for (let i = ib * B; i < i1; i++) {
              let mask = 0;
              for (let c = 0; c < 8; c++) {
                const v = sample(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
                corner[c] = v;
                if (v < 0) mask |= 1 << c;
              }
              if (mask === 0 || mask === 255) continue;
              // Average of edge crossings.
              let sx = 0;
              let sy = 0;
              let sz = 0;
              let n = 0;
              for (const [a, b] of EDGES) {
                const va = corner[a]!;
                const vb = corner[b]!;
                if (va < 0 === vb < 0) continue;
                const t = va / (va - vb);
                sx += (a & 1) + ((b & 1) - (a & 1)) * t;
                sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
                sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
                n++;
              }
              let px = ox + (i + sx / n) * cell;
              let py = oy + (j + sy / n) * cell;
              let pz = oz + (k + sz / n) * cell;
              // One Newton step onto the surface; its gradient doubles as the normal.
              const d0 = sdf.distance(px, py, pz);
              const gx = sdf.distance(px + GH, py, pz) - d0;
              const gy = sdf.distance(px, py + GH, pz) - d0;
              const gz = sdf.distance(px, py, pz + GH) - d0;
              const l2 = gx * gx + gy * gy + gz * gz;
              if (l2 > 1e-14) {
                const s = (d0 * GH) / l2;
                if (Math.abs(s * Math.sqrt(l2)) < cell) {
                  px -= gx * s;
                  py -= gy * s;
                  pz -= gz * s;
                }
              }
              const gl = Math.sqrt(l2) || 1;
              g[0] = gx / gl;
              g[1] = gy / gl;
              g[2] = gz / gl;
              cellVert[cIdx(i, j, k)] = positions.length / 3;
              positions.push(px, py, pz);
              normals.push(g[0], g[1], g[2]);
              activeCells.push(i, j, k);
            }
          }
        }
      }
    }
  }

  // 2. Faces: one quad per sign-changing grid edge, joining the 4 cells around it.
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let n = 0; n < activeCells.length; n += 3) {
    const i = activeCells[n]!;
    const j = activeCells[n + 1]!;
    const k = activeCells[n + 2]!;
    const inside = field[pIdx(i, j, k)]! < 0;
    // Edges from the cell's min corner along +X, +Y, +Z. Each needs the 3 other cells on the minus side.
    if (j > 0 && k > 0 && inside !== field[pIdx(i + 1, j, k)]! < 0) {
      quad(cellVert[cIdx(i, j - 1, k - 1)]!, cellVert[cIdx(i, j, k - 1)]!, cellVert[cIdx(i, j, k)]!, cellVert[cIdx(i, j - 1, k)]!, !inside);
    }
    if (i > 0 && k > 0 && inside !== field[pIdx(i, j + 1, k)]! < 0) {
      quad(cellVert[cIdx(i - 1, j, k - 1)]!, cellVert[cIdx(i - 1, j, k)]!, cellVert[cIdx(i, j, k)]!, cellVert[cIdx(i, j, k - 1)]!, !inside);
    }
    if (i > 0 && j > 0 && inside !== field[pIdx(i, j, k + 1)]! < 0) {
      quad(cellVert[cIdx(i - 1, j - 1, k)]!, cellVert[cIdx(i, j - 1, k)]!, cellVert[cIdx(i, j, k)]!, cellVert[cIdx(i - 1, j, k)]!, !inside);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geo.setIndex(new Uint32BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}
