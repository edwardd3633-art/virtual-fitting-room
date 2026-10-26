import { BufferGeometry, Float32BufferAttribute } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ARM_ABDUCTION_RAD, ellipseFromCircumference } from "@/domain/bodyShape";
import type { GarmentMeasurementsCm } from "@/domain/catalog";
import type { DemoGarmentKind } from "@/adapters/retailers/demoCatalog";
import { type Ring, refineRings } from "./geometry";

/**
 * Procedural DEMO garment shapes. Each size is built from its own
 * measurement row, so size changes produce genuinely different geometry,
 * but there is no pattern, seam, or fabric model behind it.
 *
 * Origin conventions (must match GarmentAnchor):
 *  - tee: origin at the shoulder line, garment extends down -Y
 *  - a-line-skirt: origin at the waistline
 *
 * Every vertex carries a `part` tag (GARMENT_PART) that the conform step
 * uses to decide how that vertex may move.
 */

export const GARMENT_PART = {
  /** Main panels: kept outside the body, rest on up-facing surfaces. */
  shell: 0,
  /** Sleeves: like shell, but sit a little further out so they layer over it. */
  sleeve: 1,
  /** Inner turn-back at hems and cuffs: follows its neighbours, never collides. */
  fold: 2,
  /** Rib collar band. */
  collar: 3,
  /** Shoulder yoke: like shell, but its overlap isn't reported (approximate construction, mostly under the sleeves). */
  yoke: 4,
  /** Sleeve cap over the deltoid: like sleeve, overlap not reported. */
  sleeveCap: 5,
} as const;

const cm = (v: number) => v / 100;

function section(circCm: number, depthRatio: number, y: number): Ring {
  const e = ellipseFromCircumference(cm(circCm), depthRatio);
  return { y, rx: e.rx, rz: e.rz };
}

interface TubeRing extends Ring {
  part: number;
  /** Optional per-angle Y offset (angle 0 = front, +Z). */
  dy?: (angle: number) => number;
}

