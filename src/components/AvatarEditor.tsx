"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createProfile, touch } from "@/domain/avatar";
import { computeBodyShape } from "@/domain/bodyShape";
import { type BodyMeasurementsCm, DEFAULT_MEASUREMENTS, MEASUREMENT_SPECS, type MeasurementKey, validateMeasurements } from "@/domain/measurements";
import { type LengthUnit, fromCm, roundForDisplay, toCm } from "@/domain/units";
import { track } from "@/adapters/analytics/analytics";
import { LazyViewport } from "./LazyViewport";
import { MeasurementForm } from "./MeasurementForm";
import { useProfile } from "./ProfileProvider";
import { ViewControls } from "./ViewControls";
import type { CameraView } from "./three/Viewport";

type TextMap = Record<MeasurementKey, string>;

function toText(m: BodyMeasurementsCm, unit: LengthUnit): TextMap {
  return Object.fromEntries(MEASUREMENT_SPECS.map((s) => [s.key, String(roundForDisplay(fromCm(m[s.key], unit)))])) as TextMap;
}

/** Values the 3D preview can safely render: out-of-range or blank fields fall back to the last good value. */
function previewable(draft: BodyMeasurementsCm, lastGood: BodyMeasurementsCm): BodyMeasurementsCm {
  const out = { ...lastGood };
  for (const s of MEASUREMENT_SPECS) {
    const v = draft[s.key];
    if (Number.isFinite(v) && v >= s.minCm && v <= s.maxCm) out[s.key] = v;
  }
  return out;
}

