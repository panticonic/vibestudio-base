/**
 * `feedback_form` as a terminal form: a pure reducer over key events plus a
 * line renderer. Value semantics (defaults, the "Other" free-text choice,
 * required validation, the submitted shape) are the panel's, from
 * `@workspace/pubsub/feedback-form-values`.
 */
import type { FeedbackFormArgs } from "@workspace/pubsub";
import {
  evaluateFieldConditions,
  FREE_TEXT_CHOICE_VALUE,
  type FieldDefinition,
  type FieldValue,
} from "@vibestudio/types";
import {
  getFreeTextKey,
  initialFeedbackValues,
  isChoiceField,
  normalizeFreeTextValues,
  validateFeedbackValues,
  withDefaultFreeText,
} from "@workspace/pubsub/feedback-form-values";
import { indentWrap, paint, sanitize, style, symbols, wrap } from "./ansi.js";
import { applyEdit, editorFor, layoutComposer, type EditCommand } from "./composer.js";
import { highlightLines } from "./highlight.js";
import type { InputEvent } from "./keys.js";

export type FeedbackResult =
  | { type: "submit"; value: Record<string, FieldValue> }
  | { type: "cancel" };

const DISPLAY_TYPES = new Set(["readonly", "code", "diff", "toolPreview", "approvalHeader"]);
const TEXT_TYPES = new Set(["string", "textarea", "number"]);

/** A focus stop: a field, the free-text box of a choice field, or a button. */
export type FormStop =
  | { kind: "field"; key: string }
  | { kind: "free-text"; key: string }
  | { kind: "submit" }
  | { kind: "cancel" };

export interface FormState {
  fields: FieldDefinition[];
  values: Record<string, FieldValue>;
  /** Cursor of each text input (field key or free-text key). */
  cursors: Record<string, number>;
  /** Highlighted option of each choice field. */
  optionCursor: Record<string, number>;
  focus: number;
  error: string | null;
}

export function createForm(args: FeedbackFormArgs): FormState {
  const fields = withDefaultFreeText([...args.fields]).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
  const state: FormState = {
    fields,
    values: initialFeedbackValues(fields, args.values ?? {}),
    cursors: {},
    optionCursor: {},
    focus: 0,
    error: null,
  };
  return state;
}

export function visibleFields(state: FormState): FieldDefinition[] {
  return state.fields.filter((field) => evaluateFieldConditions(field.visibleWhen, state.values));
}

function isEnabled(field: FieldDefinition, values: Record<string, FieldValue>): boolean {
  return evaluateFieldConditions(field.enabledWhen, values);
}

function freeTextActive(field: FieldDefinition, values: Record<string, FieldValue>): boolean {
  if (!isChoiceField(field) || field.allowFreeText !== true) return false;
  const value = values[field.key];
  return Array.isArray(value)
    ? value.includes(FREE_TEXT_CHOICE_VALUE)
    : value === FREE_TEXT_CHOICE_VALUE;
}

export function formStops(state: FormState, args: FeedbackFormArgs): FormStop[] {
  const stops: FormStop[] = [];
  for (const field of visibleFields(state)) {
    if (DISPLAY_TYPES.has(field.type) || !isEnabled(field, state.values)) continue;
    stops.push({ kind: "field", key: field.key });
    if (freeTextActive(field, state.values)) stops.push({ kind: "free-text", key: field.key });
  }
  const anyFreeText = visibleFields(state).some((field) => freeTextActive(field, state.values));
  if (!args.hideSubmit || anyFreeText) stops.push({ kind: "submit" });
  if (!args.hideCancel) stops.push({ kind: "cancel" });
  return stops;
}

/** Options of a choice field, including the "Other" choice when free text is allowed. */
export function choiceOptions(
  field: FieldDefinition
): Array<{ value: string; label: string; description?: string }> {
  const base =
    field.type === "buttonGroup"
      ? (field.buttons ?? []).map((b) => ({
          value: b.value,
          label: b.label,
          ...(b.description ? { description: b.description } : {}),
        }))
      : (field.options ?? []);
  if (field.allowFreeText === true)
    return [...base, { value: FREE_TEXT_CHOICE_VALUE, label: field.freeTextLabel ?? "Other…" }];
  return base;
}

function fieldByKey(state: FormState, key: string): FieldDefinition | undefined {
  return state.fields.find((field) => field.key === key);
}

