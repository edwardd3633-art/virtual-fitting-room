/// <reference lib="webworker" />
import type { BodyShape } from "@/domain/bodyShape";
import { createBodySdf } from "@/lib/bodySdf";
import { meshSdf } from "@/lib/surfaceNets";

/** Meshes the body SDF off the main thread so sliders and the page stay responsive. */
self.onmessage = (e: MessageEvent<{ id: number; shape: BodyShape; cell: number }>) => {
  const { id, shape, cell } = e.data;
  const g = meshSdf(createBodySdf(shape), cell);
  const position = g.getAttribute("position").array as Float32Array;
  const normal = g.getAttribute("normal").array as Float32Array;
  const index = g.getIndex()!.array as Uint32Array;
  (self as unknown as Worker).postMessage({ id, position, normal, index }, [position.buffer, normal.buffer, index.buffer]);
};
