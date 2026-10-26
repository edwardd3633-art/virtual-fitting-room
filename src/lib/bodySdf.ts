import { ARM_ABDUCTION_RAD, type BodyShape, armDirection, shoulderJoint } from "@/domain/bodyShape";

/**
 * Signed distance field of the PROTOTYPE mannequin (FR-013).
 *
 * The body is a smooth union of a lofted torso (whose cross-sections keep the
 * entered chest / waist / hip circumferences) and rounded limb, neck and head
 * primitives. The same field is meshed for display (see surfaceNets.ts) and
 * used as the collision body when garments are conformed (see conform.ts), so
 * what you see is exactly what the garment is kept outside of.
 *
 * Coordinates: metres, +Y up, feet on Y=0, avatar faces +Z.
 */

export interface BodySdf {
  /** Signed distance in metres (negative inside). Approximate away from the surface. */
  distance(x: number, y: number, z: number): number;
  /** Axis-aligned bounds that contain the whole surface. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Primitive distance functions (after Inigo Quilez, iquilezles.org/articles).

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function sdEllipsoid(px: number, py: number, pz: number, c: V3, r: V3): number {
  const x = px - c[0];
  const y = py - c[1];
  const z = pz - c[2];
  const ax = x / r[0];
  const ay = y / r[1];
  const az = z / r[2];
  const bx = ax / r[0];
  const by = ay / r[1];
  const bz = az / r[2];
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
  return (k0 * (k0 - 1)) / k1;
}

/** Ellipsoid rotated about Z by `rot` (cos, sin): its Y axis follows a limb in the frontal plane. */
function sdEllipsoidZ(px: number, py: number, pz: number, c: V3, r: V3, rot: [number, number]): number {
  const x = px - c[0];
  const y = py - c[1];
  return sdEllipsoid(x * rot[0] + y * rot[1] + c[0], -x * rot[1] + y * rot[0] + c[1], pz, c, r);
}

/** Capsule whose radius varies linearly from r1 (at a) to r2 (at b). */
interface Cone {
  a: V3;
  b: V3;
  r1: number;
  r2: number;
  // Precomputed
  ba: V3;
  l2: number;
  rr: number;
  a2: number;
  il2: number;
}

function cone(a: V3, b: V3, r1: number, r2: number): Cone {
  const ba: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = r1 - r2;
  return { a, b, r1, r2, ba, l2, rr, a2: l2 - rr * rr, il2: 1 / l2 };
}

function sdCone(px: number, py: number, pz: number, c: Cone): number {
  const pax = px - c.a[0];
  const pay = py - c.a[1];
  const paz = pz - c.a[2];
  const y = pax * c.ba[0] + pay * c.ba[1] + paz * c.ba[2];
  const z = y - c.l2;
  const qx = pax * c.l2 - c.ba[0] * y;
  const qy = pay * c.l2 - c.ba[1] * y;
  const qz = paz * c.l2 - c.ba[2] * y;
  const x2s = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * c.l2;
  const z2 = z * z * c.l2;
  const k = Math.sign(c.rr) * c.rr * c.rr * x2s;
  if (Math.sign(z) * c.a2 * z2 > k) return Math.sqrt(x2s + z2) * c.il2 - c.r2;
  if (Math.sign(y) * c.a2 * y2 < k) return Math.sqrt(x2s + y2) * c.il2 - c.r1;
  return (Math.sqrt(x2s * c.a2 * c.il2) + y * c.rr) * c.il2 - c.r1;
}

// ---------------------------------------------------------------------------
// Bounding boxes let distance() skip limb groups that can't affect the result.

interface Box {
  min: V3;
  max: V3;
}

type Prim = Cone | { c: V3; r: V3 };

function boxOf(prims: Prim[], pad: number): Box {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  const grow = (p: V3, r: number) => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p[i]! - r - pad);
      max[i] = Math.max(max[i]!, p[i]! + r + pad);
    }
  };
  for (const p of prims) {
    if ("ba" in p) {
      grow(p.a, p.r1);
      grow(p.b, p.r2);
    } else {
      grow(p.c, Math.max(...p.r));
    }
  }
  return { min, max };
}

