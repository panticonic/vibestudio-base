import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Button, Flex, Table, Text } from "@radix-ui/themes";
import { arcPath, labelStride, linearScale, niceScale, stackSeries } from "./chartMath";
import {
  ProblemNotice,
  ResponseFrame,
  clampNumber,
  formatNumber,
  isRecord,
  seriesColor,
  toBoolean,
  toList,
  toNumber,
  toText,
  useElementWidth,
  type NumberDisplayOptions,
  type ValueFormat,
} from "./shared";

export type ChartType = "bar" | "line" | "area" | "pie" | "donut";

export interface ChartProps {
  /** "bar" (default), "line", "area", "pie", or "donut". Pie/donut plot the first `y` key. */
  type?: ChartType;
  /** Rows of data, e.g. `[{ month: "Jan", sales: 120, costs: 80 }]`. Numeric strings are accepted. */
  data: Record<string, unknown>[];
  /** Key holding each row's category/label. Default: the first non-numeric key. */
  x?: string;
  /** Key, or keys for multiple series, holding numeric values. Default: every numeric key except `x`. */
  y?: string | string[];
  /** Heading shown above the chart (also its accessible name). */
  title?: string;
  /** How values are shown: "number" (default), "percent" (25 → "25%"), "currency". */
  valueFormat?: ValueFormat;
  /** ISO currency code for `valueFormat="currency"`. Default "USD". */
  currency?: string;
  /** Unit suffix for values, e.g. "kg" or "°C". */
  unit?: string;
  /** Stack multiple series (bar and area only). */
  stacked?: boolean;
  /** Plot height in pixels (120–600). Default 220. */
  height?: number;
}

const TYPES: readonly ChartType[] = ["bar", "line", "area", "pie", "donut"];

export interface ChartSeries {
  key: string;
  values: (number | null)[];
}

export interface ChartModel {
  categories: string[];
  series: ChartSeries[];
  problems: string[];
}

function quoted(key: string): string {
  return `“${key}”`;
}

/** Turn loose model input into categories and numeric series, collecting problems. */
export function normalizeChartData(data: unknown, x: unknown, y: unknown): ChartModel {
  const problems: string[] = [];
  const list = toList(data);
  if (!list) return { categories: [], series: [], problems: ["`data` must be an array of row objects."] };
  const rows = list.filter(isRecord);
  if (rows.length < list.length) problems.push(`${list.length - rows.length} rows weren't objects and were skipped.`);
  if (rows.length === 0) return { categories: [], series: [], problems: [...problems, "There is no data to plot."] };

  const keys: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  const numericShare = (key: string) =>
    rows.filter((row) => toNumber(row[key]) !== null).length / Math.max(1, rows.filter((row) => row[key] != null).length);

  let xKey = typeof x === "string" && keys.includes(x) ? x : undefined;
  if (typeof x === "string" && !xKey) problems.push(`No column ${quoted(x)} for x; using another column.`);
  xKey ??= keys.find((key) => numericShare(key) < 0.5) ?? keys[0]!;

  let yKeys: string[];
  const requested =
    typeof y === "string" ? (keys.includes(y) ? [y] : y.split(",").map((k) => k.trim())) : (toList(y) ?? []).map(toText);
  const wanted = requested.filter((key): key is string => typeof key === "string" && key !== "");
  if (wanted.length > 0) {
    const missing = wanted.filter((key) => !keys.includes(key));
    if (missing.length > 0) problems.push(`No column ${missing.map(quoted).join(", ")} in data.`);
    yKeys = wanted.filter((key) => keys.includes(key) && key !== xKey);
  } else {
    yKeys = keys.filter((key) => key !== xKey && numericShare(key) >= 0.5);
  }
  if (yKeys.length === 0) return { categories: [], series: [], problems: [...problems, "No numeric column to plot."] };

  const categories = rows.map((row, index) => toText(row[xKey!]) ?? `#${index + 1}`);
  const series = yKeys.map((key) => {
    let skipped = 0;
    const values = rows.map((row) => {
      const value = toNumber(row[key]);
      if (value === null && row[key] != null && row[key] !== "") skipped++;
      return value;
    });
    if (skipped > 0) problems.push(`${skipped} value${skipped === 1 ? "" : "s"} in ${quoted(key)} weren't numbers and were skipped.`);
    return { key, values };
  });
  return { categories, series, problems };
}