export function AvatarEditor() {
  const { status, profile, save, remove } = useProfile();
  const saved = profile?.measurements ?? DEFAULT_MEASUREMENTS;

  const [unit, setUnit] = useState<LengthUnit>("cm");
  const [draft, setDraft] = useState<BodyMeasurementsCm>(saved);
  const [text, setText] = useState<TextMap>(() => toText(saved, "cm"));
  const [lastGood, setLastGood] = useState<BodyMeasurementsCm>(saved);
  const [view, setView] = useState<CameraView>("front");
  const [viewNonce, setViewNonce] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load the saved profile once storage is ready.
  useEffect(() => {
    if (status !== "ready") return;
    const u = profile?.unitPreference ?? "cm";
    const m = profile?.measurements ?? DEFAULT_MEASUREMENTS;
    setUnit(u);
    setDraft(m);
    setLastGood(m);
    setText(toText(m, u));
    // Only on initial load / after delete; edits must not be clobbered by saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, profile?.id]);

  const issues = useMemo(() => validateMeasurements(draft, unit), [draft, unit]);
  const preview = useMemo(() => previewable(draft, lastGood), [draft, lastGood]);
  const shape = useMemo(() => computeBodyShape(preview), [preview]);
  const dirty = useMemo(
    // Written as !(diff <= eps) so a blank (NaN) field also counts as a change.
    () => MEASUREMENT_SPECS.some((s) => !(Math.abs(draft[s.key] - saved[s.key]) <= 1e-9)) || (profile ? unit !== profile.unitPreference : false),
    [draft, saved, unit, profile],
  );

  useEffect(() => {
    if (issues.length === 0) setLastGood(draft);
  }, [draft, issues.length]);

  function setField(key: MeasurementKey, cm: number, rawText?: string) {
    setNotice(null);
    setDraft((d) => ({ ...d, [key]: cm }));
    setText((t) => ({ ...t, [key]: rawText ?? String(roundForDisplay(fromCm(cm, unit))) }));
  }

  function onText(key: MeasurementKey, raw: string) {
    const n = raw.trim() === "" ? Number.NaN : Number(raw);
    setField(key, Number.isFinite(n) ? toCm(n, unit) : Number.NaN, raw);
  }

  function onUnit(next: LengthUnit) {
    setUnit(next);
    setText(toText(draft, next));
  }

  function reset() {
    const u = profile?.unitPreference ?? "cm";
    setUnit(u);
    setDraft(saved);
    setText(toText(saved, u));
    setNotice({ kind: "ok", text: profile ? "Unsaved changes discarded." : "Reset to default measurements." });
  }

  async function onSave() {
    if (issues.length > 0) return;
    try {
      const next = profile
        ? touch({ ...profile, measurements: draft, unitPreference: unit })
        : createProfile({ id: crypto.randomUUID(), measurements: draft, unitPreference: unit });
      await save(next);
      track({ name: "avatar_saved", props: { isNew: !profile } });
      setNotice({ kind: "ok", text: "Avatar saved in this browser." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save your avatar." });
    }
  }

  async function onDelete() {
    await remove();
    track({ name: "avatar_deleted", props: {} });
    setConfirmDelete(false);
    setNotice({ kind: "ok", text: "Avatar and measurements deleted from this browser." });
  }

  const summary = MEASUREMENT_SPECS.map((s) => `${s.label} ${roundForDisplay(fromCm(preview[s.key], unit))} ${unit}`).join(", ");

  return (
    <div className="split">
      <section className="stage" aria-label="Avatar preview">
        <LazyViewport
          shape={shape}
          view={view}
          viewNonce={viewNonce}
          autoRotate={autoRotate}
          label={`Prototype mannequin preview. ${summary}.`}
          overlay={
            <>
              <div className="stage-overlay top-left">
                <span className="glass-chip live">
                  <span className="dot" aria-hidden="true" />
                  {dirty ? "Live preview · unsaved" : "Live preview"}
                </span>
              </div>
              <div className="stage-overlay bottom">
                <ViewControls
                  view={view}
                  onSelect={(v) => {
                    setAutoRotate(false);
                    setView(v);
                    setViewNonce((n) => n + 1);
                  }}
                  autoRotate={autoRotate}
                  onAutoRotate={setAutoRotate}
                />
              </div>
            </>
          }
        />
        <p className="caveat">
          Prototype mannequin sculpted from your measurements. It changes in the right direction as you edit, but it is not an anatomically
          calibrated body model.
        </p>
      </section>

      <section className="panel" aria-label="Avatar editor">
        <p className="eyebrow gradient-text">Body profile</p>
        <h1>Your avatar</h1>
        {status === "loading" && <p className="muted">Loading saved avatar…</p>}
        {status === "error" && (
          <p className="error" role="alert">
            This browser is blocking local storage, so your avatar can&apos;t be saved. You can still preview it.
          </p>
        )}
        {status === "ready" && (
          <p className="muted">
            {profile ? `Saved ${new Date(profile.updatedAt).toLocaleString()}.` : "Not saved yet. Using default measurements."}
          </p>
        )}

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <MeasurementForm
            unit={unit}
            text={text}
            values={draft}
            issues={issues}
            onText={onText}
            onSlider={(k, cm) => setField(k, cm)}
            onUnit={onUnit}
          />

          <div className="actions">
            <button type="submit" className="primary" disabled={issues.length > 0 || status !== "ready"}>
              Save avatar
            </button>
            <button type="button" onClick={reset} disabled={!dirty}>
              {profile ? "Discard changes" : "Reset"}
            </button>
            <Link className="button-link" href="/catalog">
              Try on clothes →
            </Link>
          </div>
        </form>

        {notice && (
          <p className={notice.kind === "ok" ? "notice" : "error"} role="status">
            {notice.text}
          </p>
        )}

        {profile && (
          <div className="danger-zone">
            <h2>Delete avatar</h2>
            <p className="muted">Removes your saved measurements from this browser. This can&apos;t be undone.</p>
            {confirmDelete ? (
              <div className="actions">
                <button type="button" className="danger" onClick={() => void onDelete()}>
                  Yes, delete my avatar
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)}>
                Delete avatar…
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
