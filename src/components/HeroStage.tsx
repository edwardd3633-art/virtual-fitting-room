"use client";

import { useMemo, useState } from "react";
import { computeBodyShape } from "@/domain/bodyShape";
import { resolveAsset } from "@/domain/catalog";
import { DEFAULT_ENGINES, runFit } from "@/domain/fitting";
import { DEFAULT_MEASUREMENTS } from "@/domain/measurements";
import { DEMO_CATALOG } from "@/adapters/retailers/demoCatalog";
import { LazyViewport } from "./LazyViewport";
import { useProfile } from "./ProfileProvider";
import { Garment } from "./three/Garment";

/** Turntable showcase on the home page: the visitor's avatar (or the default) wearing a demo tee. */
export function HeroStage() {
  const { profile } = useProfile();
  const shape = useMemo(() => computeBodyShape(profile?.measurements ?? DEFAULT_MEASUREMENTS), [profile]);
  const fit = useMemo(() => {
    const r = resolveAsset(DEMO_CATALOG, "demo-relaxed-tee", "navy", "M");
    return r.ok ? runFit(DEFAULT_ENGINES, { body: shape, asset: r.asset, pose: "a-pose" }) : null;
  }, [shape]);
  const [failed, setFailed] = useState(false);

  return (
    <LazyViewport
      shape={shape}
      view="front"
      viewNonce={0}
      autoRotate
      label="Prototype mannequin wearing the Demo Relaxed Tee, slowly rotating."
      overlay={
        <div className="stage-overlay top-left">
          <span className="glass-chip live">
            <span className="dot" aria-hidden="true" />
            Live preview · Demo Relaxed Tee · M
          </span>
        </div>
      }
    >
      {fit && !failed && <Garment fit={fit} shape={shape} onError={() => setFailed(true)} />}
    </LazyViewport>
  );
}
