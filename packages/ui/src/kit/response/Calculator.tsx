import { useId, useState } from "react";
import { Flex, Select, Slider, Switch, Text, TextField } from "@radix-ui/themes";
import {
  ProblemNotice,
  ResponseFrame,
  formatNumber,
  isRecord,
  toBoolean,
  toList,
  toNumber,
  toText,
  type Loose,
  type ValueFormat,
} from "./shared";

export type CalculatorFieldType = "number" | "slider" | "select" | "toggle";

export interface CalculatorField {
  /** Key of this field in the values passed to `compute`. */
  name: string;
  /** Visible label. Defaults to `name`. */
  label?: string;
  /** "number" (default), "slider", "select", or "toggle". */
  type?: CalculatorFieldType;
  /** Initial value: a number, an option value for select, a boolean for toggle. */
  default?: number | string | boolean;
  /** Lower bound (slider default 0). */
  min?: number;
  /** Upper bound (slider default 100). */
  max?: number;
  /** Increment (default 1). */
  step?: number;
  /** Select options: strings, or { label, value } (number-like values are passed as numbers). */
  options?: (string | number | { label: string; value: string | number })[];
  /** Unit shown beside the input, e.g. "%", "years". */
  unit?: string;
}

export interface CalculatorResult {
  label: string;
  /** Numbers are formatted; strings are shown as written. */
  value: number | string;
  /** "number" (default), "percent" (value in points), or "currency". */
  format?: ValueFormat;
  /** Unit suffix. */
  unit?: string;
}

/** Values passed to `compute`: numbers (null while an input is empty), select values, booleans. */
export type CalculatorValues = Record<string, number | string | boolean | null>;

export interface CalculatorProps {
  /** Inputs, in order. */
  fields: CalculatorField[];
  /** Pure function from field values to results: an array of { label, value, format? } or a { label: value } record. Recomputed on every change. */
  compute: (values: CalculatorValues) => CalculatorResult[] | Record<string, number | string>;
  /** Optional heading. */
  title?: string;
  /** ISO currency code for results with format "currency". Default "USD". */
  currency?: string;
}

interface NormalField {
  name: string;
  label: string;
  type: CalculatorFieldType;
  min?: number;
  max?: number;
  step: number;
  unit?: string;
  options: { label: string; value: string | number }[];
  initial: number | string | boolean | null;
}

const FIELD_TYPES: readonly CalculatorFieldType[] = ["number", "slider", "select", "toggle"];

function normalizeField(raw: Loose<keyof CalculatorField>, index: number): NormalField {
  const name = toText(raw.name) ?? toText(raw.label) ?? `field${index + 1}`;
  const options = (toList(raw.options) ?? []).flatMap((option) => {
    if (isRecord<"label" | "value">(option)) {
      const value = toNumber(option.value) ?? toText(option.value);
      const label = toText(option.label) ?? (value === undefined ? undefined : String(value));
      return label === undefined ? [] : [{ label, value: value ?? label }];
    }
    const text = toText(option);
    return text === undefined ? [] : [{ label: text, value: toNumber(option) ?? text }];
  });
  const type: CalculatorFieldType = FIELD_TYPES.includes(raw.type as CalculatorFieldType)
    ? (raw.type as CalculatorFieldType)
    : options.length > 0
      ? "select"
      : "number";
  const min = toNumber(raw.min) ?? (type === "slider" ? 0 : undefined);
  const max = toNumber(raw.max) ?? (type === "slider" ? 100 : undefined);
  const step = toNumber(raw.step) ?? 1;
  let initial: NormalField["initial"];
  if (type === "toggle") initial = toBoolean(raw.default);
  else if (type === "select") {
    const wanted = toNumber(raw.default) ?? toText(raw.default);
    initial = options.find((option) => option.value === wanted || option.label === wanted)?.value ?? options[0]?.value ?? null;
  } else initial = toNumber(raw.default) ?? (type === "slider" ? min! : null);
  return { name, label: toText(raw.label) ?? name, type, min, max, step, unit: toText(raw.unit), options, initial };
}

export interface CalculatorOutcome {
  results: { label: string; text: string }[];
  error: string | null;
}

