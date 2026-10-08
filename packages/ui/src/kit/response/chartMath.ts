/** Pure scale and geometry math for `Chart` (no DOM). */

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** Round `range` to a "nice" 1/2/5 × 10^k number (Heckbert). */
export function niceNumber(range: number, round: boolean): number {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const exponent = Math.floor(Math.log10(range));
  // toPrecision strips float noise (0.7 / 0.1 = 6.999…) before bucketing.
  const fraction = Number((range / 10 ** exponent).toPrecision(12));
  let nice: number;
  if (round) nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

function decimalsOf(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)));
}

/**
 * A domain covering [dataMin, dataMax] with round tick values. A degenerate
 * domain (all values equal) is widened so the axis stays meaningful.
 */
export function niceScale(dataMin: number, dataMax: number, maxTicks = 5): NiceScale {
  let lo = Math.min(dataMin, dataMax);
  let hi = Math.max(dataMin, dataMax);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (lo === hi) {
    if (lo === 0) hi = 1;
    else if (lo > 0) lo = 0;
    else hi = 0;
  }
  const range = niceNumber(hi - lo, false);
  const step = niceNumber(range / Math.max(1, maxTicks - 1), true);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const decimals = decimalsOf(step);
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Number(value.toFixed(decimals)) || 0);
  }
  return { min: ticks[0]!, max: ticks[ticks.length - 1]!, step, ticks };
}

/** Map a domain linearly onto a pixel range. */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeStart: number,
  rangeEnd: number,
): (value: number) => number {
  const span = domainMax - domainMin || 1;
  return (value) => rangeStart + ((value - domainMin) / span) * (rangeEnd - rangeStart);
}

export interface StackSegment {
  start: number;
  end: number;
}

/**
 * Stack series per category: positive values grow up from 0, negative values
 * grow down from 0, independently. Missing values occupy no height.
 */
export function stackSeries(series: (number | null)[][]): StackSegment[][] {
  const categories = Math.max(0, ...series.map((values) => values.length));
  const positive = new Array<number>(categories).fill(0);
  const negative = new Array<number>(categories).fill(0);
  return series.map((values) =>
    Array.from({ length: categories }, (_, index) => {
      const value = values[index] ?? 0;
      const totals = value >= 0 ? positive : negative;
      const start = totals[index]!;
      totals[index] = start + value;
      return { start, end: start + value };
    }),
  );
}

/** SVG path for a pie/donut slice from `start` to `end` radians (0 = 12 o'clock, clockwise). */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  start: number,
  end: number,
): string {
  const point = (r: number, angle: number) =>
    `${(cx + r * Math.sin(angle)).toFixed(3)} ${(cy - r * Math.cos(angle)).toFixed(3)}`;
  const sweep = end - start;
  if (sweep >= Math.PI * 2 - 1e-9) {
    // A full ring cannot be one arc command; draw two halves (and the hole).
    const outer = `M ${point(radius, 0)} A ${radius} ${radius} 0 1 1 ${point(radius, Math.PI)} A ${radius} ${radius} 0 1 1 ${point(radius, 0)} Z`;
    if (innerRadius <= 0) return outer;
    return `${outer} M ${point(innerRadius, 0)} A ${innerRadius} ${innerRadius} 0 1 0 ${point(innerRadius, Math.PI)} A ${innerRadius} ${innerRadius} 0 1 0 ${point(innerRadius, 0)} Z`;
  }
  const large = sweep > Math.PI ? 1 : 0;
  if (innerRadius <= 0) {
    return `M ${cx} ${cy} L ${point(radius, start)} A ${radius} ${radius} 0 ${large} 1 ${point(radius, end)} Z`;
  }
  return [
    `M ${point(radius, start)}`,
    `A ${radius} ${radius} 0 ${large} 1 ${point(radius, end)}`,
    `L ${point(innerRadius, end)}`,
    `A ${innerRadius} ${innerRadius} 0 ${large} 0 ${point(innerRadius, start)}`,
    "Z",
  ].join(" ");
}

/** Every `step`-th category label is shown so labels don't collide. */
export function labelStride(categoryCount: number, plotWidth: number, minLabelWidth = 48): number {
  if (categoryCount <= 0) return 1;
  const fit = Math.max(1, Math.floor(plotWidth / minLabelWidth));
  return Math.max(1, Math.ceil(categoryCount / fit));
}