function boxDistance(x: number, y: number, z: number, b: Box): number {
  const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
  const dy = Math.max(b.min[1] - y, 0, y - b.max[1]);
  const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---------------------------------------------------------------------------
// Lofted torso: elliptical cross-sections interpolated along Y.

interface LoftKey {
  y: number;
  rx: number;
  rz: number;
  /** Z offset of the section centre (bust forward, seat back). */
  cz: number;
}

/** Cubic Hermite interpolation with Catmull-Rom style tangents over non-uniform keys. */
function makeLoft(keys: LoftKey[]) {
  const n = keys.length;
  const tangents = keys.map((k, i) => {
    const prev = keys[Math.max(0, i - 1)]!;
    const next = keys[Math.min(n - 1, i + 1)]!;
    const dy = next.y - prev.y || 1;
    return {
      rx: (next.rx - prev.rx) / dy,
      rz: (next.rz - prev.rz) / dy,
      cz: (next.cz - prev.cz) / dy,
    };
  });
  const y0 = keys[0]!.y;
  const y1 = keys[n - 1]!.y;
  const out = { rx: 0, rz: 0, cz: 0 };
  function exact(y: number) {
    const yy = Math.min(y1, Math.max(y0, y));
    let i = 0;
    while (i < n - 2 && yy > keys[i + 1]!.y) i++;
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const h = b.y - a.y;
    const t = (yy - a.y) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const ta = tangents[i]!;
    const tb = tangents[i + 1]!;
    out.rx = h00 * a.rx + h10 * h * ta.rx + h01 * b.rx + h11 * h * tb.rx;
    out.rz = h00 * a.rz + h10 * h * ta.rz + h01 * b.rz + h11 * h * tb.rz;
    out.cz = h00 * a.cz + h10 * h * ta.cz + h01 * b.cz + h11 * h * tb.cz;
    return out;
  }
  // Tabulate (≈2 mm steps) so distance() does a cheap linear lookup.
  const N = 512;
  const table = new Float64Array((N + 1) * 3);
  for (let i = 0; i <= N; i++) {
    const r = exact(y0 + ((y1 - y0) * i) / N);
    table[i * 3] = r.rx;
    table[i * 3 + 1] = r.rz;
    table[i * 3 + 2] = r.cz;
  }
  const scale = N / (y1 - y0);
  function at(y: number) {
    const f = Math.min(N, Math.max(0, (y - y0) * scale));
    const i = Math.min(N - 1, Math.floor(f));
    const t = f - i;
    const o = i * 3;
    out.rx = table[o]! + (table[o + 3]! - table[o]!) * t;
    out.rz = table[o + 1]! + (table[o + 4]! - table[o + 1]!) * t;
    out.cz = table[o + 2]! + (table[o + 5]! - table[o + 2]!) * t;
    return out;
  }
  return { at, y0, y1 };
}

function sdEllipse2(x: number, z: number, rx: number, rz: number): number {
  const ax = x / rx;
  const az = z / rz;
  const k0 = Math.sqrt(ax * ax + az * az);
  const k1 = Math.sqrt((ax * ax) / (rx * rx) + (az * az) / (rz * rz));
  if (k1 < 1e-9) return -Math.min(rx, rz);
  return (k0 * (k0 - 1)) / k1;
}

// ---------------------------------------------------------------------------

/** Build the body SDF for a measured body shape. Pure: same shape → same field. */
export function createBodySdf(b: BodyShape): BodySdf {
  const H = b.heightM;
  const s = H / 1.7; // proportional scale for details not driven by measurements
  const { hips, waist, chest } = b.sections;

  // Underarm level: where the arm leaves the torso.
  const armpitY = b.y.shoulder - 0.085 * s;

  // Torso loft keys, bottom to top. Circumference-bearing keys (hip, waist,
  // chest) use the measured ellipses exactly; the others are shaped around them.
  const loft = makeLoft([
    // Rounded seat that tucks between the thighs (no flat cap to crease against the legs).
    { y: b.y.crotch - 0.035 * s, rx: hips.rx * 0.45, rz: hips.rz * 0.5, cz: -0.004 * s },
    { y: b.y.crotch - 0.005 * s, rx: hips.rx * 0.82, rz: hips.rz * 0.82, cz: -0.004 * s },
    { y: b.y.crotch + 0.045 * s, rx: hips.rx * 0.97, rz: hips.rz * 0.97, cz: -0.006 * s },
    { y: b.y.hip, rx: hips.rx, rz: hips.rz, cz: -0.006 * s },
    { y: b.y.waist, rx: waist.rx, rz: waist.rz, cz: 0 },
    { y: b.y.chest, rx: chest.rx, rz: chest.rz, cz: 0.004 * s },
    { y: armpitY, rx: Math.max(chest.rx * 0.97, b.shoulderHalfWidthM * 0.8), rz: chest.rz * 0.93, cz: 0 },
    { y: b.y.shoulder - 0.025 * s, rx: b.shoulderHalfWidthM * 0.78, rz: chest.rz * 0.72, cz: -0.006 * s },
    { y: b.y.neck - 0.03 * s, rx: b.neckRadiusM * 1.2, rz: b.neckRadiusM * 1.1, cz: -0.008 * s },
    // Continue into the neck so the top cap is buried inside it.
    { y: b.y.neck + 0.02 * s, rx: b.neckRadiusM * 0.98, rz: b.neckRadiusM * 0.98, cz: -0.006 * s },
  ]);

  // Shoulder girdle: side of the neck base → shoulder point (acromion), giving the trapezius slope.
  const traps = ([1, -1] as const).map((side) =>
    cone(
      [side * b.neckRadiusM * 0.55, b.y.neck - 0.05 * s, -0.012 * s],
      [side * (b.shoulderHalfWidthM - 0.04 * s), b.y.shoulder - 0.012 * s, -0.008 * s],
      0.036 * s,
      0.034 * s,
    ),
  );

  // Arms.
  const arms = ([1, -1] as const).map((side) => {
    const [jx, jy, jz] = shoulderJoint(b, side);
    const [dx, dy, dz] = armDirection(side);
    const upper = b.armLengthM * 0.47;
    const fore = b.armLengthM * 0.4;
    const r = b.upperArmRadiusM;
    const joint: V3 = [jx, jy, jz];
    // Forearm angles slightly forward (relaxed carrying angle).
    const elbow: V3 = [jx + dx * upper, jy + dy * upper, jz + dz * upper - 0.005 * s];
    const wrist: V3 = [elbow[0] + dx * fore, elbow[1] + dy * fore, elbow[2] + 0.03 * s];
    const handDir: V3 = [dx, dy, 0.1];
    const hl = Math.hypot(...handDir);
    const hd: V3 = [handDir[0] / hl, handDir[1] / hl, handDir[2] / hl];
    const handLen = 0.105 * s;
    const palmC: V3 = [wrist[0] + hd[0] * handLen * 0.42, wrist[1] + hd[1] * handLen * 0.42, wrist[2] + hd[2] * handLen * 0.42];
    const tip: V3 = [wrist[0] + hd[0] * handLen, wrist[1] + hd[1] * handLen, wrist[2] + hd[2] * handLen];
    return {
      deltoid: { c: [jx + side * 0.004 * s, jy, jz] as V3, r: [r * 1.12, r * 1.2, r * 1.1] as V3 },
      upper: cone(joint, elbow, r * 1.05, r * 0.75),
      // Muscle ellipsoids are aligned with the bone (rotated by the A-pose angle).
      rot: [Math.cos(side * ARM_ABDUCTION_RAD), Math.sin(side * ARM_ABDUCTION_RAD)] as [number, number],
      bicep: { c: [joint[0] + dx * upper * 0.45, joint[1] + dy * upper * 0.45, joint[2] + 0.006 * s] as V3, r: [r * 0.95, upper * 0.32, r * 1.0] as V3 },
      fore: cone(elbow, wrist, r * 0.78, r * 0.5),
      foreMuscle: { c: [elbow[0] + dx * fore * 0.25, elbow[1] + dy * fore * 0.25, elbow[2] + 0.005 * s] as V3, r: [r * 0.82, fore * 0.3, r * 0.8] as V3 },
      // Mitten hand: flattened palm + finger block + thumb.
      palm: { c: palmC, r: [0.022 * s, 0.045 * s, 0.038 * s] as V3 },
      fingers: cone(palmC, tip, 0.017 * s, 0.011 * s),
      thumb: cone(
        [wrist[0] - side * 0.002 * s, wrist[1] - 0.02 * s, wrist[2] + 0.022 * s],
        [wrist[0] - side * 0.01 * s, wrist[1] - 0.06 * s, wrist[2] + 0.04 * s],
        0.011 * s,
        0.008 * s,
      ),
      handSide: side,
    };
  });

  // Legs.
  const ankleY = 0.075 * s;
  const legs = ([1, -1] as const).map((side) => {
    const x = side * b.legOffsetXM;
    const hipJ: V3 = [x, b.y.crotch + 0.02 * s, -0.004 * s];
    const knee: V3 = [x * 0.82, b.y.knee, 0.006 * s];
    const ankle: V3 = [x * 0.74, ankleY, -0.012 * s];
    const tr = b.thighRadiusM;
    return {
      // Thigh top is slimmer than the hip so the union doesn't bulge where they overlap.
      thigh: cone(hipJ, knee, tr * 0.84, tr * 0.58),
      quad: { c: [x * 0.95, b.y.crotch - (b.y.crotch - b.y.knee) * 0.3, 0.012 * s] as V3, r: [tr * 0.88, (b.y.crotch - b.y.knee) * 0.42, tr * 0.9] as V3 },
      knee: { c: knee, r: [tr * 0.55, tr * 0.6, tr * 0.58] as V3 },
      shin: cone(knee, ankle, b.calfRadiusM * 0.85, b.calfRadiusM * 0.5),
      calf: {
        c: [knee[0] * 0.98, b.y.knee - (b.y.knee - ankleY) * 0.3, -0.016 * s] as V3,
        r: [b.calfRadiusM * 0.95, (b.y.knee - ankleY) * 0.3, b.calfRadiusM * 0.98] as V3,
      },
      foot: cone([ankle[0], 0.035 * s, -0.03 * s], [ankle[0] * 1.08, 0.022 * s, 0.13 * s], 0.035 * s, 0.026 * s),
      heel: { c: [ankle[0], 0.04 * s, -0.035 * s] as V3, r: [0.03 * s, 0.04 * s, 0.035 * s] as V3 },
    };
  });

  // Neck and head.
  const neck = cone([0, b.y.neck - 0.06 * s, -0.01 * s], [0, b.y.neck + 0.06 * s, 0.002 * s], b.neckRadiusM * 1.05, b.neckRadiusM * 0.92);
  const hr = b.headRadiusM;
  const hc: V3 = [0, b.y.headCenter, 0];
  // Abstract display-mannequin head: cranium, tapered lower face, chin, a soft nose ridge and flat ears.
  const cranium = { c: [0, hc[1] + hr * 0.1, -hr * 0.06] as V3, r: [hr * 0.8, hr * 0.94, hr * 1.0] as V3 };
  const face = { c: [0, hc[1] - hr * 0.25, hr * 0.18] as V3, r: [hr * 0.64, hr * 0.74, hr * 0.7] as V3 };
  const jaw = cone([0, hc[1] - hr * 0.42, hr * 0.2], [0, hc[1] - hr * 0.74, hr * 0.42], hr * 0.44, hr * 0.27);
  const nose = cone([0, hc[1] + hr * 0.02, hr * 0.74], [0, hc[1] - hr * 0.22, hr * 0.84], hr * 0.07, hr * 0.1);
  const brow = { c: [0, hc[1] + hr * 0.12, hr * 0.6] as V3, r: [hr * 0.56, hr * 0.14, hr * 0.26] as V3 };
  const ears = ([1, -1] as const).map((side) => ({ c: [side * hr * 0.78, hc[1] - hr * 0.08, -hr * 0.04] as V3, r: [hr * 0.06, hr * 0.22, hr * 0.13] as V3 }));

  const girdleBox = boxOf([...traps, neck], 0);
  const headBox = boxOf([cranium, face, jaw, nose, brow, ...ears], 0);
  const armBoxes = arms.map((a) => boxOf([a.deltoid, a.upper, a.bicep, a.fore, a.foreMuscle, a.palm, a.fingers, a.thumb], 0));
  const legBoxes = legs.map((l) => boxOf([l.thigh, l.quad, l.knee, l.shin, l.calf, l.foot, l.heel], 0));

  const torsoTop = loft.y1;
  const torsoBottom = loft.y0;

  function torso(x: number, y: number, z: number): number {
    const sec = loft.at(y);
    const d2 = sdEllipse2(x, z - sec.cz, sec.rx, sec.rz);
    const dy = Math.max(torsoBottom - y, y - torsoTop);
    if (dy <= 0) return d2;
    return d2 <= 0 ? dy : Math.sqrt(d2 * d2 + dy * dy);
  }

  function distance(x: number, y: number, z: number): number {
    // Torso + shoulder girdle + neck.
    let d = torso(x, y, z);
    if (boxDistance(x, y, z, girdleBox) < d + 0.045 * s) {
      d = smin(d, sdCone(x, y, z, traps[0]!), 0.045 * s);
      d = smin(d, sdCone(x, y, z, traps[1]!), 0.045 * s);
      d = smin(d, sdCone(x, y, z, neck), 0.04 * s);
    }

    // Head: only evaluate when near (cheap bounding test).
    if (boxDistance(x, y, z, headBox) < d + 0.035 * s) {
      let h = sdEllipsoid(x, y, z, cranium.c, cranium.r);
      h = smin(h, sdEllipsoid(x, y, z, face.c, face.r), 0.07 * s);
      h = smin(h, sdCone(x, y, z, jaw), 0.06 * s);
      h = smin(h, sdEllipsoid(x, y, z, brow.c, brow.r), 0.03 * s);
      h = smin(h, sdCone(x, y, z, nose), 0.045 * s);
      h = smin(h, sdEllipsoid(x, y, z, ears[0]!.c, ears[0]!.r), 0.02 * s);
      h = smin(h, sdEllipsoid(x, y, z, ears[1]!.c, ears[1]!.r), 0.02 * s);
      d = smin(d, h, 0.035 * s);
    }

    // Arms: pick the side the point is on; the other arm is far away.
    const side = x >= 0 ? 0 : 1;
    const arm = arms[side]!;
    if (boxDistance(x, y, z, armBoxes[side]!) < d + 0.025 * s) {
      let a = sdEllipsoid(x, y, z, arm.deltoid.c, arm.deltoid.r);
      a = smin(a, sdCone(x, y, z, arm.upper), 0.04 * s);
      a = smin(a, sdEllipsoidZ(x, y, z, arm.bicep.c, arm.bicep.r, arm.rot), 0.03 * s);
      a = smin(a, sdCone(x, y, z, arm.fore), 0.04 * s);
      a = smin(a, sdEllipsoidZ(x, y, z, arm.foreMuscle.c, arm.foreMuscle.r, arm.rot), 0.03 * s);
      if (y < arm.fore.b[1] + 0.06 * s) {
        let hand = sdEllipsoid(x, y, z, arm.palm.c, arm.palm.r);
        hand = smin(hand, sdCone(x, y, z, arm.fingers), 0.02 * s);
        hand = smin(hand, sdCone(x, y, z, arm.thumb), 0.012 * s);
        a = smin(a, hand, 0.02 * s);
      }
      // Larger blend under the arm would web it to the torso, so keep it tight.
      d = smin(d, a, 0.025 * s);
    }

    // Legs.
    if (boxDistance(x, y, z, legBoxes[side]!) < d + 0.02 * s) {
      const leg = legs[side]!;
      let l = sdCone(x, y, z, leg.thigh);
      l = smin(l, sdEllipsoid(x, y, z, leg.quad.c, leg.quad.r), 0.05 * s);
      l = smin(l, sdEllipsoid(x, y, z, leg.knee.c, leg.knee.r), 0.03 * s);
      l = smin(l, sdCone(x, y, z, leg.shin), 0.04 * s);
      l = smin(l, sdEllipsoid(x, y, z, leg.calf.c, leg.calf.r), 0.05 * s);
      if (y < 0.14 * s) {
        let f = sdCone(x, y, z, leg.foot);
        f = smin(f, sdEllipsoid(x, y, z, leg.heel.c, leg.heel.r), 0.02 * s);
        l = smin(l, f, 0.03 * s);
      }
      d = smin(d, l, 0.035 * s);
    }

    // Floor: nothing below the soles.
    return Math.max(d, -y);
  }

  const reach = Math.max(...arms.flatMap((a) => [Math.abs(a.fingers.b[0]), Math.abs(a.thumb.b[0])])) + 0.04 * s;
  const halfX = Math.max(reach, hips.rx + 0.05, b.shoulderHalfWidthM + 0.08 * s);
  const halfZ = Math.max(chest.rz, hips.rz, waist.rz) + 0.08 * s;
  return {
    distance,
    bounds: { min: [-halfX, -0.01, -halfZ], max: [halfX, H + 0.02, Math.max(halfZ, 0.2 * s)] },
  };
}

/** Central-difference gradient (unnormalised). */
export function sdfGradient(sdf: BodySdf, x: number, y: number, z: number, out: V3 = [0, 0, 0], h = 0.0015): V3 {
  out[0] = sdf.distance(x + h, y, z) - sdf.distance(x - h, y, z);
  out[1] = sdf.distance(x, y + h, z) - sdf.distance(x, y - h, z);
  out[2] = sdf.distance(x, y, z + h) - sdf.distance(x, y, z - h);
  return out;
}