/** Run `compute` and normalize its output; failures become an error message, never a throw. */
export function runCompute(compute: unknown, values: CalculatorValues, currency?: string): CalculatorOutcome {
  if (typeof compute !== "function") return { results: [], error: "`compute` must be a function: compute={(v) => [...]}" };
  let output: unknown;
  try {
    output = (compute as (values: CalculatorValues) => unknown)(values);
  } catch (cause) {
    return { results: [], error: cause instanceof Error ? cause.message : String(cause) };
  }
  if (output && typeof (output as { then?: unknown }).then === "function")
    return { results: [], error: "`compute` must return results synchronously, not a Promise." };
  const entries: unknown[] = Array.isArray(output)
    ? output
    : isRecord(output)
      ? Object.entries(output).map(([label, value]) => (isRecord(value) ? { label, ...value } : { label, value }))
      : [];
  if (entries.length === 0) return { results: [], error: "`compute` returned no results." };
  const results = entries.filter(isRecord<keyof CalculatorResult>).map((entry, index) => {
    const label = toText(entry.label) ?? `Result ${index + 1}`;
    const value = entry.value;
    const format = entry.format === "percent" || entry.format === "currency" ? entry.format : "number";
    const unit = toText(entry.unit);
    let text: string;
    if (typeof value === "number") text = Number.isFinite(value) ? formatNumber(value, { format, currency, unit }) : "—";
    else text = toText(value) ?? "—";
    return { label, text };
  });
  return { results, error: null };
}

/** A live calculator: inputs on top, results recomputed on every change. */
export function Calculator({ fields, compute, title, currency }: CalculatorProps) {
  const baseId = useId();
  const list = toList(fields);
  const normalized = (list ?? []).filter(isRecord<keyof CalculatorField>).map(normalizeField);
  const [edits, setEdits] = useState<Record<string, number | string | boolean | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const values: CalculatorValues = Object.fromEntries(
    normalized.map((field) => [field.name, Object.hasOwn(edits, field.name) ? edits[field.name]! : field.initial]),
  );
  const outcome = runCompute(compute, values, toText(currency));
  const problems: string[] = [];
  if (!list || normalized.length === 0) problems.push("`fields` must be a non-empty array of { name, type, ... }.");
  const set = (name: string, value: number | string | boolean | null) => setEdits((current) => ({ ...current, [name]: value }));

  return (
    <ResponseFrame title={title} label="Calculator" className="vs-r-calculator">
      <div className="vs-r-calc-fields">
        {normalized.map((field) => {
          const id = `${baseId}-${field.name}`;
          const value = values[field.name];
          const unit = field.unit ? (
            <Text size="1" color="gray">
              {field.unit}
            </Text>
          ) : null;
          let control;
          if (field.type === "toggle") {
            control = <Switch id={id} checked={value === true} onCheckedChange={(next) => set(field.name, next)} />;
          } else if (field.type === "select") {
            control = (
              <Select.Root
                value={value === null || value === undefined ? undefined : String(value)}
                onValueChange={(next) => set(field.name, field.options.find((o) => String(o.value) === next)?.value ?? next)}
              >
                <Select.Trigger id={id} aria-label={field.label} />
                <Select.Content>
                  {field.options.map((option) => (
                    <Select.Item key={String(option.value)} value={String(option.value)}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            );
          } else if (field.type === "slider") {
            const current = typeof value === "number" ? value : field.min!;
            control = (
              <Flex align="center" gap="2" style={{ flex: 1, minWidth: 120 }}>
                <Slider
                  id={id}
                  aria-label={field.label}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={[current]}
                  onValueChange={(next) => set(field.name, next[0] ?? current)}
                  style={{ flex: 1 }}
                />
                <Text size="2" weight="medium" className="vs-r-calc-slider-value">
                  {formatNumber(current)}
                </Text>
              </Flex>
            );
          } else {
            const draft = drafts[field.name] ?? (typeof value === "number" ? String(value) : "");
            control = (
              <TextField.Root
                id={id}
                type="number"
                inputMode="decimal"
                min={field.min}
                max={field.max}
                step={field.step}
                value={draft}
                onChange={(event) => {
                  const text = event.target.value;
                  setDrafts((current) => ({ ...current, [field.name]: text }));
                  set(field.name, toNumber(text));
                }}
                style={{ width: "9em" }}
              />
            );
          }
          return (
            <div key={field.name} className="vs-r-calc-field">
              <Text as="label" htmlFor={id} size="2" weight="medium">
                {field.label}
              </Text>
              <Flex align="center" gap="2">
                {control}
                {field.type === "toggle" ? null : unit}
              </Flex>
            </div>
          );
        })}
      </div>
      <div className="vs-r-calc-results" aria-live="polite">
        {outcome.error ? (
          <ProblemNotice component="Calculator" title="Couldn't compute" problems={[outcome.error]} />
        ) : (
          <dl className="vs-r-stats">
            {outcome.results.map((result, index) => (
              <div key={`${result.label}-${index}`} className="vs-r-stat">
                <dt>
                  <Text size="1" color="gray">
                    {result.label}
                  </Text>
                </dt>
                <dd>
                  <Text as="div" size={index === 0 ? "6" : "4"} weight="bold" className="vs-r-stat-value">
                    {result.text}
                  </Text>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <ProblemNotice component="Calculator" title="Calculator" problems={problems} />
    </ResponseFrame>
  );
}
