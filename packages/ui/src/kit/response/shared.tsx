/**
 * Shared input coercion, formatting, and framing for the response catalog.
 *
 * Catalog components are filled by models, so every prop arrives as "whatever
 * the model wrote": numbers as strings, arrays as JSON text, fields missing or
 * extra. These helpers turn that into typed values and collect human-readable
 * problems that the components render inline instead of throwing.
 */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Callout, Heading, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import "./response.css";

/** How numeric values are displayed. `percent` means the value is already in percent points (25 → "25%"). */
export type ValueFormat = "number" | "percent" | "currency";

/** Options shared by every component that formats numbers. */
export interface NumberDisplayOptions {
  /** `number` (default), `percent` (value already in points: 25 → "25%"), or `currency`. */
  format?: ValueFormat;
  /** ISO 4217 code used when `format` is `currency`. Default "USD". */
  currency?: string;
  /** Suffix appended to every value, e.g. "km", "°C", "ms". */
  unit?: string;
}

/**
 * Coerce a model-provided value to a finite number. Accepts numbers and
 * numeric strings with grouping commas, currency symbols, a trailing `%`, or
 * surrounding whitespace ("$1,234.50", " 45% "). Anything else is `null`.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .replace(/[\s,_]/g, "")
    .replace(/^[+]/, "")
    .replace(/^−/, "-")
    .replace(/^(-?)[$€£¥₹]/, "$1")
    .replace(/%$/, "");
  if (cleaned === "" || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A model-provided object whose named keys may hold anything (or be absent). */
export type Loose<K extends string = string> = { [P in K]?: unknown };

/**
 * A plain object (not an array, not null). Name the keys you read to get
 * typed access: `list.filter(isRecord<"label" | "value">)`.
 */
export function isRecord<K extends string = string>(value: unknown): value is Loose<K> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce a model-provided list. Arrays pass through; a JSON string holding an
 * array is parsed (MDX authors often write `data='[...]'`); a single object
 * becomes a one-item list. Anything else is `null`.
 */
export function toList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text.startsWith("[") && !text.startsWith("{")) return null;
    try {
      return toList(JSON.parse(text));
    } catch {
      return null;
    }
  }
  if (isRecord(value)) return [value];
  return null;
}

/** Coerce a model-provided record (or JSON object text). */
export function toRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Display text for a scalar; `undefined` for empty or structured values. */
export function toText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() === "" ? undefined : value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return undefined;
}

/** A list of display strings from an array, JSON array text, or a single string. */
export function toTextList(value: unknown): string[] {
  if (typeof value === "string" && !value.trim().startsWith("[")) {
    const text = toText(value);
    return text ? [text] : [];
  }
  return (toList(value) ?? [])
    .map(toText)
    .filter((t): t is string => t !== undefined);
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === "string")
    return ["true", "yes", "1", "on"].includes(value.trim().toLowerCase());
  return value === true || value === 1;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function numberFormatter(
  key: string,
  make: () => Intl.NumberFormat,
): Intl.NumberFormat {
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = make();
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function withUnit(text: string, unit: string | undefined): string {
  if (!unit) return text;
  return /^[A-Za-z]/.test(unit) ? `${text} ${unit}` : `${text}${unit}`;
}

/**
 * Format a number for display. `compact` abbreviates large magnitudes
 * (12.3K, 4.5M) for axis ticks.
 */
export function formatNumber(
  value: number,
  { format = "number", currency = "USD", unit }: NumberDisplayOptions = {},
  compact = false,
): string {
  const notation =
    compact && Math.abs(value) >= 10_000 ? "compact" : "standard";
  if (format === "currency") {
    const code = currency.trim().toUpperCase();
    try {
      const formatter = numberFormatter(
        `c:${code}:${notation}:${Number.isInteger(value)}`,
        () =>
          new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: code,
            notation,
            minimumFractionDigits:
              notation === "compact" || Number.isInteger(value) ? 0 : 2,
            maximumFractionDigits:
              notation === "compact" ? 1 : Number.isInteger(value) ? 0 : 2,
          }),
      );
      return withUnit(formatter.format(value), unit);
    } catch {
      // Unknown currency code: keep the number and show the code verbatim.
      return withUnit(`${formatNumber(value, {}, compact)} ${code}`, unit);
    }
  }
  const formatter = numberFormatter(
    `n:${notation}`,
    () =>
      new Intl.NumberFormat(undefined, {
        notation,
        maximumFractionDigits: notation === "compact" ? 1 : 2,
      }),
  );
  const text = formatter.format(value);
  return withUnit(format === "percent" ? `${text}%` : text, unit);
}

