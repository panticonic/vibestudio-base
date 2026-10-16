/**
 * Controls under the browser's names. Each is a `Pressable` or a focusable
 * field: Tab moves between them, Enter or Space presses, a click presses.
 */
import React, { createContext, useContext, useRef, useState } from "react";
import { Box, Text as InkText, useFocus, useFocusManager, useInput } from "ink";
import { ButtonFace, Clickable, Pressable } from "./interaction.js";
import { tone } from "./theme.js";

type Loose = Record<string, unknown> & { children?: React.ReactNode };
type Handler = ((...args: unknown[]) => unknown) | undefined;

export function call(handler: unknown, ...args: unknown[]): void {
  if (typeof handler === "function") (handler as (...a: unknown[]) => unknown)(...args);
}

/** The event-ish object a DOM handler reads its value from. */
export function changeEvent(value: string) {
  return { target: { value }, currentTarget: { value }, preventDefault() {}, stopPropagation() {} };
}

/** A value that is controlled when `value` is given, local otherwise. */
function useControllable<T>(value: T | undefined, initial: T, onChange: Handler) {
  const [local, setLocal] = useState<T>(initial);
  const current = value !== undefined ? value : local;
  const set = (next: T) => {
    if (value === undefined) setLocal(next);
    call(onChange, next);
  };
  return [current, set] as const;
}

export function Button(props: Loose): React.ReactElement {
  const disabled = props["disabled"] === true || props["loading"] === true;
  return (
    <Pressable
      onPress={() => call(props["onClick"], { preventDefault() {}, stopPropagation() {} })}
      disabled={disabled}
    >
      {(focused) => (
        <ButtonFace
          label={props["loading"] === true ? "…" : props.children}
          tone={tone(props["color"])}
          focused={focused}
          disabled={disabled}
        />
      )}
    </Pressable>
  );
}

export const IconButton = Button;

export function Checkbox(props: Loose): React.ReactElement {
  const [checked, setChecked] = useControllable<boolean>(
    props["checked"] as boolean | undefined,
    props["defaultChecked"] === true,
    props["onCheckedChange"] as Handler
  );
  return (
    <Pressable onPress={() => setChecked(!checked)} disabled={props["disabled"] === true}>
      {(focused) => (
        <InkText inverse={focused} color={checked ? "green" : undefined}>
          {checked ? "☑" : "☐"}
          {props.children ? <InkText> {props.children}</InkText> : null}
        </InkText>
      )}
    </Pressable>
  );
}

export function Switch(props: Loose): React.ReactElement {
  const [on, setOn] = useControllable<boolean>(
    props["checked"] as boolean | undefined,
    props["defaultChecked"] === true,
    props["onCheckedChange"] as Handler
  );
  return (
    <Pressable onPress={() => setOn(!on)} disabled={props["disabled"] === true}>
      {(focused) => (
        <InkText inverse={focused} color={on ? "green" : "gray"}>
          {on ? "[on ]" : "[off]"}
        </InkText>
      )}
    </Pressable>
  );
}

// ── choosing one or several of a set ────────────────────────────────────────

interface ChoiceSet {
  selected: (value: string) => boolean;
  toggle: (value: string) => void;
  multiple: boolean;
}

const ChoiceContext = createContext<ChoiceSet | null>(null);

function SingleRoot(props: Loose): React.ReactElement {
  const [value, setValue] = useControllable<string>(
    props["value"] as string | undefined,
    String(props["defaultValue"] ?? ""),
    props["onValueChange"] as Handler
  );
  const row = props["direction"] === "row" || props["orientation"] === "horizontal";
  return (
    <ChoiceContext.Provider
      value={{ selected: (v) => v === value, toggle: setValue, multiple: false }}
    >
      <Box flexDirection={row ? "row" : "column"} columnGap={2}>
        {props.children}
      </Box>
    </ChoiceContext.Provider>
  );
}

function MultipleRoot(props: Loose): React.ReactElement {
  const [values, setValues] = useControllable<string[]>(
    props["value"] as string[] | undefined,
    (props["defaultValue"] as string[] | undefined) ?? [],
    props["onValueChange"] as Handler
  );
  return (
    <ChoiceContext.Provider
      value={{
        selected: (v) => values.includes(v),
        toggle: (v) =>
          setValues(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]),
        multiple: true,
      }}
    >
      <Box flexDirection="column">{props.children}</Box>
    </ChoiceContext.Provider>
  );
}

