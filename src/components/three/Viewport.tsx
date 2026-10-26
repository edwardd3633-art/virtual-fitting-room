"use client";

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import {
  AdditiveBlending,
  type BufferGeometry,
  CatmullRomCurve3,
  Color,
  LineCurve3,
  type Mesh,
  type MeshBasicMaterial,
  TubeGeometry,
  Vector3,
} from "three";
import type { BodyShape } from "@/domain/bodyShape";
import type { FocusMarker, RegionFocus } from "@/domain/fitRegions";
import { Avatar } from "./Avatar";

export type CameraView = "front" | "side" | "back";

const VIEW_AZIMUTH: Record<CameraView, number> = {
  front: 0,
  side: Math.PI / 2,
  back: Math.PI,
};

interface OrbitLike {
  target: Vector3;
  update(): void;
  autoRotate: boolean;
}

/**
 * Glides the camera around the avatar to the chosen view instead of jumping,
 * and moves the look-at point too, so focusing on a region zooms smoothly.
 */
function CameraRig({ view, nonce, targetY, distance, autoRotate }: { view: CameraView; nonce: number; targetY: number; distance: number; autoRotate: boolean }) {
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const camera = useThree((s) => s.camera);
  const anim = useRef<{ az0: number; az1: number; r0: number; y0: number; ty0: number; t: number } | null>(null);
  const placed = useRef(false);

  useEffect(() => {
    if (!controls) return;
    // First placement: look at the target straight away rather than gliding from the origin.
    if (!placed.current) controls.target.set(0, targetY, 0);
    placed.current = true;
    const from = camera.position.clone().sub(controls.target);
    const az0 = Math.atan2(from.x, from.z);
    let az1 = VIEW_AZIMUTH[view];
    // Take the short way round.
    while (az1 - az0 > Math.PI) az1 -= 2 * Math.PI;
    while (az1 - az0 < -Math.PI) az1 += 2 * Math.PI;
    anim.current = { az0, az1, r0: Math.hypot(from.x, from.z), y0: from.y, ty0: controls.target.y, t: 0 };
  }, [view, nonce, controls, camera, targetY, distance]);

  useEffect(() => {
    if (controls) controls.autoRotate = autoRotate;
  }, [controls, autoRotate]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 0.9);
    const e = 1 - Math.pow(1 - a.t, 3);
    const az = a.az0 + (a.az1 - a.az0) * e;
    const r = a.r0 + (distance - a.r0) * e;
    // Camera height relative to the target: a slight look-down, more of one when close.
    const lift = 0.08 * (distance / 3.8);
    const ty = a.ty0 + (targetY - a.ty0) * e;
    const y = a.y0 + (lift - a.y0) * e;
    controls.target.set(0, ty, 0);
    camera.position.set(Math.sin(az) * r, ty + y, Math.cos(az) * r);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

/** A thin light ring that sweeps up the body whenever `trigger` changes. */
function ScanSweep({ trigger, height, radius }: { trigger: string | undefined; height: number; radius: number }) {
  const ring = useRef<Mesh>(null);
  const t = useRef(1);
  useEffect(() => {
    if (trigger) t.current = 0;
  }, [trigger]);
  useFrame((_, dt) => {
    const m = ring.current;
    if (!m) return;
    t.current = Math.min(1, t.current + dt / 1.5);
    const e = t.current;
    m.visible = e < 1;
    m.position.y = 0.02 + e * height;
    (m.material as MeshBasicMaterial).opacity = Math.sin(e * Math.PI) * 0.85;
  });
  return (
    <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[radius * 0.98, radius, 96]} />
      <meshBasicMaterial color="#8fb4ff" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Tube along an ellipse at body height: the tape measure for a circumference. */
function ringGeometry(y: number, rx: number, rz: number): BufferGeometry {
  const pts: Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    pts.push(new Vector3(Math.sin(a) * rx, y, Math.cos(a) * rz));
  }
  return new TubeGeometry(new CatmullRomCurve3(pts, true), 192, 0.0035, 8, true);
}

/**
 * Where a measurement is taken, drawn as a glowing tape that writes itself on.
 * Rendered without depth testing so it reads through the garment, like an x-ray.
 */
function MeasureMarker({ marker, tone }: { marker: FocusMarker; tone: "accent" | "overlap" }) {
  const geo = useMemo(() => {
    if (marker.kind === "ring") return ringGeometry(marker.y, marker.section.rx + 0.004, marker.section.rz + 0.004);
    if (marker.kind === "span") {
      const h = marker.halfWidth;
      return new TubeGeometry(new LineCurve3(new Vector3(-h, marker.y, 0), new Vector3(h, marker.y, 0)), 64, 0.0035, 8, false);
    }
    return null;
  }, [marker]);
  useEffect(() => () => geo?.dispose(), [geo]);
  const mat = useRef<MeshBasicMaterial>(null);
  const t = useRef(0);
  useEffect(() => {
    t.current = 0;
  }, [geo]);
  useFrame((state, dt) => {
    if (!geo || !mat.current) return;
    t.current = Math.min(1, t.current + dt / 0.7);
    const e = 1 - Math.pow(1 - t.current, 3);
    const count = geo.index?.count ?? 0;
    geo.setDrawRange(0, Math.floor((count * e) / 3) * 3);
    mat.current.opacity = 0.75 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
  });
  if (!geo) return null;
  const color = tone === "overlap" ? "#ff7a94" : "#9fc0ff";
  const ends = marker.kind === "span" ? [-marker.halfWidth, marker.halfWidth] : [];
  return (
    <group renderOrder={10}>
      <mesh geometry={geo} renderOrder={10}>
        <meshBasicMaterial ref={mat} color={color} transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      {marker.kind === "span" &&
        ends.map((x) => (
          <mesh key={x} position={[x, marker.y, 0]} renderOrder={10}>
            <sphereGeometry args={[0.009, 16, 12]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
    </group>
  );
}

/** Glass-like turntable with a soft glowing rim. */
function Platform() {
  const glow = useMemo(() => new Color("#6d8dff"), []);
  return (
    <group>
      <mesh position-y={-0.011} receiveShadow>
        <cylinderGeometry args={[0.62, 0.64, 0.02, 128]} />
        <meshPhysicalMaterial color="#2a2e3a" roughness={0.42} metalness={0.15} clearcoat={0.8} clearcoatRoughness={0.25} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.0005}>
        <ringGeometry args={[0.607, 0.62, 128]} />
        <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.75} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.0004}>
        <ringGeometry args={[0.64, 1.1, 128]} />
        <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.035} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Studio lighting built from local light-formers: no HDRI download from a third-party CDN. */
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={2.2} position={[2.5, 3, 3]} scale={[3, 3, 1]} target={[0, 1, 0]} />
      <Lightformer form="rect" intensity={1.1} position={[-3, 2, 2]} scale={[2, 4, 1]} target={[0, 1, 0]} />
      <Lightformer form="rect" intensity={3} color="#9db6ff" position={[-2.5, 2.2, -3]} scale={[1, 5, 1]} target={[0, 1, 0]} />
      <Lightformer form="rect" intensity={2.5} color="#c9b8ff" position={[2.5, 2.2, -3]} scale={[1, 5, 1]} target={[0, 1, 0]} />
      <Lightformer form="circle" intensity={1.6} position={[0, 6, 0]} scale={4} rotation-x={Math.PI / 2} />
      <Lightformer form="rect" intensity={0.9} position={[0, 1.4, 4]} scale={[5, 2, 1]} target={[0, 1.2, 0]} />
    </Environment>
  );
}

export interface ViewportProps {
  /** DOM overlay (e.g. loading state) drawn over the canvas, outside the WebGL tree. */
  overlay?: ReactNode;
  shape: BodyShape;
  view: CameraView;
  /** Bump to re-apply the same view after the user has orbited away. */
  viewNonce: number;
  children?: ReactNode;
  label: string;
  autoRotate?: boolean;
  /** Changing this plays the scan sweep (e.g. on size change). */
  scanKey?: string;
  /**
   * Compare mode (FR-043): when given, a second copy of the same avatar is
   * drawn to the right wearing this content, and `children` moves to the left.
   */
  secondary?: ReactNode;
  /** Zoom to a body region and mark where it is measured; null shows the whole body. */
  focus?: RegionFocus | null;
  /** Marker colour: "overlap" when the shown size is smaller than the body there. */
  focusTone?: "accent" | "overlap";
}

/** How far each avatar sits from the centre in compare mode (m); platforms just touch. */
const PAIR_OFFSET_M = 0.62;

export default function Viewport({
  shape,
  view,
  viewNonce,
  children,
  label,
  overlay,
  autoRotate = false,
  scanKey,
  secondary,
  focus = null,
  focusTone = "accent",
}: ViewportProps) {
  const pair = secondary !== undefined;
  const half = pair ? PAIR_OFFSET_M : 0;
  const targetY = focus ? focus.y : shape.heightM * 0.5;
  // Pull back in compare mode so both avatars fit the frame; move in close on a focused region.
  const distance = shape.heightM * (focus ? (pair ? 1.9 : 1.05) : pair ? 2.9 : 2.25);
  const initial = useRef<[number, number, number]>([0, targetY + 0.08, distance]);
  const marker = focus && focus.marker.kind !== "none" ? <MeasureMarker marker={focus.marker} tone={focusTone} /> : null;

  return (
    <div className="viewport" role="img" aria-label={label}>
      <Canvas shadows="soft" dpr={[1, 1.75]} gl={{ alpha: true, antialias: true }} camera={{ position: initial.current, fov: 32, near: 0.05, far: 50 }}>
        <Studio />
        <ambientLight intensity={0.15} />
        <directionalLight position={[2, 4.5, 3]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.02}>
          <orthographicCamera attach="shadow-camera" args={[-1.6, 1.6, 2.2, -0.2, 0.1, 10]} />
        </directionalLight>
        <group position-x={-half}>
          <Platform />
          <Avatar shape={shape} />
          <Suspense fallback={null}>{children}</Suspense>
          {marker}
          <ScanSweep trigger={scanKey} height={shape.heightM + 0.02} radius={0.5} />
        </group>
        {pair && (
          <group position-x={half}>
            <Platform />
            <Avatar shape={shape} />
            <Suspense fallback={null}>{secondary}</Suspense>
            {marker}
            <ScanSweep trigger={scanKey} height={shape.heightM + 0.02} radius={0.5} />
          </group>
        )}
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          autoRotateSpeed={1.2}
          minDistance={1.0}
          maxDistance={6}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI / 2 + 0.05}
        />
        <CameraRig view={view} nonce={viewNonce} targetY={targetY} distance={distance} autoRotate={autoRotate} />
      </Canvas>
      {overlay}
    </div>
  );
}