/** Format a value that may be a number or already-formatted text. */
export function formatValue(
  value: unknown,
  options: NumberDisplayOptions = {},
): string {
  if (typeof value === "number" && Number.isFinite(value))
    return formatNumber(value, options);
  return toText(value) ?? "—";
}

/** A rejected-props occurrence, as handed to a {@link ResponseProblemReporter}. */
export interface ResponseProblemReport {
  /** Public tag name of the catalog component, e.g. "Chart". */
  component: string;
  problems: string[];
}

export interface ResponseProblemReporter {
  report(problem: ResponseProblemReport): void;
}

/**
 * Optional: a host that knows who authored the rendered props (an agent's MDX
 * message, an inline UI) provides this so that every ProblemNotice reaches the
 * author. Without a provider, ProblemNotice only renders.
 */
export const ResponseProblemReporterContext =
  createContext<ResponseProblemReporter | null>(null);

/** An inline notice explaining what was wrong with the provided props. */
export function ProblemNotice({
  component,
  title,
  problems,
}: {
  /** Public tag name of the component that rejected its props; reported to the author. */
  component: string;
  title?: string;
  problems: string[];
}) {
  const reporter = useContext(ResponseProblemReporterContext);
  const fingerprint = JSON.stringify(problems);
  useEffect(() => {
    if (!reporter || problems.length === 0) return;
    reporter.report({ component, problems });
    // The problem list is the identity; a fresh array of the same problems
    // must not re-report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reporter, component, fingerprint]);
  if (problems.length === 0) return null;
  return (
    <Callout.Root size="1" color="amber" role="note" className="vs-r-problem">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <div>
        {(title || problems.length === 1) && (
          <Callout.Text>
            {title ? <strong>{title}: </strong> : null}
            {problems.length === 1 ? problems[0] : null}
          </Callout.Text>
        )}
        {problems.length > 1 && (
          <ul className="vs-r-problem-list">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </div>
    </Callout.Root>
  );
}

/** The bordered frame with an optional title that most catalog components use. */
export function ResponseFrame({
  title,
  label,
  children,
  className,
}: {
  title?: string;
  /** Accessible name when there is no visible title. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={["vs-r-frame", className].filter(Boolean).join(" ")}
      aria-label={title ?? label}
    >
      {title ? (
        <Heading as="h3" size="3" mb="2" className="vs-r-title">
          {title}
        </Heading>
      ) : null}
      {children}
    </section>
  );
}

/** Small muted caption text. */
export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text as="div" size="1" color="gray">
      {children}
    </Text>
  );
}

/** Categorical series colors (Radix step 9 — readable in light and dark). */
export const SERIES_COLORS = [
  "var(--blue-9)",
  "var(--orange-9)",
  "var(--teal-9)",
  "var(--purple-9)",
  "var(--amber-9)",
  "var(--pink-9)",
  "var(--grass-9)",
  "var(--indigo-9)",
  "var(--red-9)",
  "var(--cyan-9)",
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}

/**
 * The rendered width of an element, tracked with ResizeObserver so SVG
 * content is laid out at real pixels (crisp text at any card width).
 * `fallback` is used before the first measurement and where layout is absent.
 */
export function useElementWidth<T extends HTMLElement>(
  fallback: number,
): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (measured: number) => {
      if (measured > 0) setWidth(Math.round(measured));
    };
    measure(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Clamp a coerced number into a range, using `fallback` when absent/invalid. */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = toNumber(value);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** A link target safe to render: http(s), mailto, or relative. */
export function safeHref(value: unknown): string | undefined {
  const href = toText(value);
  if (!href) return undefined;
  try {
    const url = new URL(href, "https://workspace.invalid/");
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? href
      : undefined;
  } catch {
    return undefined;
  }
}
