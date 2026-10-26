/**
 * Unit handling. All measurements are stored canonically in centimetres;
 * inches exist only at the UI boundary.
 */

export type LengthUnit = "cm" | "in";

export const CM_PER_INCH = 2.54;

export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

/** Convert a canonical cm value to the display unit. */
export function fromCm(cm: number, unit: LengthUnit): number {
  return unit === "cm" ? cm : cmToInches(cm);
}

/** Convert a value entered in the display unit to canonical cm. */
export function toCm(value: number, unit: LengthUnit): number {
  return unit === "cm" ? value : inchesToCm(value);
}

/** Round a value for display (1 decimal by default, for both units). */
export function roundForDisplay(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function formatLength(cm: number, unit: LengthUnit): string {
  return `${roundForDisplay(fromCm(cm, unit))} ${unit}`;
}
