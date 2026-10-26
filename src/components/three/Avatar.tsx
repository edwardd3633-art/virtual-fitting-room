"use client";

import { DoubleSide } from "three";
import type { BodyShape } from "@/domain/bodyShape";
import { useBodyGeometry } from "./useBodyGeometry";

/**
 * PROTOTYPE mannequin (FR-010/FR-013): a sculpted signed-distance body driven
 * by the six measurements (see lib/bodySdf.ts). Replace with a licensed,
 * rigged morphable model per FR-016.
 */
export function Avatar({ shape }: { shape: BodyShape }) {
  const geometry = useBodyGeometry(shape);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {/* Double-sided: normals come from the SDF, so the odd mis-wound mesher triangle still shades correctly instead of showing a hole. */}
      <meshPhysicalMaterial side={DoubleSide} color="#d8d4ce" roughness={0.38} metalness={0} clearcoat={0.35} clearcoatRoughness={0.35} sheen={0.4} sheenRoughness={0.6} sheenColor="#ffffff" />
    </mesh>
  );
}
