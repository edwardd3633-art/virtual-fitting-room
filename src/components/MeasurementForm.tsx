"use client";

import type { CSSProperties } from "react";
import { type BodyMeasurementsCm, MEASUREMENT_SPECS, type MeasurementKey, type ValidationIssue } from "@/domain/measurements";
import { type LengthUnit, fromCm, roundForDisplay, toCm } from "@/domain/units";

export interface MeasurementFormProps {
  unit: LengthUnit;
  /** Raw text per field, so partially typed values aren't overwritten. */
  text: Record<MeasurementKey, string>;
  values: BodyMeasurementsCm;
  issues: ValidationIssue[];
  onText: (key: MeasurementKey, text: string) => void;
  onSlider: (key: MeasurementKey, cm: number) => void;
  onUnit: (unit: LengthUnit) => void;
}

export function MeasurementForm({ unit, text, values, issues, onText, onSlider, onUnit }: MeasurementFormProps) {
  const formIssues = issues.filter((i) => i.key === "form");
  return (
    <fieldset className="measurements">
      <legend>Body measurements</legend>
      <div className="segmented" role="radiogroup" aria-label="Units">
        {(["cm", "in"] as const).map((u) => (
          <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => onUnit(u)}>
            {u === "cm" ? "Centimetres" : "Inches"}
          </button>
        ))}
      </div>

      {MEASUREMENT_SPECS.map((spec) => {
        const id = `m-${spec.key}`;
        const err = issues.find((i) => i.key === spec.key);
        const min = roundForDisplay(fromCm(spec.minCm, unit));
        const max = roundForDisplay(fromCm(spec.maxCm, unit));
        const step = unit === "cm" ? spec.stepCm : 0.25;
        const v = values[spec.key];
        const sliderValue = Number.isFinite(v) ? Math.min(max, Math.max(min, fromCm(v, unit))) : min;
        return (
          <div className={`field${err ? " has-error" : ""}`} key={spec.key}>
            <div className="field-head">
              <label htmlFor={id}>{spec.label}</label>
              <span className="input-unit">
                <input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={min}
                  max={max}
                  step="any"
                  value={text[spec.key]}
                  aria-invalid={!!err}
                  aria-describedby={`${id}-help${err ? ` ${id}-err` : ""}`}
                  onChange={(e) => onText(spec.key, e.target.value)}
                />
                <span aria-hidden="true">{unit}</span>
              </span>
            </div>
            <input
              type="range"
              aria-label={`${spec.label} slider`}
              min={min}
              max={max}
              step={step}
              value={sliderValue}
              style={{ "--pct": `${((sliderValue - min) / (max - min)) * 100}%` } as CSSProperties}
              onChange={(e) => onSlider(spec.key, toCm(Number(e.target.value), unit))}
            />
            <p className="help" id={`${id}-help`}>
              {spec.help}
            </p>
            {err && (
              <p className="error" id={`${id}-err`} role="alert">
                {err.message}
              </p>
            )}
          </div>
        );
      })}
      {formIssues.map((i) => (
        <p className="error" role="alert" key={i.message}>
          {i.message}
        </p>
      ))}
    </fieldset>
  );
}
