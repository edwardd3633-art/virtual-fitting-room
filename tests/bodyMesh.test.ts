import { describe, expect, it } from "vitest";
import { anchorY, computeBodyShape } from "@/domain/bodyShape";
import { DEFAULT_MEASUREMENTS } from "@/domain/measurements";
import { createBodySdf } from "@/lib/bodySdf";
import { conformGarment } from "@/lib/conform";
import { GARMENT_PART, buildTee } from "@/lib/demoGarments";
import { meshSdf } from "@/lib/surfaceNets";

const shape = computeBodyShape(DEFAULT_MEASUREMENTS);
const sdf = createBodySdf(shape);

/** Perimeter of the body's horizontal slice at height y, by marching rays out from the axis (torso only, |x| small enough to miss the arms). */
function slicePerimeter(y: number): number {
  const n = 180;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let lo = 0;
    let hi = 0.4;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (sdf.distance(Math.sin(a) * mid, y, Math.cos(a) * mid) < 0) lo = mid;
      else hi = mid;
    }
    pts.push([Math.sin(a) * lo, Math.cos(a) * lo]);
  }
  let p = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[(i + 1) % n]!;
    p += Math.hypot(x1 - x0, z1 - z0);
  }
  return p;
}

describe("body SDF", () => {
  it("keeps the entered waist and hip circumferences (within 2%)", () => {
    expect(slicePerimeter(shape.y.waist) * 100).toBeGreaterThan(DEFAULT_MEASUREMENTS.waistCm * 0.98);
    expect(slicePerimeter(shape.y.waist) * 100).toBeLessThan(DEFAULT_MEASUREMENTS.waistCm * 1.02);
    expect(slicePerimeter(shape.y.hip) * 100).toBeGreaterThan(DEFAULT_MEASUREMENTS.hipsCm * 0.98);
    expect(slicePerimeter(shape.y.hip) * 100).toBeLessThan(DEFAULT_MEASUREMENTS.hipsCm * 1.02);
  });

  it("is inside at the core and outside away from the body", () => {
    expect(sdf.distance(0, shape.y.chest, 0)).toBeLessThan(0);
    expect(sdf.distance(0, shape.y.headCenter, 0)).toBeLessThan(0);
    expect(sdf.distance(0, shape.y.chest, 0.5)).toBeGreaterThan(0);
    expect(sdf.distance(0, shape.heightM + 0.05, 0)).toBeGreaterThan(0);
  });

  it("stands on the floor at the stature entered", () => {
    expect(sdf.distance(0, shape.heightM - 0.005, 0)).toBeLessThan(0.01);
    expect(sdf.distance(0, shape.heightM + 0.02, 0)).toBeGreaterThan(0);
  });
});

describe("surface nets mesher", () => {
  it("produces a closed, outward-facing mesh on the surface", () => {
    const g = meshSdf(sdf, 0.012);
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    const idx = g.getIndex()!;
    expect(idx.count).toBeGreaterThan(10000);
    let worst = 0;
    for (let i = 0; i < pos.count; i += 7) worst = Math.max(worst, Math.abs(sdf.distance(pos.getX(i), pos.getY(i), pos.getZ(i))));
    expect(worst).toBeLessThan(0.004);
    let agree = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
      const ux = pos.getX(b) - pos.getX(a), uy = pos.getY(b) - pos.getY(a), uz = pos.getZ(b) - pos.getZ(a);
      const vx = pos.getX(c) - pos.getX(a), vy = pos.getY(c) - pos.getY(a), vz = pos.getZ(c) - pos.getZ(a);
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nrm.getX(a) + ny * nrm.getY(a) + nz * nrm.getZ(a) > 0) agree++;
    }
    expect(agree / (idx.count / 3)).toBeGreaterThan(0.99);
  });
});

describe("surface nets watertightness", () => {
  it.each([
    ["default", DEFAULT_MEASUREMENTS],
    ["short, full figure", { heightCm: 150, chestCm: 120, waistCm: 115, hipsCm: 125, shoulderWidthCm: 44, inseamCm: 66 }],
    ["tall, slim", { heightCm: 200, chestCm: 80, waistCm: 64, hipsCm: 84, shoulderWidthCm: 48, inseamCm: 95 }],
  ])("has no holes for a %s body", (_label, m) => {
    const g = meshSdf(createBodySdf(computeBodyShape(m)), 0.012);
    const idx = g.getIndex()!;
    const edges = new Map<string, number>();
    for (let t = 0; t < idx.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = idx.getX(t + k);
        const b = idx.getX(t + ((k + 1) % 3));
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].filter((c) => c === 1)).toHaveLength(0);
  });
});

describe("garment conform", () => {
  const offset: [number, number, number] = [0, anchorY(shape, "shoulder"), 0];
  const run = (chest: number, shoulder: number) =>
    conformGarment(buildTee({ chest, waist: chest - 2, hem: chest, shoulder, sleeveLength: 20, length: 66 }), offset, sdf);

  it("leaves no colliding garment vertex inside the body", () => {
    const { geometry } = run(104, 44);
    const pos = geometry.getAttribute("position");
    const part = geometry.getAttribute("part");
    let inside = 0;
    for (let i = 0; i < pos.count; i++) {
      if (part.getX(i) === GARMENT_PART.fold) continue;
      if (sdf.distance(pos.getX(i) + offset[0], pos.getY(i) + offset[1], pos.getZ(i) + offset[2]) < 0) inside++;
    }
    expect(inside / pos.count).toBeLessThan(0.002);
  });

  it("never changes which file or size is shown, only reports where it is smaller than the body", () => {
    const roomy = run(110, 46);
    const tight = run(84, 38);
    expect(roomy.overlapFraction).toBeLessThan(0.01);
    expect(tight.overlapFraction).toBeGreaterThan(0.1);
    expect(tight.maxOverlapM).toBeGreaterThan(roomy.maxOverlapM);
  });

  it("settles the shoulders onto the body instead of floating above it", () => {
    const { geometry } = run(110, 46);
    const pos = geometry.getAttribute("position");
    const part = geometry.getAttribute("part");
    // Highest yoke point above the trapezius should sit within a couple of cm of the skin.
    let gapAtTop = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (part.getX(i) !== GARMENT_PART.yoke) continue;
      const x = pos.getX(i), y = pos.getY(i) + offset[1], z = pos.getZ(i);
      if (Math.abs(x - 0.12) < 0.02 && Math.abs(z) < 0.02) gapAtTop = Math.min(gapAtTop, sdf.distance(x, y, z));
    }
    expect(gapAtTop).toBeLessThan(0.02);
  });
});