function ChoiceItem(props: Loose): React.ReactElement {
  const set = useContext(ChoiceContext);
  const value = String(props["value"] ?? "");
  const chosen = set?.selected(value) ?? false;
  const mark = set?.multiple ? (chosen ? "☑" : "☐") : chosen ? "◉" : "○";
  return (
    <Pressable onPress={() => set?.toggle(value)} disabled={props["disabled"] === true}>
      {(focused) => (
        <InkText inverse={focused} color={chosen ? "cyan" : undefined}>
          {mark} {props.children ?? value}
        </InkText>
      )}
    </Pressable>
  );
}

export const RadioGroup = { Root: SingleRoot, Item: ChoiceItem };
export const RadioCards = { Root: SingleRoot, Item: ChoiceItem };
export const CheckboxGroup = { Root: MultipleRoot, Item: ChoiceItem };
export const CheckboxCards = { Root: MultipleRoot, Item: ChoiceItem };

function SegmentedRoot(props: Loose): React.ReactElement {
  return <SingleRoot {...props} direction="row" />;
}

function SegmentedItem(props: Loose): React.ReactElement {
  const set = useContext(ChoiceContext);
  const value = String(props["value"] ?? "");
  const chosen = set?.selected(value) ?? false;
  return (
    <Pressable onPress={() => set?.toggle(value)}>
      {(focused) => (
        <InkText inverse={chosen || focused} bold={focused} color={chosen ? "cyan" : "gray"}>
          {` ${String(props.children ?? value)} `}
        </InkText>
      )}
    </Pressable>
  );
}

export const SegmentedControl = { Root: SegmentedRoot, Item: SegmentedItem };

// ── select: a value that steps through its options ──────────────────────────

interface SelectState {
  value: string;
  set: (value: string) => void;
  options: { value: string; label: React.ReactNode }[];
}

const SelectContext = createContext<SelectState | null>(null);

function collectOptions(children: React.ReactNode, out: SelectState["options"]): void {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as Loose;
    if (child.type === SelectItem)
      out.push({ value: String(props["value"]), label: props.children });
    else collectOptions(props.children, out);
  });
}

function SelectRoot(props: Loose): React.ReactElement {
  const [value, setValue] = useControllable<string>(
    props["value"] as string | undefined,
    String(props["defaultValue"] ?? ""),
    props["onValueChange"] as Handler
  );
  const options: SelectState["options"] = [];
  collectOptions(props.children, options);
  return (
    <SelectContext.Provider value={{ value, set: setValue, options }}>
      {React.Children.toArray(props.children).filter(
        (child) => React.isValidElement(child) && child.type === SelectTrigger
      )}
    </SelectContext.Provider>
  );
}

/** Shows the chosen option; Enter, Space, → or a click step to the next, ← back. */
function SelectTrigger(props: Loose): React.ReactElement {
  const state = useContext(SelectContext);
  const { isFocused } = useFocus();
  const options = state?.options ?? [];
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === state?.value)
  );
  const step = (by: number) => {
    if (!state || options.length === 0) return;
    state.set(options[(index + by + options.length) % options.length]!.value);
  };
  useInput(
    (input, key) => {
      if (key.leftArrow) step(-1);
      else if (key.rightArrow || key.return || input === " ") step(1);
    },
    { isActive: isFocused }
  );
  const shown =
    options.find((option) => option.value === state?.value)?.label ??
    props["placeholder"] ??
    "Choose…";
  return (
    <Clickable onPress={() => step(1)}>
      <InkText inverse={isFocused}>‹ {shown as React.ReactNode} ›</InkText>
    </Clickable>
  );
}

function SelectItem(_props: Loose): null {
  return null;
}

function SelectNothing(props: Loose): React.ReactElement {
  return <>{props.children}</>;
}

export const Select = {
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Content: SelectNothing,
  Item: SelectItem,
  Group: SelectNothing,
  Label: SelectNothing,
  Separator: () => null,
};

// ── text entry ──────────────────────────────────────────────────────────────

