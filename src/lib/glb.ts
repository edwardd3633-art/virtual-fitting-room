import type { BufferGeometry } from "three";

/**
 * Minimal binary glTF 2.0 (GLB) writer for single-mesh, single-material
 * geometry with POSITION, NORMAL, indices and an optional per-vertex `part`
 * tag (written as the custom attribute _PART; three.js loads it as `_part`). Used to produce the demo
 * garment files; real garments would come from a DCC/garment tool export.
 */

export interface GlbOptions {
  name: string;
  /** sRGB hex colour, e.g. "#b5563a". */
  colorHex: string;
  roughness?: number;
  extras?: Record<string, unknown>;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function srgbHexToLinear(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [toLin((n >> 16) & 255), toLin((n >> 8) & 255), toLin(n & 255)];
}

const pad4 = (n: number) => (4 - (n % 4)) % 4;

export function geometryToGlb(geometry: BufferGeometry, opts: GlbOptions): Uint8Array {
  const pos = geometry.getAttribute("position");
  const nrm = geometry.getAttribute("normal");
  const idx = geometry.getIndex();
  if (!pos || !nrm || !idx) throw new Error("Geometry must be indexed and have position + normal attributes.");

  const positions = Float32Array.from(pos.array as ArrayLike<number>);
  const normals = Float32Array.from(nrm.array as ArrayLike<number>);
  const indices = Uint32Array.from(idx.array as ArrayLike<number>);
  const partAttr = geometry.getAttribute("part");
  const parts = partAttr ? Float32Array.from(partAttr.array as ArrayLike<number>) : null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }

  const views: ArrayBufferView[] = parts ? [positions, normals, indices, parts] : [positions, normals, indices];
  const offsets: number[] = [];
  let binLength = 0;
  for (const v of views) {
    offsets.push(binLength);
    binLength += v.byteLength + pad4(v.byteLength);
  }

  const json = {
    asset: { version: "2.0", generator: "virtual-fitting-room demo GLB writer" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: opts.name }],
    meshes: [{ name: opts.name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, ...(parts ? { _PART: 3 } : {}) }, indices: 2, material: 0, mode: 4 }] }],
    materials: [
      {
        name: `${opts.name}-material`,
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [...srgbHexToLinear(opts.colorHex), 1], metallicFactor: 0, roughnessFactor: opts.roughness ?? 0.85 },
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[1], byteLength: normals.byteLength, target: 34962 },
      { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength, target: 34963 },
      ...(parts ? [{ buffer: 0, byteOffset: offsets[3], byteLength: parts.byteLength, target: 34962 }] : []),
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: indices.length, type: "SCALAR" },
      ...(parts ? [{ bufferView: 3, componentType: 5126, count: parts.length, type: "SCALAR" }] : []),
    ],
    buffers: [{ byteLength: binLength }],
    extras: opts.extras ?? {},
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = jsonBytes.length + pad4(jsonBytes.length);
  const total = 12 + 8 + jsonPadded + 8 + binLength;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);

  dv.setUint32(12, jsonPadded, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonPadded);

  const binStart = 20 + jsonPadded;
  dv.setUint32(binStart, binLength, true);
  dv.setUint32(binStart + 4, CHUNK_BIN, true);
  views.forEach((v, i) => out.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), binStart + 8 + offsets[i]!));
  return out;
}

/** Read back the JSON chunk of a GLB (for tests and asset QA). */
export function readGlbJson(bytes: Uint8Array): Record<string, unknown> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error("Not a GLB file.");
  if (dv.getUint32(4, true) !== 2) throw new Error("Unsupported glTF version.");
  if (dv.getUint32(8, true) !== bytes.byteLength) throw new Error("GLB length header mismatch.");
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON) throw new Error("First chunk is not JSON.");
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
}
