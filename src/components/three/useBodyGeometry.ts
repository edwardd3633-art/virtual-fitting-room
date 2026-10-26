"use client";

import { useEffect, useState } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import type { BodyShape } from "@/domain/bodyShape";
import { createBodySdf } from "@/lib/bodySdf";
import { meshSdf } from "@/lib/surfaceNets";

interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
}

/** Grid cell sizes (m): a quick draft first, then full detail. */
const DRAFT_CELL_M = 0.016;
const FINE_CELL_M = 0.0075;

const cache = new Map<string, Promise<MeshData>>();
let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { shape: BodyShape; cell: number; resolve: (d: MeshData) => void }>();

function meshOnMainThread(shape: BodyShape, cell: number): MeshData {
  const g = meshSdf(createBodySdf(shape), cell);
  return {
    position: g.getAttribute("position").array as Float32Array,
    normal: g.getAttribute("normal").array as Float32Array,
    index: g.getIndex()!.array as Uint32Array,
  };
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL("../../workers/bodyMesh.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<MeshData & { id: number }>) => {
      waiting.get(e.data.id)?.resolve(e.data);
      waiting.delete(e.data.id);
    };
    // If the worker can't run, finish pending requests here and stop using it.
    w.onerror = (e) => {
      console.warn("Body mesh worker failed; meshing on the main thread instead.", e.message);
      worker = null;
      for (const [id, req] of waiting) {
        req.resolve(meshOnMainThread(req.shape, req.cell));
        waiting.delete(id);
      }
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

function runMesh(shape: BodyShape, cell: number): Promise<MeshData> {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => meshOnMainThread(shape, cell));
  return new Promise<MeshData>((resolve) => {
    const id = nextId++;
    waiting.set(id, { shape, cell, resolve });
    w.postMessage({ id, shape, cell });
  });
}

/**
 * Latest-wins scheduling per resolution: at most one job running and one
 * queued. Dragging a slider replaces the queued shape instead of piling up work.
 */
interface Job {
  key: string;
  shape: BodyShape;
  resolve: (d: MeshData) => void;
}
const queued = new Map<number, Job>();
const busy = new Set<number>();

function pump(cell: number) {
  if (busy.has(cell)) return;
  const job = queued.get(cell);
  if (!job) return;
  queued.delete(cell);
  busy.add(cell);
  void runMesh(job.shape, cell).then((d) => {
    busy.delete(cell);
    job.resolve(d);
    pump(cell);
  });
}

function requestMesh(shape: BodyShape, cell: number): Promise<MeshData> {
  const key = `${cell}|${JSON.stringify(shape)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Promise<MeshData>((resolve) => {
    const superseded = queued.get(cell);
    if (superseded) cache.delete(superseded.key);
    queued.set(cell, { key, shape, resolve });
  });
  cache.set(key, p);
  // Keep the cache small: editors produce a new shape per slider step.
  if (cache.size > 16) cache.delete(cache.keys().next().value!);
  pump(cell);
  return p;
}

function toGeometry(d: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  // Copy: cached arrays are shared between views.
  g.setAttribute("position", new BufferAttribute(d.position.slice(), 3));
  g.setAttribute("normal", new BufferAttribute(d.normal.slice(), 3));
  g.setIndex(new BufferAttribute(d.index.slice(), 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Body mesh for a shape, built in a worker: a coarse draft appears quickly,
 * then the detailed mesh replaces it. Keeps returning the previous mesh until
 * a new one is ready so the avatar never blinks out while editing.
 */
export function useBodyGeometry(shape: BodyShape): BufferGeometry | null {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  useEffect(() => {
    let live = true;
    let fineDone = false;
    void requestMesh(shape, DRAFT_CELL_M).then((d) => {
      if (live && !fineDone) setGeometry(toGeometry(d));
    });
    void requestMesh(shape, FINE_CELL_M).then((d) => {
      fineDone = true;
      if (live) setGeometry(toGeometry(d));
    });
    return () => {
      live = false;
    };
  }, [shape]);
  // Free the previous mesh once it has been replaced (and on unmount).
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}
