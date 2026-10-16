/**
 * The browser vocabulary's props, read for a terminal: Radix colour names
 * become the 16 theme colours the terminal follows, and its space scale
 * becomes cells (a terminal row is tall; only generous spacing earns one).
 */
import type { Tone } from "./interaction.js";

const TONES: Record<string, Tone> = {
  red: "red",
  ruby: "red",
  crimson: "red",
  tomato: "red",
  pink: "magenta",
  plum: "magenta",
  purple: "magenta",
  violet: "magenta",
  iris: "blue",
  indigo: "blue",
  blue: "blue",
  sky: "cyan",
  cyan: "cyan",
  teal: "cyan",
  mint: "green",
  jade: "green",
  green: "green",
  grass: "green",
  lime: "green",
  yellow: "yellow",
  amber: "yellow",
  orange: "yellow",
  brown: "yellow",
  bronze: "yellow",
  gold: "yellow",
  gray: "gray",
  mauve: "gray",
  slate: "gray",
  sage: "gray",
  olive: "gray",
  sand: "gray",
};

export function tone(color: unknown): Tone | undefined {
  return typeof color === "string" ? TONES[color] : undefined;
}

/** A Radix space token ("1"–"9", or a responsive object) as cells along `axis`. */
export function space(token: unknown, axis: "row" | "column"): number {
  const value =
    token && typeof token === "object" ? (token as Record<string, unknown>)["initial"] : token;
  const step = Number(value);
  if (!Number.isFinite(step) || step <= 0) return 0;
  // Across, a gap of one cell already reads as separation; down, a whole row is a lot.
  return axis === "row" ? (step >= 5 ? 2 : 1) : step >= 4 ? 1 : 0;
}

/** Plain text of a value an agent passed where text belongs. */
export function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A number from a number or numeric text ("$1,234.50", "45%"); null for anything else. */
export function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .replace(/[\s,_]/g, "")
    .replace(/^−/, "-")
    .replace(/^(-?)[$€£¥₹]/, "$1")
    .replace(/%$/, "");
  if (cleaned === "" || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface NumberStyle {
  /** "percent" means the value is already in points (25 → "25%"). */
  format?: "number" | "percent" | "currency";
  currency?: string;
  unit?: string;
}

/** A number as people write it: grouped, with its currency or unit. */
export function formatNumber(value: number, { format, currency, unit }: NumberStyle = {}): string {
  let shown: string;
  try {
    shown =
      format === "currency"
        ? new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: (currency ?? "USD").trim().toUpperCase(),
            minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
            maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
          }).format(value)
        : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  } catch {
    shown = `${value} ${currency}`;
  }
  if (format === "percent") shown += "%";
  if (!unit) return shown;
  return /^[A-Za-z]/.test(unit) ? `${shown} ${unit}` : `${shown}${unit}`;
}