function textOf(value: FieldValue | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function submit(
  state: FormState,
  values = state.values
): { state: FormState; result?: FeedbackResult } {
  const fields = visibleFields({ ...state, values });
  const failure = validateFeedbackValues(fields, values);
  if (failure) return { state: { ...state, values, error: failure } };
  for (const field of fields) {
    if (field.type === "number" && values[field.key] !== undefined && values[field.key] !== "") {
      const number = Number(values[field.key]);
      if (!Number.isFinite(number)) {
        return {
          state: {
            ...state,
            values,
            error: `"${field.label ?? field.key}" must be a number`,
          },
        };
      }
    }
  }
  const typed: Record<string, FieldValue> = { ...values };
  for (const field of fields) {
    if (field.type === "number" && typeof typed[field.key] === "string") {
      typed[field.key] = typed[field.key] === "" ? (undefined as never) : Number(typed[field.key]);
      if (typed[field.key] === undefined) delete typed[field.key];
    }
  }
  for (const key of Object.keys(typed)) {
    if (!state.fields.some((f) => f.key === key || getFreeTextKey(f) === key)) continue;
    const field = fieldByKey(state, key);
    if (field && !fields.includes(field)) delete typed[key];
  }
  return {
    state: { ...state, values, error: null },
    result: { type: "submit", value: normalizeFreeTextValues(fields, typed) },
  };
}

const TEXT_EDITS: Record<string, EditCommand["kind"]> = {
  backspace: "backspace",
  delete: "delete",
  left: "left",
  right: "right",
  home: "line-start",
  end: "line-end",
};

/** Apply one input event; `result` is set when the form is answered. */
export function formReduce(
  state: FormState,
  args: FeedbackFormArgs,
  event: InputEvent
): { state: FormState; result?: FeedbackResult } {
  if (event.type === "focus") return { state };
  const stops = formStops(state, args);
  const focus = Math.min(state.focus, Math.max(0, stops.length - 1));
  const stop = stops[focus];
  const move = (delta: number) => ({
    state: {
      ...state,
      focus: Math.max(0, Math.min(stops.length - 1, focus + delta)),
      error: null,
    },
  });
  if (event.type === "key") {
    if (event.name === "escape") return { state, result: { type: "cancel" } };
    if (event.name === "tab") return move(event.shift ? -1 : 1);
    if (event.name === "char" && event.ctrl && event.text === "s") return submit(state);
  }
  if (!stop) return { state };
  if (stop.kind === "submit" || stop.kind === "cancel") {
    if (
      event.type === "key" &&
      (event.name === "enter" || (event.name === "char" && event.text === " "))
    ) {
      return stop.kind === "submit" ? submit(state) : { state, result: { type: "cancel" } };
    }
    if (event.type === "key" && (event.name === "up" || event.name === "left")) return move(-1);
    if (event.type === "key" && (event.name === "down" || event.name === "right")) return move(1);
    return { state };
  }
  const field = fieldByKey(state, stop.key)!;
  const textKey = stop.kind === "free-text" ? getFreeTextKey(field) : field.key;
  const isText = stop.kind === "free-text" || TEXT_TYPES.has(field.type);
  if (isText) {
    const current = textOf(state.values[textKey]);
    const editor = {
      ...editorFor(current),
      cursor: Math.min(state.cursors[textKey] ?? current.length, current.length),
    };
    let command: EditCommand | null = null;
    if (event.type === "paste")
      command = {
        kind: "insert",
        text: field.type === "textarea" ? event.text : event.text.replace(/\n/g, " "),
      };
    else if (event.name === "char" && !event.ctrl && !event.meta)
      command = { kind: "insert", text: event.text };
    else if (event.name === "char" && event.ctrl && event.text === "w")
      command = { kind: "delete-word-back" };
    else if (event.name === "char" && event.ctrl && event.text === "u")
      command = { kind: "kill-line-back" };
    else if (
      event.name === "enter" &&
      field.type === "textarea" &&
      stop.kind === "field" &&
      (event.meta || event.shift)
    )
      command = { kind: "newline" };
    else if (TEXT_EDITS[event.name]) command = { kind: TEXT_EDITS[event.name]! } as EditCommand;
    if (command) {
      const next = applyEdit(editor, command);
      return {
        state: {
          ...state,
          values: { ...state.values, [textKey]: next.text },
          cursors: { ...state.cursors, [textKey]: next.cursor },
          error: null,
        },
      };
    }
    if (event.type !== "key") return { state };
    if (event.name === "enter")
      return stops[focus + 1]?.kind === "submit" ? submit(state) : move(1);
    if (event.name === "up") return move(-1);
    if (event.name === "down") return move(1);
    return { state };
  }
  if (event.type !== "key") return { state };
  if (field.type === "boolean" || field.type === "toggle") {
    if (event.name === "char" && event.text === " ")
      return { state: setValue(state, field.key, !state.values[field.key]) };
    if (event.name === "left" || event.name === "right")
      return { state: setValue(state, field.key, event.name === "right") };
    if (event.name === "enter") return move(1);
  }
  if (field.type === "slider") {
    const step = field.step ?? 1;
    const min = field.min ?? 0;
    const max = field.max ?? 100;
    const value =
      typeof state.values[field.key] === "number" ? (state.values[field.key] as number) : min;
    if (event.name === "left")
      return { state: setValue(state, field.key, Math.max(min, value - step)) };
    if (event.name === "right")
      return { state: setValue(state, field.key, Math.min(max, value + step)) };
    if (event.name === "enter") return move(1);
  }
  if (isChoiceField(field)) {
    const options = choiceOptions(field);
    const cursor = Math.min(
      state.optionCursor[field.key] ?? selectedIndex(field, state.values, options),
      Math.max(0, options.length - 1)
    );
    const withCursor = (next: number): FormState => ({
      ...state,
      optionCursor: { ...state.optionCursor, [field.key]: next },
      error: null,
    });
    if (
      event.name === "left" ||
      (event.name === "up" && field.type === "multiSelect" && cursor > 0)
    )
      return { state: withCursor(Math.max(0, cursor - 1)) };
    if (
      event.name === "right" ||
      (event.name === "down" && field.type === "multiSelect" && cursor < options.length - 1)
    )
      return { state: withCursor(Math.min(options.length - 1, cursor + 1)) };
    const option = options[cursor];
    if (option && ((event.name === "char" && event.text === " ") || event.name === "enter")) {
      if (field.type === "multiSelect") {
        if (event.name === "enter") return move(1);
        const current = Array.isArray(state.values[field.key])
          ? (state.values[field.key] as string[])
          : [];
        const next = current.includes(option.value)
          ? current.filter((v) => v !== option.value)
          : [...current, option.value];
        return { state: setValue(withCursor(cursor), field.key, next) };
      }
      const next = setValue(withCursor(cursor), field.key, option.value);
      if (field.submitOnSelect && option.value !== FREE_TEXT_CHOICE_VALUE) return submit(next);
      return event.name === "enter"
        ? {
            state: {
              ...next,
              focus: Math.min(focus + 1, formStops(next, args).length - 1),
            },
          }
        : { state: next };
    }
  }
  if (event.name === "up") return move(-1);
  if (event.name === "down") return move(1);
  return { state };
}

function selectedIndex(
  field: FieldDefinition,
  values: Record<string, FieldValue>,
  options: ReturnType<typeof choiceOptions>
): number {
  const value = values[field.key];
  const index = options.findIndex(
    (option) => option.value === (Array.isArray(value) ? value[0] : value)
  );
  return index < 0 ? 0 : index;
}

function setValue(state: FormState, key: string, value: FieldValue): FormState {
  return { ...state, values: { ...state.values, [key]: value }, error: null };
}

// ── rendering ────────────────────────────────────────────────────────────────

export interface FormRender {
  lines: string[];
  /** Line index of the focused stop, so a scroll window can keep it visible. */
  focusLine: number;
  /** Cursor position when a text input is focused. */
  cursor: { line: number; column: number } | null;
}

export function renderForm(state: FormState, args: FeedbackFormArgs, columns: number): FormRender {
  const cols = Math.max(20, columns);
  const stops = formStops(state, args);
  const focused = stops[Math.min(state.focus, Math.max(0, stops.length - 1))];
  const lines: string[] = [];
  let focusLine = 0;
  let cursor: FormRender["cursor"] = null;
  const tone = args.severity === "danger" ? "red" : args.severity === "warning" ? "yellow" : "cyan";
  const header = visibleFields(state).find((f) => f.type === "approvalHeader");
  const title = header
    ? `${header.agentName ?? "An agent"} wants to use ${header.displayName ?? header.toolName ?? "a tool"}`
    : args.title;
  lines.push(...wrap(paint(sanitize(title), "bold", tone), cols));
  for (const field of visibleFields(state)) {
    const enabled = isEnabled(field, state.values);
    const isFocused = focused?.kind === "field" && focused.key === field.key;
    const marker = isFocused ? style.cyan("❯ ") : "  ";
    if (isFocused) focusLine = lines.length + 1;
    lines.push("");
    const label = `${field.label ?? (DISPLAY_TYPES.has(field.type) ? "" : field.key)}${field.required ? style.red(" *") : ""}`;
    if (label) lines.push(marker + paint(label, "bold", !enabled && "gray"));
    if (field.description)
      lines.push(...indentWrap(sanitize(field.description), cols, "  ").map((l) => style.gray(l)));
    const value = state.values[field.key];
    switch (field.type) {
      case "readonly":
        lines.push(...indentWrap(sanitize(textOf(value ?? field.default)), cols, "  "));
        break;
      case "code":
      case "diff":
      case "toolPreview": {
        const text =
          field.type === "toolPreview"
            ? JSON.stringify(field.toolArgs ?? value ?? {}, null, 2)
            : textOf(value ?? field.default);
        const language =
          field.type === "diff"
            ? "diff"
            : field.type === "toolPreview"
              ? "json"
              : (field.language ?? null);
        const code = highlightLines(sanitize(text), language);
        for (const line of code)
          for (const piece of wrap(line, cols - 4)) lines.push(`  ${style.gray("│")} ${piece}`);
        break;
      }
      case "approvalHeader":
        if (field.isFirstTimeGrant)
          lines.push(style.yellow("  This is the first time it asks for this."));
        break;
      case "string":
      case "textarea":
      case "number": {
        const text = textOf(value);
        const placeholder = field.placeholder ? style.gray(sanitize(field.placeholder)) : "";
        const at = lines.length;
        const caret = Math.min(state.cursors[field.key] ?? text.length, text.length);
        const layout = layoutComposer(text, caret, cols - 4);
        layout.lines.forEach((line, index) =>
          lines.push(`  ${style.gray("│")} ${index === 0 && !text ? placeholder : line}`)
        );
        if (isFocused) {
          cursor = {
            line: at + layout.cursorRow,
            column: 4 + layout.cursorColumn,
          };
          focusLine = cursor.line;
        }
        break;
      }
      case "boolean":
      case "toggle":
        lines.push(
          `  ${value ? style.green("[x] yes") : "[ ] no"}${isFocused ? style.gray("  Space toggles") : ""}`
        );
        break;
      case "slider": {
        const min = field.min ?? 0;
        const max = field.max ?? 100;
        const current = typeof value === "number" ? value : min;
        const notch = field.notches?.find((n) => n.value === current);
        lines.push(
          `  ${field.sliderLabels?.min ?? min} ◀ ${style.bold(String(current))}${notch ? ` (${notch.label})` : ""} ▶ ${field.sliderLabels?.max ?? max}`
        );
        break;
      }
      case "select":
      case "segmented":
      case "buttonGroup":
      case "multiSelect": {
        const options = choiceOptions(field);
        const cursorIndex =
          state.optionCursor[field.key] ?? selectedIndex(field, state.values, options);
        options.forEach((option, index) => {
          const selected = Array.isArray(value)
            ? value.includes(option.value)
            : value === option.value;
          const box =
            field.type === "multiSelect" ? (selected ? "[x]" : "[ ]") : selected ? "(•)" : "( )";
          const pointer = isFocused && index === cursorIndex ? style.cyan("›") : " ";
          const text = `${pointer} ${box} ${option.label}${option.description ? style.gray(` — ${option.description}`) : ""}`;
          if (isFocused && index === cursorIndex) focusLine = lines.length;
          lines.push(
            ...indentWrap(
              isFocused && index === cursorIndex ? style.bold(text) : text,
              cols,
              "  ",
              "      "
            )
          );
        });
        if (freeTextActive(field, state.values)) {
          const key = getFreeTextKey(field);
          const text = textOf(state.values[key]);
          const freeFocused = focused?.kind === "free-text" && focused.key === field.key;
          const caret = Math.min(state.cursors[key] ?? text.length, text.length);
          const at = lines.length;
          const layout = layoutComposer(text, caret, cols - 6);
          if (freeFocused) {
            focusLine = at + layout.cursorRow;
            cursor = { line: focusLine, column: 6 + layout.cursorColumn };
          }
          layout.lines.forEach((line, index) =>
            lines.push(
              `${freeFocused && index === 0 ? style.cyan("❯ ") : "  "}  ${style.gray("│")} ${index === 0 && !text ? style.gray(field.freeTextPlaceholder ?? "Type your answer") : line}`
            )
          );
        }
        break;
      }
    }
    for (const warning of field.warnings ?? []) {
      void warning;
    }
  }
  lines.push("");
  const buttons: string[] = [];
  const stopIndex = (kind: "submit" | "cancel") => stops.findIndex((s) => s.kind === kind);
  for (const kind of ["submit", "cancel"] as const) {
    const index = stopIndex(kind);
    if (index < 0) continue;
    const label =
      kind === "submit" ? (args.submitLabel ?? "Submit") : (args.cancelLabel ?? "Cancel");
    const isFocused = focused?.kind === kind;
    if (isFocused) focusLine = lines.length;
    buttons.push(isFocused ? style.inverse(` ${label} `) : `[ ${label} ]`);
  }
  lines.push(`  ${buttons.join("  ")}`);
  if (state.error)
    lines.push(
      ...indentWrap(state.error, cols, style.red(`${symbols.cross} `), "  ").map((l) =>
        style.red(l)
      )
    );
  lines.push(
    style.gray(
      "  Tab/↑↓ move · PgUp/PgDn inspect · ←→ choose · Space toggles · Enter confirms · Ctrl-S submits · Esc cancels"
    )
  );
  return { lines, focusLine, cursor };
}
