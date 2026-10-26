"use client";

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { AdditiveBlending, Color, type Mesh, type MeshBasicMaterial, Vector3 } from "three";
import type { BodyShape } from "@/domain/bodyShape";
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

/** Glides the camera around the avatar to the chosen view instead of jumping. */
function CameraRig({ view, nonce, targetY, distance, autoRotate }: { view: CameraView; nonce: number; targetY: number; distance: number; autoRotate: boolean }) {
  const controls = useThree((s) => s.controls) as OrbitLike | null;
  const camera = useThree((s) => s.camera);
  const anim = useRef<{ from: Vector3; az0: number; az1: number; r0: number; y0: number; t: number } | null>(null);

  useEffect(() => {
    if (!controls) return;
    controls.target.set(0, targetY, 0);
    const from = camera.position.clone();
    const az0 = Math.atan2(from.x, from.z);
    let az1 = VIEW_AZIMUTH[view];
    // Take the short way round.
    while (az1 - az0 > Math.PI) az1 -= 2 * Math.PI;
    while (az1 - az0 < -Math.PI) az1 += 2 * Math.PI;
    anim.current = { from, az0, az1, r0: Math.hypot(from.x, from.z), y0: from.y, t: 0 };
  }, [view, nonce, controls, camera, targetY]);

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
    const y = a.y0 + (targetY + 0.08 - a.y0) * e;
    camera.position.set(Math.sin(az) * r, y, Math.cos(az) * r);
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
}

export default function Viewport({ shape, view, viewNonce, children, label, overlay, autoRotate = false, scanKey }: ViewportProps) {
  const targetY = shape.heightM * 0.5;
  const distance = shape.heightM * 2.25;
  const initial = useRef<[number, number, number]>([0, targetY + 0.08, distance]);

  return (
    <div className="viewport" role="img" aria-label={label}>
      <Canvas shadows="soft" dpr={[1, 1.75]} gl={{ alpha: true, antialias: true }} camera={{ position: initial.current, fov: 32, near: 0.05, far: 50 }}>
        <Studio />
        <ambientLight intensity={0.15} />
        <directionalLight position={[2, 4.5, 3]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.02}>
          <orthographicCamera attach="shadow-camera" args={[-1.2, 1.2, 2.2, -0.2, 0.1, 10]} />
        </directionalLight>
        <Platform />
        <Avatar shape={shape} />
        <Suspense fallback={null}>{children}</Suspense>
        <ScanSweep trigger={scanKey} height={shape.heightM + 0.02} radius={0.5} />
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
          target={[0, targetY, 0]}
        />
        <CameraRig view={view} nonce={viewNonce} targetY={targetY} distance={distance} autoRotate={autoRotate} />
      </Canvas>
      {overlay}
    </div>
  );
}