interface Tooltip {
  index: number;
  anchorX: number;
}

function TooltipCard({
  title,
  rows,
  anchorX,
  width,
}: {
  title: string;
  rows: { label: string; value: string; color: string }[];
  anchorX: number;
  width: number;
}) {
  const style = anchorX > width / 2 ? { right: width - anchorX + 8 } : { left: anchorX + 8 };
  return (
    <div className="vs-r-chart-tooltip" style={style} aria-hidden>
      <Text as="div" size="1" weight="bold">
        {title}
      </Text>
      {rows.map((row) => (
        <Flex key={row.label} align="center" gap="2">
          <span className="vs-r-swatch" style={{ background: row.color }} />
          <Text size="1" color="gray">
            {row.label}
          </Text>
          <Text size="1" weight="medium" ml="auto">
            {row.value}
          </Text>
        </Flex>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; detail?: string }[] }) {
  return (
    <ul className="vs-r-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className="vs-r-swatch" style={{ background: item.color }} />
          <Text size="1">{item.label}</Text>
          {item.detail ? (
            <Text size="1" color="gray">
              {item.detail}
            </Text>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  model,
  xLabel,
  format,
  hidden,
}: {
  model: ChartModel;
  xLabel: string;
  format: (value: number) => string;
  hidden: boolean;
}) {
  return (
    <div className={hidden ? "vs-r-visually-hidden" : "vs-r-table-scroll"}>
      <Table.Root size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{xLabel}</Table.ColumnHeaderCell>
            {model.series.map((series) => (
              <Table.ColumnHeaderCell key={series.key} justify="end">
                {series.key}
              </Table.ColumnHeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {model.categories.map((category, index) => (
            <Table.Row key={`${category}-${index}`}>
              <Table.RowHeaderCell>{category}</Table.RowHeaderCell>
              {model.series.map((series) => {
                const value = series.values[index];
                return (
                  <Table.Cell key={series.key} justify="end">
                    {value == null ? "—" : format(value)}
                  </Table.Cell>
                );
              })}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </div>
  );
}

/**
 * A bar, line, area, pie, or donut chart drawn from rows of data, with axes,
 * legend, hover/keyboard tooltips, and a data-table view.
 */
export function Chart(props: ChartProps) {
  const type: ChartType = TYPES.includes(props.type as ChartType) ? (props.type as ChartType) : "bar";
  const height = clampNumber(props.height, 120, 600, 220);
  const stacked = toBoolean(props.stacked) && (type === "bar" || type === "area");
  const display: NumberDisplayOptions = {
    format: props.valueFormat,
    currency: typeof props.currency === "string" ? props.currency : undefined,
    unit: typeof props.unit === "string" ? props.unit : undefined,
  };
  const model = useMemo(() => normalizeChartData(props.data, props.x, props.y), [props.data, props.x, props.y]);
  const typeProblem =
    props.type !== undefined && !TYPES.includes(props.type as ChartType)
      ? [`Unknown chart type ${quoted(String(props.type))}; showing a bar chart.`]
      : [];
  const problems = [...typeProblem, ...model.problems];
  const [showTable, setShowTable] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>(320);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const liveId = useId();
  const format = (value: number) => formatNumber(value, display);
  const label = props.title ?? `${type[0]!.toUpperCase()}${type.slice(1)} chart`;

  if (model.series.length === 0) {
    return (
      <ResponseFrame title={props.title} label={label}>
        <ProblemNotice component="Chart" title="Chart" problems={problems} />
      </ResponseFrame>
    );
  }

  const isPie = type === "pie" || type === "donut";
  const body = isPie ? (
    <PieBody
      model={model}
      donut={type === "donut"}
      width={width}
      height={height}
      format={format}
      tooltip={tooltip}
      setTooltip={setTooltip}
      label={label}
      liveId={liveId}
    />
  ) : (
    <CartesianBody
      model={model}
      type={type as "bar" | "line" | "area"}
      stacked={stacked}
      width={width}
      height={height}
      display={display}
      format={format}
      tooltip={tooltip}
      setTooltip={setTooltip}
      label={label}
      liveId={liveId}
    />
  );

  return (
    <ResponseFrame title={props.title} label={label} className="vs-r-chart">
      <div ref={ref} className="vs-r-chart-body">
        {showTable ? null : body}
        <DataTable
          model={model}
          xLabel={typeof props.x === "string" ? props.x : "Category"}
          format={format}
          hidden={!showTable}
        />
      </div>
      <Flex justify="end" mt="1">
        <Button size="1" variant="ghost" color="gray" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show chart" : "Show table"}
        </Button>
      </Flex>
      <ProblemNotice component="Chart" title="Some data was skipped" problems={problems} />
    </ResponseFrame>
  );
}

interface BodyProps {
  model: ChartModel;
  width: number;
  height: number;
  format: (value: number) => string;
  tooltip: Tooltip | null;
  setTooltip: (tooltip: Tooltip | null) => void;
  label: string;
  liveId: string;
}

/** Arrow/Home/End move through indices; Escape clears. */
export function keyStep(
  event: KeyboardEvent<HTMLElement>,
  current: number,
  count: number,
  select: (index: number | null) => void,
): void {
  let next: number;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(count - 1, current + 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, current - 1);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = count - 1;
  else if (event.key === "Escape") return select(null);
  else return;
  event.preventDefault();
  select(next);
}

function Announcer({ id, text }: { id: string; text: string }) {
  return (
    <div id={id} className="vs-r-visually-hidden" aria-live="polite">
      {text}
    </div>
  );
}

function CartesianBody({
  model,
  type,
  stacked,
  width,
  height,
  display,
  format,
  tooltip,
  setTooltip,
  label,
  liveId,
}: BodyProps & { type: "bar" | "line" | "area"; stacked: boolean; display: NumberDisplayOptions }) {
  const { categories, series } = model;
  const stacks = stacked ? stackSeries(series.map((s) => s.values)) : null;
  const allValues = stacks
    ? stacks.flatMap((segments) => segments.map((segment) => segment.end))
    : series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  let lo = Math.min(...allValues);
  let hi = Math.max(...allValues);
  if (type !== "line") {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  const scale = niceScale(lo, hi, Math.max(3, Math.min(6, Math.floor(height / 45))));
  const tickLabels = scale.ticks.map((tick) => formatNumber(tick, display, true));
  const left = Math.min(width * 0.35, Math.max(...tickLabels.map((t) => t.length)) * 6.5 + 12);
  const top = 10;
  const bottom = 24;
  const right = 10;
  const plotW = Math.max(10, width - left - right);
  const plotH = Math.max(10, height - top - bottom);
  const band = plotW / categories.length;
  const xCenter = (index: number) => left + band * (index + 0.5);
  const yScale = linearScale(scale.min, scale.max, top + plotH, top);
  const baseline = yScale(Math.min(scale.max, Math.max(scale.min, 0)));
  const stride = labelStride(categories.length, plotW);
  const maxLabelChars = Math.max(3, Math.floor((band * stride) / 6.5));
  const showDots = categories.length <= 40;

  const marks = series.map((s, seriesIndex) => {
    const color = seriesColor(seriesIndex);
    if (type === "bar") {
      const groupW = band * 0.72;
      const barW = stacked ? groupW : groupW / series.length;
      return (
        <g key={s.key} fill={color}>
          {s.values.map((value, index) => {
            if (value === null) return null;
            const segment = stacks ? stacks[seriesIndex]![index]! : { start: 0, end: value };
            const y0 = yScale(segment.start);
            const y1 = yScale(segment.end);
            const x0 = left + band * index + (band - groupW) / 2 + (stacked ? 0 : seriesIndex * barW);
            return (
              <rect
                key={index}
                x={x0}
                y={Math.min(y0, y1)}
                width={Math.max(1, barW - (stacked || series.length === 1 ? 0 : 1))}
                height={Math.abs(y1 - y0)}
                rx={Math.min(2, barW / 4)}
                opacity={tooltip && tooltip.index !== index ? 0.55 : 1}
              />
            );
          })}
        </g>
      );
    }
    const yAt = (index: number) => {
      const value = s.values[index];
      if (stacks) return yScale(stacks[seriesIndex]![index]!.end);
      return value === null || value === undefined ? null : yScale(value);
    };
    const bottomAt = (index: number) => (stacks ? yScale(stacks[seriesIndex]![index]!.start) : baseline);
    // Break lines at missing values (stacked series treat them as 0).
    const runs: number[][] = [];
    let run: number[] = [];
    categories.forEach((_, index) => {
      if (yAt(index) === null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(index);
    });
    if (run.length) runs.push(run);
    const line = runs
      .map((indices) => indices.map((index, i) => `${i ? "L" : "M"} ${xCenter(index)} ${yAt(index)}`).join(" "))
      .join(" ");
    const area =
      type === "area"
        ? runs
            .map(
              (indices) =>
                `${indices.map((index, i) => `${i ? "L" : "M"} ${xCenter(index)} ${yAt(index)}`).join(" ")} ` +
                `${[...indices]
                  .reverse()
                  .map((index) => `L ${xCenter(index)} ${bottomAt(index)}`)
                  .join(" ")} Z`,
            )
            .join(" ")
        : null;
    return (
      <g key={s.key}>
        {area ? <path d={area} fill={color} opacity={0.22} /> : null}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {categories.map((_, index) => {
          const y = yAt(index);
          if (y === null) return null;
          const active = tooltip?.index === index;
          if (!showDots && !active) return null;
          return <circle key={index} cx={xCenter(index)} cy={y} r={active ? 4.5 : 2.5} fill={color} />;
        })}
      </g>
    );
  });

  const active = tooltip ? tooltip.index : null;
  const tooltipRows =
    active === null
      ? []
      : series.map((s, i) => ({
          label: s.key,
          value: s.values[active] == null ? "—" : format(s.values[active]!),
          color: seriesColor(i),
        }));
  const announcement =
    active === null ? "" : `${categories[active]}: ${tooltipRows.map((r) => `${r.label} ${r.value}`).join(", ")}`;

  return (
    <>
      <div
        className="vs-r-chart-plot"
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use arrow keys to read values.`}
        aria-describedby={liveId}
        onKeyDown={(event) =>
          keyStep(event, tooltip?.index ?? -1, categories.length, (index) =>
            setTooltip(index === null ? null : { index, anchorX: xCenter(index) }),
          )
        }
        onFocus={() => {
          if (!tooltip) setTooltip({ index: 0, anchorX: xCenter(0) });
        }}
        onBlur={() => setTooltip(null)}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg width={width} height={height} role="presentation" className="vs-r-chart-svg">
          {scale.ticks.map((tick, index) => (
            <g key={tick}>
              <line
                x1={left}
                x2={left + plotW}
                y1={yScale(tick)}
                y2={yScale(tick)}
                stroke={tick === 0 ? "var(--gray-8)" : "var(--gray-a4)"}
              />
              <text x={left - 6} y={yScale(tick)} dy="0.32em" textAnchor="end" className="vs-r-axis-label">
                {tickLabels[index]}
              </text>
            </g>
          ))}
          {active !== null && type !== "bar" ? (
            <line x1={xCenter(active)} x2={xCenter(active)} y1={top} y2={top + plotH} stroke="var(--gray-a7)" />
          ) : null}
          {marks}
          {categories.map((category, index) =>
            index % stride === 0 ? (
              <text
                key={index}
                x={xCenter(index)}
                y={top + plotH + 16}
                textAnchor="middle"
                className="vs-r-axis-label"
              >
                {category.length > maxLabelChars ? `${category.slice(0, maxLabelChars - 1)}…` : category}
              </text>
            ) : null,
          )}
          {categories.map((_, index) => (
            <rect
              key={index}
              x={left + band * index}
              y={top}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setTooltip({ index, anchorX: xCenter(index) })}
            />
          ))}
        </svg>
        {tooltip ? (
          <TooltipCard
            title={categories[tooltip.index] ?? ""}
            rows={tooltipRows}
            anchorX={tooltip.anchorX}
            width={width}
          />
        ) : null}
      </div>
      <Announcer id={liveId} text={announcement} />
      {series.length > 1 ? <Legend items={series.map((s, i) => ({ label: s.key, color: seriesColor(i) }))} /> : null}
    </>
  );
}

function PieBody({ model, donut, width, height, format, tooltip, setTooltip, label, liveId }: BodyProps & { donut: boolean }) {
  const series = model.series[0]!;
  const slices = model.categories
    .map((category, index) => ({ category, index, value: series.values[index] ?? null }))
    .filter((slice): slice is { category: string; index: number; value: number } => slice.value !== null && slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const size = Math.max(80, Math.min(width, height));
  const radius = size / 2 - 4;
  const inner = donut ? radius * 0.6 : 0;
  const cx = width / 2;
  const cy = size / 2;
  let angle = 0;
  const arcs = slices.map((slice, order) => {
    const start = angle;
    angle += (slice.value / total) * Math.PI * 2;
    return { ...slice, start, end: angle, color: seriesColor(order) };
  });
  const skipped = model.categories.length - slices.length;
  const activeArc = tooltip ? arcs.find((arc) => arc.index === tooltip.index) : undefined;
  const percent = (value: number) => `${((value / total) * 100).toFixed(value / total < 0.1 ? 1 : 0)}%`;
  const announcement = activeArc ? `${activeArc.category}: ${format(activeArc.value)} (${percent(activeArc.value)})` : "";
  const anchorFor = (index: number) => {
    const arc = arcs[Math.min(index, arcs.length - 1)];
    return arc ? cx + radius * Math.sin((arc.start + arc.end) / 2) : cx;
  };

  if (arcs.length === 0) {
    return <ProblemNotice component="Chart" title="Chart" problems={["A pie chart needs at least one positive value."]} />;
  }

  return (
    <>
      <div
        className="vs-r-chart-plot"
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use arrow keys to read slices.`}
        aria-describedby={liveId}
        onKeyDown={(event) =>
          keyStep(event, activeArc ? arcs.indexOf(activeArc) : -1, arcs.length, (order) =>
            setTooltip(order === null ? null : { index: arcs[order]!.index, anchorX: anchorFor(order) }),
          )
        }
        onFocus={() => {
          if (!tooltip) setTooltip({ index: arcs[0]!.index, anchorX: anchorFor(0) });
        }}
        onBlur={() => setTooltip(null)}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg width={width} height={size} role="presentation" className="vs-r-chart-svg">
          {arcs.map((arc, order) => (
            <path
              key={arc.index}
              d={arcPath(cx, cy, radius, inner, arc.start, arc.end)}
              fill={arc.color}
              fillRule="evenodd"
              stroke="var(--color-panel-solid)"
              strokeWidth={arcs.length > 1 ? 1.5 : 0}
              opacity={activeArc && activeArc.index !== arc.index ? 0.55 : 1}
              onMouseEnter={() => setTooltip({ index: arc.index, anchorX: anchorFor(order) })}
            />
          ))}
          {donut ? (
            <>
              <text x={cx} y={cy - 6} textAnchor="middle" className="vs-r-axis-label">
                Total
              </text>
              <text x={cx} y={cy + 12} textAnchor="middle" className="vs-r-donut-total">
                {format(total)}
              </text>
            </>
          ) : null}
        </svg>
        {activeArc ? (
          <TooltipCard
            title={activeArc.category}
            rows={[{ label: series.key, value: `${format(activeArc.value)} · ${percent(activeArc.value)}`, color: activeArc.color }]}
            anchorX={tooltip!.anchorX}
            width={width}
          />
        ) : null}
      </div>
      <Announcer id={liveId} text={announcement} />
      <Legend
        items={arcs.map((arc) => ({ label: arc.category, color: arc.color, detail: `${format(arc.value)} · ${percent(arc.value)}` }))}
      />
      {skipped > 0 ? (
        <ProblemNotice component="Chart" problems={[`${skipped} non-positive or missing value${skipped === 1 ? "" : "s"} can't be shown as slices.`]} />
      ) : null}
    </>
  );
}