/** Welded tube through rings, with a per-vertex `part` attribute. */
function tube(rings: TubeRing[], segments: number): BufferGeometry {
  const positions: number[] = [];
  const parts: number[] = [];
  const indices: number[] = [];
  for (const r of rings) {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push((r.cx ?? 0) + Math.sin(a) * r.rx, r.y + (r.dy?.(a) ?? 0), Math.cos(a) * r.rz);
      parts.push(r.part);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * segments + s;
      const b = i * segments + ((s + 1) % segments);
      const c = (i + 1) * segments + s;
      const d = (i + 1) * segments + ((s + 1) % segments);
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("part", new Float32BufferAttribute(parts, 1));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Refine key rings, carrying the part tag and dy of the ring each sample came from. */
function refineTagged(rings: TubeRing[], steps: number): TubeRing[] {
  const out: TubeRing[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    const seg = refineRings([a, b], steps).slice(0, steps);
    seg.forEach((r, k) => {
      const t = k / steps;
      const dy = a.dy || b.dy ? (ang: number) => (a.dy?.(ang) ?? 0) * (1 - t) + (b.dy?.(ang) ?? 0) * t : undefined;
      out.push({ ...r, part: t < 0.5 ? a.part : b.part, dy });
    });
  }
  out.push(rings[rings.length - 1]!);
  return out;
}

/** Rings for a turned-back hem: a short band folded up inside the opening. */
function hemFold(last: TubeRing, depth: number, dir: 1 | -1): TubeRing[] {
  return [
    { ...last, y: last.y + dir * 0.002, rx: last.rx * 0.985, rz: last.rz * 0.985, part: GARMENT_PART.fold },
    { ...last, y: last.y + dir * depth, rx: last.rx * 0.975, rz: last.rz * 0.975, part: GARMENT_PART.fold },
  ];
}

/** Sleeves hang a touch wider than the A-pose arm. */
const SLEEVE_ANGLE = ARM_ABDUCTION_RAD + (1 * Math.PI) / 180;

interface SleeveAxis {
  start: [number, number];
  dir: [number, number];
  radius: number;
  length: number;
}

function sleeveAxis(side: 1 | -1, shoulderHalf: number, radius: number, length: number): SleeveAxis {
  return {
    start: [side * (shoulderHalf - 0.036), -radius * 0.5],
    dir: [side * Math.sin(SLEEVE_ANGLE), -Math.cos(SLEEVE_ANGLE)],
    radius,
    length,
  };
}

/**
 * Drop bodice triangles inside the armhole so the arm passes through an
 * opening (covered by the sleeve) instead of through the side panel.
 */
function cutArmholes(g: BufferGeometry, axes: SleeveAxis[]): BufferGeometry {
  const pos = g.getAttribute("position");
  const idx = g.getIndex()!;
  const inside = (v: number) => {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    return axes.some((a) => {
      const rx = x - a.start[0], ry = y - a.start[1];
      const t = rx * a.dir[0] + ry * a.dir[1];
      if (t < -a.radius * 0.3 || t > a.length) return false;
      const px = rx - t * a.dir[0], py = ry - t * a.dir[1];
      return px * px + py * py + z * z < (a.radius * 0.75) ** 2;
    });
  };
  const keep: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    if (!inside(a) && !inside(b) && !inside(c)) keep.push(a, b, c);
  }
  g.setIndex(keep);
  return g;
}

/** Sleeve tube built down -Y, then rotated onto its axis. */
function sleeve(side: 1 | -1, axis: SleeveAxis, segments: number): BufferGeometry {
  const { radius, length } = axis;
  // Build vertically (down -Y), then rotate about Z and move to the shoulder.
  // The cap rises over the shoulder on the outside and drops to the underarm seam on the inside.
  const capLift = (a: number) => (Math.cos(a - side * (Math.PI / 2)) * 0.6 - 0.1) * radius;
  const rings: TubeRing[] = [
    { y: radius * 0.5, rx: radius * 0.9, rz: radius * 0.98, part: GARMENT_PART.sleeveCap, dy: capLift },
    { y: -length * 0.35, rx: radius, rz: radius, part: GARMENT_PART.sleeve },
    { y: -length, rx: radius * 0.97, rz: radius * 0.97, part: GARMENT_PART.sleeve },
  ];
  const last = rings[rings.length - 1]!;
  const g = tube([...refineTagged(rings, 8), ...hemFold(last, 0.022, 1)], segments);
  g.rotateZ(side * SLEEVE_ANGLE);
  g.translate(axis.start[0], axis.start[1], 0);
  return g;
}

export function buildTee(m: GarmentMeasurementsCm): BufferGeometry {
  const chest = m.chest ?? 100;
  const waist = m.waist ?? chest;
  const hem = m.hem ?? waist;
  const shoulderHalf = cm(m.shoulder ?? 44) / 2;
  const chestSec = section(chest, 0.72, 0);
  // Armhole depth grows slightly with size, as graded patterns typically do.
  const chestY = -(0.17 + (chest - 104) / 600);
  const length = cm(m.length);

  // Front neckline scoops lower than the back.
  const scoop = (a: number) => -0.022 * Math.max(0, Math.cos(a)) ** 2;
  const neck = { y: 0.05, rx: 0.088, rz: 0.078, dy: scoop };

  const rings: TubeRing[] = [
    { ...neck, y: neck.y + 0.016, rx: neck.rx * 0.93, rz: neck.rz * 0.93, part: GARMENT_PART.collar },
    { ...neck, part: GARMENT_PART.collar },
    { y: 0.04, rx: neck.rx * 1.35, rz: chestSec.rz * 0.66, part: GARMENT_PART.yoke, dy: (a) => scoop(a) * 0.6 },
    { y: 0.01, rx: shoulderHalf * 0.98, rz: chestSec.rz * 0.84, part: GARMENT_PART.yoke },
    { y: -0.06, rx: Math.max(shoulderHalf * 1.02, chestSec.rx), rz: chestSec.rz * 0.97, part: GARMENT_PART.yoke },
    { ...section(chest, 0.72, chestY), part: GARMENT_PART.shell },
    { ...section(waist, 0.76, -0.38), part: GARMENT_PART.shell },
    { ...section(hem, 0.78, -length), part: GARMENT_PART.shell },
  ];
  const last = rings[rings.length - 1]!;
  const sleeveLen = cm(m.sleeveLength ?? 20);
  const sleeveR = cm(chest * 0.37) / (2 * Math.PI);
  const axes = ([1, -1] as const).map((side) => sleeveAxis(side, shoulderHalf, sleeveR, sleeveLen + sleeveR * 0.25));
  const body = cutArmholes(tube([...refineTagged(rings, 8), ...hemFold(last, 0.03, 1)], 112), axes);
  const sleeves = ([1, -1] as const).map((side, i) => sleeve(side, axes[i]!, 56));

  const merged = mergeGeometries([body, ...sleeves]);
  if (!merged) throw new Error("Failed to merge tee geometry");
  return merged;
}

export function buildALineSkirt(m: GarmentMeasurementsCm): BufferGeometry {
  const waist = m.waist ?? 70;
  const hip = m.hip ?? waist + 28;
  const hem = m.hem ?? hip * 1.6;
  const rings: TubeRing[] = [
    // The waistband is a measured part (waist), so it is a shell panel and its overlap is reported.
    { ...section(waist, 0.78, 0.035), rx: section(waist, 0.78, 0).rx * 0.985, rz: section(waist, 0.78, 0).rz * 0.985, part: GARMENT_PART.shell },
    { ...section(waist, 0.78, 0), part: GARMENT_PART.shell },
    { ...section(waist + (hip - waist) * 0.55, 0.79, -0.09), part: GARMENT_PART.shell },
    { ...section(hip, 0.8, -0.18), part: GARMENT_PART.shell },
    { ...section(hem, 0.86, -cm(m.length)), part: GARMENT_PART.shell },
  ];
  const last = rings[rings.length - 1]!;
  return tube([...refineTagged(rings, 10), ...hemFold(last, 0.03, 1)], 128);
}

export function buildDemoGarment(kind: DemoGarmentKind, m: GarmentMeasurementsCm): BufferGeometry {
  switch (kind) {
    case "tee":
      return buildTee(m);
    case "a-line-skirt":
      return buildALineSkirt(m);
  }
}