/** A one-line (or multi-line) field: focus it with Tab or a click and type. */
function Field(props: Loose & { multiline?: boolean }): React.ReactElement {
  const [value, setValue] = useControllable<string>(
    props["value"] as string | undefined,
    String(props["defaultValue"] ?? ""),
    undefined
  );
  const { isFocused, focus } = useFieldFocus();
  const latest = useRef(value);
  latest.current = value;
  const change = (next: string) => {
    setValue(next);
    call(props["onChange"], changeEvent(next));
    call(props["onValueChange"], next);
  };
  useInput(
    (input, key) => {
      if (key.return && !props.multiline) {
        call(props["onKeyDown"], { key: "Enter", preventDefault() {}, stopPropagation() {} });
        return;
      }
      if (key.backspace || key.delete) change(latest.current.slice(0, -1));
      else if (key.return) change(`${latest.current}\n`);
      else if (input && !key.ctrl && !key.meta && !key.tab && !key.escape)
        change(latest.current + input);
    },
    { isActive: isFocused }
  );
  const shown = value || (typeof props["placeholder"] === "string" ? props["placeholder"] : "");
  return (
    <Clickable onPress={focus}>
      <InkText {...(isFocused ? { underline: true } : {})} dimColor={!value}>
        {`[ ${shown}${isFocused ? "▏" : ""} ]`}
      </InkText>
    </Clickable>
  );
}

/** Focus by Tab like any control, and by a click on the field itself. */
function useFieldFocus() {
  const id = React.useId();
  const { isFocused } = useFocus({ id });
  const manager = useFocusManager();
  return { isFocused, focus: () => manager.focus(id) };
}

function TextFieldRoot(props: Loose): React.ReactElement {
  return <Field {...props} />;
}

export const TextField = { Root: TextFieldRoot, Slot: () => null };
export function TextArea(props: Loose): React.ReactElement {
  return <Field {...props} multiline />;
}

/** ← and → move it by its step. */
export function Slider(props: Loose): React.ReactElement {
  const min = Number(props["min"] ?? 0);
  const max = Number(props["max"] ?? 100);
  const step = Number(props["step"] ?? 1) || 1;
  const initial = (props["defaultValue"] as number[] | undefined)?.[0] ?? min;
  const [values, setValues] = useControllable<number[]>(
    props["value"] as number[] | undefined,
    [initial],
    props["onValueChange"] as Handler
  );
  const value = values[0] ?? min;
  const { isFocused } = useFocus();
  useInput(
    (_input, key) => {
      if (key.leftArrow) setValues([Math.max(min, value - step)]);
      if (key.rightArrow) setValues([Math.min(max, value + step)]);
    },
    { isActive: isFocused }
  );
  const cells = 20;
  const at = Math.round(((value - min) / Math.max(1, max - min)) * cells);
  return (
    <InkText inverse={isFocused}>
      {"─".repeat(at)}●{"─".repeat(cells - at)} {value}
    </InkText>
  );
}

// ── tabs ────────────────────────────────────────────────────────────────────

const TabsContext = createContext<{ value: string; set: (value: string) => void } | null>(null);

function TabsRoot(props: Loose): React.ReactElement {
  const [value, setValue] = useControllable<string>(
    props["value"] as string | undefined,
    String(props["defaultValue"] ?? ""),
    props["onValueChange"] as Handler
  );
  return (
    <TabsContext.Provider value={{ value, set: setValue }}>
      <Box flexDirection="column">{props.children}</Box>
    </TabsContext.Provider>
  );
}

function TabsList(props: Loose): React.ReactElement {
  return (
    <Box flexDirection="row" columnGap={1} marginBottom={0}>
      {props.children}
    </Box>
  );
}

function TabsTrigger(props: Loose): React.ReactElement {
  const tabs = useContext(TabsContext);
  const value = String(props["value"] ?? "");
  const active = tabs?.value === value;
  return (
    <Pressable onPress={() => tabs?.set(value)}>
      {(focused) => (
        <InkText inverse={active || focused} bold={active} color={active ? "cyan" : "gray"}>
          {` ${String(props.children ?? value)} `}
        </InkText>
      )}
    </Pressable>
  );
}

function TabsContent(props: Loose): React.ReactElement | null {
  const tabs = useContext(TabsContext);
  if (tabs?.value !== String(props["value"] ?? "")) return null;
  return <Box flexDirection="column">{props.children}</Box>;
}

export const Tabs = { Root: TabsRoot, List: TabsList, Trigger: TabsTrigger, Content: TabsContent };
export const TabNav = { Root: TabsList, Link: TabsTrigger };
