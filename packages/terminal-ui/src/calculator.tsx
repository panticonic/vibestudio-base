/**
 * `Calculator`: the browser's inputs and live results, with the terminal's
 * controls. `compute` runs on every change; a failure is shown, not thrown.
 */
import React, { useState } from "react";
import { Box, Text as InkText } from "ink";
import { Select, Slider, Switch, TextField } from "./controls.js";
import { formatNumber, list, number, record, text } from "./theme.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };
type Value = number | string | boolean | null;

interface Field {
  name: string;
  label: string;
  type: "number" | "slider" | "select" | "toggle";
  min: number;
  max: number;
  step: number;
  unit: string | undefined;
  options: { label: string; value: string | number }[];
  initial: Value;
}

function field(raw: Record<string, unknown>, index: number): Field {
  const name = text(raw["name"]) ?? text(raw["label"]) ?? `field${index + 1}`;
  const options = list(raw["options"]).flatMap((option) => {
    const item = record(option);
    const value = item
      ? (number(item["value"]) ?? text(item["value"]))
      : (number(option) ?? text(option));
    const label =
      (item ? text(item["label"]) : undefined) ?? (value === undefined ? undefined : String(value));
    return label === undefined ? [] : [{ label, value: value ?? label }];
  });
  const type =
    (["number", "slider", "select", "toggle"] as const).find((t) => t === raw["type"]) ??
    (options.length > 0 ? "select" : "number");
  const min = number(raw["min"]) ?? 0;
  const max = number(raw["max"]) ?? 100;
  const wanted = number(raw["default"]) ?? text(raw["default"]);
  const initial: Value =
    type === "toggle"
      ? raw["default"] === true || raw["default"] === "true"
      : type === "select"
        ? (options.find((o) => o.value === wanted || o.label === wanted)?.value ??
          options[0]?.value ??
          null)
        : (number(raw["default"]) ?? (type === "slider" ? min : null));
  return {
    name,
    label: text(raw["label"]) ?? name,
    type,
    min,
    max,
    step: number(raw["step"]) ?? 1,
    unit: text(raw["unit"]),
    options,
    initial,
  };
}

/** Run `compute` and read its results as label/text pairs; failures become `error`. */
function compute(fn: unknown, values: Record<string, Value>, currency: string | undefined) {
  if (typeof fn !== "function")
    return { results: [], error: "`compute` must be a function: compute={(v) => [...]}" };
  let output: unknown;
  try {
    output = (fn as (v: Record<string, Value>) => unknown)(values);
  } catch (cause) {
    return { results: [], error: cause instanceof Error ? cause.message : String(cause) };
  }
  const entries = Array.isArray(output)
    ? output
    : record(output)
      ? Object.entries(output as object).map(([label, value]) =>
          record(value) ? { label, ...record(value)! } : { label, value }
        )
      : [];
  const results = entries.flatMap((entry, index) => {
    const item = record(entry);
    if (!item) return [];
    const value = item["value"];
    const format =
      item["format"] === "percent" || item["format"] === "currency" ? item["format"] : "number";
    const unit = text(item["unit"]);
    return [
      {
        label: text(item["label"]) ?? `Result ${index + 1}`,
        text:
          typeof value === "number"
            ? Number.isFinite(value)
              ? formatNumber(value, {
                  format,
                  ...(currency ? { currency } : {}),
                  ...(unit ? { unit } : {}),
                })
              : "—"
            : (text(value) ?? "—"),
      },
    ];
  });
  return results.length > 0
    ? { results, error: null }
    : { results, error: "`compute` returned no results." };
}

export function Calculator(props: Loose): React.ReactElement {
  const fields = list(props["fields"]).flatMap((raw, index) =>
    record(raw) ? [field(record(raw)!, index)] : []
  );
  const [edits, setEdits] = useState<Record<string, Value>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const values: Record<string, Value> = Object.fromEntries(
    fields.map((f) => [f.name, Object.hasOwn(edits, f.name) ? edits[f.name]! : f.initial])
  );
  const set = (name: string, value: Value) =>
    setEdits((current) => ({ ...current, [name]: value }));
  const outcome = compute(props["compute"], values, text(props["currency"]));
  const labelWidth = Math.max(0, ...fields.map((f) => f.label.length));
  return (
    <Box flexDirection="column">
      {text(props["title"]) ? <InkText bold>{text(props["title"])}</InkText> : null}
      {fields.length === 0 ? (
        <InkText color="red">Calculator needs a non-empty `fields` list.</InkText>
      ) : null}
      {fields.map((f) => {
        const value = values[f.name];
        return (
          <Box key={f.name} flexDirection="row" columnGap={1}>
            <Box width={labelWidth} flexShrink={0}>
              <InkText>{f.label}</InkText>
            </Box>
            {f.type === "toggle" ? (
              <Switch
                checked={value === true}
                onCheckedChange={(next: boolean) => set(f.name, next)}
              />
            ) : f.type === "select" ? (
              <Select.Root
                value={value === null ? undefined : String(value)}
                onValueChange={(next: string) =>
                  set(f.name, f.options.find((o) => String(o.value) === next)?.value ?? next)
                }
              >
                <Select.Trigger />
                <Select.Content>
                  {f.options.map((o) => (
                    <Select.Item key={String(o.value)} value={String(o.value)}>
                      {o.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            ) : f.type === "slider" ? (
              <Slider
                min={f.min}
                max={f.max}
                step={f.step}
                value={[typeof value === "number" ? value : f.min]}
                onValueChange={(next: number[]) => set(f.name, next[0] ?? f.min)}
              />
            ) : (
              <TextField.Root
                value={drafts[f.name] ?? (typeof value === "number" ? String(value) : "")}
                onChange={(event: { target: { value: string } }) => {
                  setDrafts((current) => ({ ...current, [f.name]: event.target.value }));
                  set(f.name, number(event.target.value));
                }}
              />
            )}
            {f.unit && f.type !== "toggle" ? <InkText dimColor>{f.unit}</InkText> : null}
          </Box>
        );
      })}
      {fields.length > 0 ? (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="single"
          borderColor="gray"
          borderDimColor
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
        >
          {outcome.error ? (
            <InkText color="red">{outcome.error}</InkText>
          ) : (
            outcome.results.map((result, index) => (
              <InkText key={`${result.label}:${index}`}>
                <InkText dimColor>{`${result.label}: `}</InkText>
                <InkText bold color={index === 0 ? "cyan" : undefined}>
                  {result.text}
                </InkText>
              </InkText>
            ))
          )}
        </Box>
      ) : null}
    </Box>
  );
}
