/**
 * `Chart` drawn as text: bars with block characters, a sparkline per series
 * for lines and areas, and a share bar per slice for pies and donuts. The
 * same props as the browser's chart; it fits the width it is given.
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { Box, Text as InkText, measureElement, type DOMElement } from "ink";
import { formatNumber, list, number, record, text, type NumberStyle } from "./theme.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };

const COLORS = ["cyan", "magenta", "yellow", "green", "blue", "red"] as const;
const SPARK = "▁▂▃▄▅▆▇█";
const PARTIAL = " ▏▎▍▌▋▊▉";
const MAX_ROWS = 40;

/** The width of the box this is attached to once laid out; `given` or `fallback` before that. */
function useWidth(given: unknown, fallback = 40) {
  const ref = useRef<DOMElement>(null);
  const [measured, setMeasured] = useState<number>();
  useLayoutEffect(() => {
    const width = ref.current ? measureElement(ref.current).width : 0;
    if (width > 0 && width !== measured) setMeasured(width);
  });
  const explicit = number(given);
  return [ref, explicit && explicit > 0 ? Math.floor(explicit) : (measured ?? fallback)] as const;
}

interface Series {
  key: string;
  values: (number | null)[];
}

interface Model {
  categories: string[];
  series: Series[];
  problems: string[];
}

function model(data: unknown, x: unknown, y: unknown): Model {
  const rows = list(data).flatMap((row) => (record(row) ? [record(row)!] : []));
  if (rows.length === 0)
    return { categories: [], series: [], problems: ["`data` must be a non-empty array of rows."] };
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const numeric = (key: string) =>
    rows.filter((row) => number(row[key]) !== null).length >=
    rows.filter((row) => row[key] != null).length / 2;
  const xKey =
    typeof x === "string" && keys.includes(x) ? x : (keys.find((k) => !numeric(k)) ?? keys[0]!);
  const wanted = (typeof y === "string" ? y.split(",") : list(y))
    .map((key) => (typeof key === "string" ? key.trim() : ""))
    .filter((key) => keys.includes(key) && key !== xKey);
  const yKeys = wanted.length > 0 ? wanted : keys.filter((key) => key !== xKey && numeric(key));
  if (yKeys.length === 0)
    return { categories: [], series: [], problems: ["There is no numeric column to plot."] };
  return {
    categories: rows.map((row, index) => text(row[xKey]) ?? `#${index + 1}`),
    series: yKeys.map((key) => ({ key, values: rows.map((row) => number(row[key])) })),
    problems: [],
  };
}

const fit = (label: string, width: number) =>
  label.length > width ? `${label.slice(0, Math.max(0, width - 1))}…` : label.padEnd(width);

/** A bar `length` cells long, in eighths of a cell. */
function bar(length: number): string {
  const eighths = Math.max(0, Math.round(length * 8));
  return "█".repeat(Math.floor(eighths / 8)) + (PARTIAL[eighths % 8] ?? "").trimEnd();
}

function Legend({ series }: { series: Series[] }): React.ReactElement | null {
  if (series.length < 2) return null;
  return (
    <InkText>
      {series.map((s, index) => (
        <InkText key={s.key} color={COLORS[index % COLORS.length]!}>
          {index > 0 ? "  " : ""}■ {s.key}
        </InkText>
      ))}
    </InkText>
  );
}

function Bars({
  m,
  width,
  fmt,
  stacked,
}: {
  m: Model;
  width: number;
  fmt: (value: number) => string;
  stacked: boolean;
}): React.ReactElement {
  const labelWidth = Math.min(
    20,
    Math.floor(width / 3),
    Math.max(...m.categories.map((c) => c.length))
  );
  const totals = m.categories.map((_, i) =>
    m.series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0)
  );
  const peak = Math.max(
    1e-9,
    ...(stacked ? totals : m.series.flatMap((s) => s.values.map((v) => Math.abs(v ?? 0))))
  );
  const labels = stacked
    ? totals.map(fmt)
    : m.series.flatMap((s) => s.values.map((v) => (v === null ? "—" : fmt(v))));
  const barWidth = Math.max(4, width - labelWidth - Math.max(...labels.map((l) => l.length)) - 2);
  const shown = m.categories.slice(0, MAX_ROWS);
  return (
    <Box flexDirection="column">
      {shown.map((category, i) => {
        if (stacked) {
          let drawn = 0;
          let cumulative = 0;
          return (
            <InkText key={i}>
              {fit(category, labelWidth)}{" "}
              {m.series.map((s, index) => {
                cumulative += Math.max(0, s.values[i] ?? 0);
                const end = (cumulative / peak) * barWidth;
                const segment = bar(end - drawn);
                drawn += segment.length;
                return (
                  <InkText key={s.key} color={COLORS[index % COLORS.length]!}>
                    {segment}
                  </InkText>
                );
              })}
              {` ${fmt(totals[i]!)}`}
            </InkText>
          );
        }
        return m.series.map((s, index) => {
          const value = s.values[i] ?? null;
          return (
            <InkText key={`${i}:${s.key}`}>
              {fit(index === 0 ? category : "", labelWidth)}{" "}
              <InkText color={value !== null && value < 0 ? "red" : COLORS[index % COLORS.length]!}>
                {bar((Math.abs(value ?? 0) / peak) * barWidth)}
              </InkText>
              {` ${value === null ? "—" : fmt(value)}`}
            </InkText>
          );
        });
      })}
      {m.categories.length > shown.length ? (
        <InkText dimColor>{`… ${m.categories.length - shown.length} more`}</InkText>
      ) : null}
    </Box>
  );
}

