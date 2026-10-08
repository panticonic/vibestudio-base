import { Text } from "@radix-ui/themes";
import { ArrowDownIcon, ArrowUpIcon } from "@radix-ui/react-icons";
import { ProblemNotice, ResponseFrame, formatValue, isRecord, toList, toNumber, toText } from "./shared";

export type StatTone = "positive" | "negative" | "neutral";

export interface StatItem {
  /** What is measured, e.g. "Revenue". */
  label: string;
  /** The headline value; numbers are grouped ("12,400"), strings shown as written ("$12.4K"). */
  value: string | number;
  /** Secondary line, e.g. "vs. last month". */
  detail?: string;
  /** Change, e.g. "+12%" or -3. Its sign picks the tone unless `tone` is set. */
  delta?: string | number;
  /** Delta color: "positive" (green), "negative" (red), "neutral" (gray). */
  tone?: StatTone;
}

export interface StatsProps {
  /** KPI tiles, laid out in as many columns as fit. */
  items: StatItem[];
  /** Optional heading. */
  title?: string;
}

const TONE_COLOR = { positive: "grass", negative: "red", neutral: "gray" } as const;

function deltaTone(delta: string | number | undefined, tone: unknown): StatTone {
  if (tone === "positive" || tone === "negative" || tone === "neutral") return tone;
  if (delta === undefined) return "neutral";
  const text = String(delta).trim();
  if (/^[-−]/.test(text)) return "negative";
  const value = toNumber(text);
  if (/^\+/.test(text) || (value !== null && value > 0)) return "positive";
  return "neutral";
}

/** A row of KPI tiles: label, big value, optional delta and detail. */
export function Stats({ items, title }: StatsProps) {
  const list = toList(items) ?? [];
  const tiles = list.filter(isRecord<"label" | "value" | "detail" | "delta" | "tone">).filter((item) => toText(item.label) !== undefined || item.value != null);
  const problems: string[] = [];
  if (!toList(items)) problems.push("`items` must be an array of { label, value }.");
  else if (tiles.length < list.length) problems.push(`${list.length - tiles.length} items had no label or value and were skipped.`);

  return (
    <ResponseFrame title={title} label="Key figures" className="vs-r-stats-frame">
      <dl className="vs-r-stats">
        {tiles.map((item, index) => {
          const delta = typeof item.delta === "number" ? item.delta : toText(item.delta);
          const tone = deltaTone(delta, item.tone);
          const deltaText =
            typeof delta === "number" ? `${delta > 0 ? "+" : ""}${formatValue(delta)}` : delta;
          return (
            <div key={index} className="vs-r-stat">
              <dt>
                <Text size="1" color="gray">
                  {toText(item.label) ?? `Item ${index + 1}`}
                </Text>
              </dt>
              <dd>
                <Text as="div" size="6" weight="bold" className="vs-r-stat-value">
                  {formatValue(item.value)}
                </Text>
                {deltaText ? (
                  <Text as="div" size="1" color={TONE_COLOR[tone]} weight="medium">
                    {tone === "positive" ? <ArrowUpIcon aria-hidden /> : tone === "negative" ? <ArrowDownIcon aria-hidden /> : null}
                    <span className="vs-r-visually-hidden">
                      {tone === "positive" ? "Up " : tone === "negative" ? "Down " : "Change "}
                    </span>
                    {deltaText}
                  </Text>
                ) : null}
                {toText(item.detail) ? (
                  <Text as="div" size="1" color="gray">
                    {toText(item.detail)}
                  </Text>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      <ProblemNotice component="Stats" title="Stats" problems={problems} />
    </ResponseFrame>
  );
}
