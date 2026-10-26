"use client";

import type { CameraView } from "./three/Viewport";

const VIEWS: { id: CameraView; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "side", label: "Side" },
  { id: "back", label: "Back" },
];

export function ViewControls({
  view,
  onSelect,
  autoRotate,
  onAutoRotate,
}: {
  view: CameraView;
  onSelect: (v: CameraView) => void;
  autoRotate?: boolean;
  onAutoRotate?: (on: boolean) => void;
}) {
  return (
    <>
      <div className="segmented" role="group" aria-label="Camera view">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => onSelect(v.id)}>
            {v.label}
          </button>
        ))}
        {onAutoRotate && (
          <>
            <span className="divider" aria-hidden="true" />
            <button type="button" aria-pressed={!!autoRotate} onClick={() => onAutoRotate(!autoRotate)} title="Turntable">
              360°
            </button>
          </>
        )}
      </div>
      <span className="hint">Drag to rotate · scroll or pinch to zoom</span>
    </>
  );
}
