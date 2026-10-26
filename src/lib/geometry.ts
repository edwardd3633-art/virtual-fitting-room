import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Quaternion, SphereGeometry, Vector3 } from "three";

/**
 * Small procedural-geometry helpers shared by the prototype avatar and the
 * demo garment generator. Coordinates in metres, +Y up, front is +Z.
 */

export interface Ring {
  y: number;
  rx: number;
  rz: number;
  /** Optional X offset of the ring centre. */
  cx?: number;
}

/** Interpolate extra rings between key rings so curves look smooth. */
export function refineRings(rings: Ring[], stepsBetween = 4): Ring[] {
  const out: Ring[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    for (let s = 0; s < stepsBetween; s++) {
      // Smoothstep easing keeps the silhouette from looking faceted at key rings.
      const t = s / stepsBetween;
      const e = t * t * (3 - 2 * t);
      out.push({
        y: a.y + (b.y - a.y) * t,
        rx: a.rx + (b.rx - a.rx) * e,
        rz: a.rz + (b.rz - a.rz) * e,
        cx: (a.cx ?? 0) + ((b.cx ?? 0) - (a.cx ?? 0)) * e,
      });
    }
  }
  out.push(rings[rings.length - 1]!);
  return out;
}

/**
 * Build an open tube through elliptical rings (ordered top→bottom or
 * bottom→top). Indexed, with position and normal attributes only.
 */
export function ellipticalTube(rings: Ring[], segments = 48): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const r of rings) {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push((r.cx ?? 0) + Math.sin(a) * r.rx, r.y, Math.cos(a) * r.rz);
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
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Open cylinder from `start` toward `end`, stripped to position/normal for merging. */
export function limbSegment(start: Vector3, end: Vector3, rTop: number, rBottom: number, openEnded = false): BufferGeometry {
  const dir = new Vector3().subVectors(end, start);
  const len = dir.length();
  const g = new CylinderGeometry(rTop, rBottom, len, 24, 1, openEnded);
  g.translate(0, -len / 2, 0);
  // Cylinder runs along -Y from the origin; rotate it onto `dir`.
  const from = new Vector3(0, -1, 0);
  const axis = new Vector3().crossVectors(from, dir.clone().normalize());
  const angle = Math.acos(Math.min(1, Math.max(-1, from.dot(dir.clone().normalize()))));
  if (axis.lengthSq() > 1e-10) g.applyQuaternion(new Quaternion().setFromAxisAngle(axis.normalize(), angle));
  else if (angle > Math.PI / 2) g.rotateX(Math.PI);
  g.translate(start.x, start.y, start.z);
  g.deleteAttribute("uv");
  return g;
}

export function sphere(center: Vector3, radius: number): BufferGeometry {
  const g = new SphereGeometry(radius, 24, 16);
  g.translate(center.x, center.y, center.z);
  g.deleteAttribute("uv");
  return g;
}