/** `values` as one character each, resampled to at most `cells`; each scaled to its own range. */
function sparkline(values: (number | null)[], cells: number, lo: number, hi: number): string {
  const buckets = Math.min(values.length, cells);
  return Array.from({ length: buckets }, (_, b) => {
    const slice = values
      .slice(
        Math.floor((b * values.length) / buckets),
        Math.floor(((b + 1) * values.length) / buckets)
      )
      .filter((v): v is number => v !== null);
    if (slice.length === 0) return " ";
    const mean = slice.reduce((a, c) => a + c, 0) / slice.length;
    return SPARK[hi === lo ? 3 : Math.round(((mean - lo) / (hi - lo)) * 7)]!;
  }).join("");
}

function Lines({
  m,
  width,
  fmt,
  stacked,
}: {
  m: Model;
  width: number;
  fmt: (value: number) => string;
  stacked: boolean;
}): React.ReactElement {
  const running: number[] = [];
  const plotted = m.series.map((s) => {
    const values = stacked
      ? s.values.map((v, i) => (running[i] = (running[i] ?? 0) + (v ?? 0)))
      : s.values;
    return { key: s.key, values };
  });
  const nameWidth = Math.min(14, Math.max(...plotted.map((s) => s.key.length)));
  const lines = plotted.map((s) => {
    const known = s.values.filter((v): v is number => v !== null);
    const lo = Math.min(...known);
    const hi = Math.max(...known);
    return { s, lo, hi, range: known.length ? `${fmt(lo)} … ${fmt(hi)}` : "no data" };
  });
  const cells = Math.max(4, width - nameWidth - Math.max(...lines.map((l) => l.range.length)) - 2);
  return (
    <Box flexDirection="column">
      {lines.map(({ s, lo, hi, range }, index) => (
        <InkText key={s.key}>
          <InkText color={COLORS[index % COLORS.length]!}>{fit(s.key, nameWidth)}</InkText>{" "}
          <InkText color={COLORS[index % COLORS.length]!}>
            {sparkline(s.values, cells, lo, hi)}
          </InkText>
          <InkText dimColor>{` ${range}`}</InkText>
        </InkText>
      ))}
      <InkText dimColor>
        {`${" ".repeat(nameWidth + 1)}${m.categories[0]} → ${m.categories[m.categories.length - 1]}`}
      </InkText>
    </Box>
  );
}

function Shares({
  m,
  width,
  fmt,
}: {
  m: Model;
  width: number;
  fmt: (value: number) => string;
}): React.ReactElement {
  const values = m.series[0]!.values.map((v) => Math.max(0, v ?? 0));
  const total = values.reduce((a, c) => a + c, 0) || 1;
  const labelWidth = Math.min(
    20,
    Math.floor(width / 3),
    Math.max(...m.categories.map((c) => c.length))
  );
  const tail = Math.max(...values.map((v) => fmt(v).length)) + 7;
  const barWidth = Math.max(4, width - labelWidth - tail - 1);
  return (
    <Box flexDirection="column">
      {m.categories.slice(0, MAX_ROWS).map((category, i) => (
        <InkText key={i}>
          {fit(category, labelWidth)}{" "}
          <InkText color={COLORS[i % COLORS.length]!}>
            {bar((values[i]! / total) * barWidth).padEnd(barWidth)}
          </InkText>
          {` ${((values[i]! / total) * 100).toFixed(1).padStart(5)}%`}
          <InkText dimColor>{` ${fmt(values[i]!)}`}</InkText>
        </InkText>
      ))}
    </Box>
  );
}

export function Chart(props: Loose): React.ReactElement {
  const [ref, width] = useWidth(props["width"]);
  const m = model(props["data"], props["x"], props["y"]);
  const type = String(props["type"] ?? "bar");
  const format = props["valueFormat"];
  const style: NumberStyle = {
    ...(format === "percent" || format === "currency" ? { format } : {}),
    ...(text(props["currency"]) ? { currency: text(props["currency"])! } : {}),
    ...(text(props["unit"]) ? { unit: text(props["unit"])! } : {}),
  };
  const fmt = (value: number) => formatNumber(value, style);
  const stacked = props["stacked"] === true || props["stacked"] === "true";
  return (
    <Box ref={ref} flexDirection="column" flexGrow={1}>
      {text(props["title"]) ? <InkText bold>{text(props["title"])}</InkText> : null}
      {m.problems.map((problem) => (
        <InkText key={problem} color="red">
          {problem}
        </InkText>
      ))}
      {m.series.length === 0 ? null : type === "pie" || type === "donut" ? (
        <Shares m={m} width={width} fmt={fmt} />
      ) : (
        <>
          <Legend series={m.series} />
          {type === "line" || type === "area" ? (
            <Lines m={m} width={width} fmt={fmt} stacked={stacked && type === "area"} />
          ) : (
            <Bars m={m} width={width} fmt={fmt} stacked={stacked && m.series.length > 1} />
          )}
        </>
      )}
    </Box>
  );
}
