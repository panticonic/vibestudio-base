/**
 * Full-height panels drawn over the transcript: pickers (models, agents,
 * conversations, forks, missions, the Ctrl-K palette), help, the queued
 * messages view and the provider sign-in card. Pure renderers to lines.
 */
import { indentWrap, paint, style, symbols, truncate, width, wrap } from "./ansi.js";
import { COMMANDS, rankByFuzzy } from "./commands.js";
import { BINDINGS } from "./keymap.js";
import type { SignInState } from "../runtime/providerSignIn.js";

export interface PickerItem {
  id: string;
  label: string;
  detail?: string;
  /** Shown but not choosable, with the reason as detail. */
  disabled?: boolean;
  /** Marks the current value. */
  current?: boolean;
  /** Indentation level (trees). */
  depth?: number;
}

export interface PickerState {
  title: string;
  items: readonly PickerItem[];
  query: string;
  index: number;
  /** Shown when nothing matches or the list is empty. */
  empty: string;
  /** Extra line under the title. */
  hint?: string;
  /** Whether typing filters the list (otherwise letters are ignored). */
  filterable: boolean;
}

export function pickerVisibleItems(picker: PickerState): PickerItem[] {
  if (!picker.filterable || !picker.query) return [...picker.items];
  return rankByFuzzy(picker.items, picker.query, (item) => `${item.label} ${item.detail ?? ""}`);
}

function frame(
  title: string,
  body: string[],
  footer: string,
  columns: number,
  rows: number
): string[] {
  const out = [
    paint(truncate(title, columns), "bold"),
    style.gray("─".repeat(Math.max(1, columns))),
  ];
  const room = Math.max(1, rows - out.length - 1);
  out.push(...body.slice(0, room));
  while (out.length < rows - 1) out.push("");
  out.push(style.gray(truncate(footer, columns)));
  return out.slice(0, rows);
}

/** Rendered lines, and for each line the listed item it shows (null for none). */
export interface ListLines {
  lines: string[];
  items: (number | null)[];
}

/** `frame` output's item map: its body starts after the title and the rule. */
function framedItems(bodyItems: readonly (number | null)[], rows: number): (number | null)[] {
  const items: (number | null)[] = [null, null, ...bodyItems.slice(0, Math.max(1, rows - 3))];
  while (items.length < rows) items.push(null);
  return items.slice(0, rows);
}

export function renderPicker(picker: PickerState, columns: number, rows: number): ListLines {
  const items = pickerVisibleItems(picker);
  const body: string[] = [];
  const bodyItems: (number | null)[] = [];
  if (picker.hint) body.push(...indentWrap(picker.hint, columns, "").map((l) => style.gray(l)), "");
  if (picker.filterable)
    body.push(`${style.cyan("filter ›")} ${picker.query}${style.cyan(symbols.cursor)}`, "");
  const listRows = Math.max(1, rows - 3 - body.length);
  if (items.length === 0) {
    body.push(style.gray(picker.empty));
  } else {
    const index = Math.min(picker.index, items.length - 1);
    const start = Math.max(0, Math.min(index - Math.floor(listRows / 2), items.length - listRows));
    for (let i = start; i < Math.min(items.length, start + listRows); i++) {
      const item = items[i]!;
      const selected = i === index;
      const indent = "  ".repeat(item.depth ?? 0);
      const mark = item.current ? style.green(" ✓") : "";
      const label = `${selected ? style.cyan("❯ ") : "  "}${indent}${item.disabled ? style.gray(item.label) : selected ? style.bold(item.label) : item.label}${mark}`;
      const detail = item.detail ? style.gray(`  ${item.detail}`) : "";
      while (bodyItems.length < body.length) bodyItems.push(null);
      body.push(truncate(label + detail, columns));
      bodyItems.push(i);
    }
  }
  while (bodyItems.length < body.length) bodyItems.push(null);
  return {
    lines: frame(
      picker.title,
      body,
      "↑↓ choose · Enter select · Esc close" + (picker.filterable ? " · type to filter" : ""),
      columns,
      rows
    ),
    items: framedItems(bodyItems, rows),
  };
}

/** Move the picker cursor, skipping nothing (disabled items stay selectable to read their reason). */
export function movePicker(picker: PickerState, delta: number): PickerState {
  const count = pickerVisibleItems(picker).length;
  if (count === 0) return picker;
  return {
    ...picker,
    index: Math.max(0, Math.min(count - 1, picker.index + delta)),
  };
}

export function renderHelp(
  columns: number,
  rows: number,
  approvalsKey: string,
  scroll: number
): { lines: string[]; maxScroll: number } {
  const body: string[] = [];
  const section = (title: string) => body.push("", style.bold(title));
  section("Writing");
  for (const binding of BINDINGS.filter((b) => b.mode === "compose")) {
    body.push(
      ...indentWrap(
        `${binding.description}`,
        columns,
        `  ${paint(binding.label.padEnd(10), "cyan")}`,
        " ".repeat(12)
      )
    );
  }
  body.push(
    ...indentWrap(
      "Up/Down at the first/last line browse what you sent before; @ completes names; Tab accepts a completion.",
      columns,
      "  "
    )
  );
  section("Mouse");
  body.push(
    ...indentWrap(
      "Click a message to select it, a tool call or thinking to expand it, a menu or list item to choose it, and any key in the hint line to press it; the status line opens settings. An agent's questions take clicks on their fields, options and buttons. Scrolled up, the ↓ bar at the bottom (or Ctrl-End) returns to the newest message. The wheel scrolls. Hold Shift to select text with your terminal.",
      columns,
      "  "
    )
  );
  section("Reading the transcript (Ctrl-↑ to start)");
  for (const binding of BINDINGS.filter((b) => b.mode === "select")) {
    body.push(
      ...indentWrap(
        `${binding.description}`,
        columns,
        `  ${paint(binding.label.padEnd(10), "cyan")}`,
        " ".repeat(12)
      )
    );
  }
  section("Commands (type / to complete them)");
  for (const command of COMMANDS) {
    const name = `/${command.name}${command.args ? ` ${command.args}` : ""}`;
    body.push(
      ...indentWrap(command.summary, columns, `  ${paint(name.padEnd(26), "cyan")}`, " ".repeat(28))
    );
  }
  section("Approvals");
  body.push(
    ...indentWrap(
      `Agents ask before risky actions. You answer in the terminal browser's approvals overlay: press ${approvalsKey}. This chat never asks for approvals itself, so a prompt drawn inside the chat is not a real approval.`,
      columns,
      "  "
    )
  );
  section("Messages starting with /");
  body.push(...indentWrap("Start the message with // to send a literal slash.", columns, "  "));
  const room = rows - 3;
  const maxScroll = Math.max(0, body.length - room);
  const start = Math.min(scroll, maxScroll);
  return {
    lines: frame("Help", body.slice(start), "↑↓ PgUp PgDn scroll · Esc close", columns, rows),
    maxScroll,
  };
}

export interface QueueItem {
  id: string;
  text: string;
  /** "sending", "queued for the agent", "after the turn", "waiting for the first agent", "failed: …". */
  state: string;
  failed: boolean;
  attachments?: string[];
}

export function renderQueue(
  items: readonly QueueItem[],
  index: number,
  undo: string | null,
  columns: number,
  rows: number
): ListLines {
  const body: string[] = [];
  const bodyItems: (number | null)[] = [];
  let selectedLine = 0;
  if (items.length === 0)
    body.push(
      style.gray(
        "Nothing is queued. Messages you send while the agent works wait here until it reads them."
      )
    );
  items.forEach((item, i) => {
    const selected = i === index;
    if (selected) selectedLine = body.length;
    const head = `${selected ? style.cyan("❯ ") : "  "}${item.failed ? style.red(item.state) : style.gray(item.state)}`;
    body.push(head);
    for (const line of wrap(item.text, columns - 4))
      body.push(`    ${selected ? line : style.gray(line)}`);
    for (const file of item.attachments ?? [])
      for (const line of wrap(file, columns - 4)) body.push(`    ${style.gray(line)}`);
    while (bodyItems.length < body.length) bodyItems.push(i);
  });
  if (undo) body.push("", style.yellow(undo));
  while (bodyItems.length < body.length) bodyItems.push(null);
  const start = Math.max(0, Math.min(selectedLine, body.length - Math.max(1, rows - 3)));
  return {
    lines: frame(
      `Queued messages (${items.length})`,
      body.slice(start),
      "↑↓ choose · Enter inspect · e edit · c cancel opening & compose · d discard · r retry · u undo · Esc",
      columns,
      rows
    ),
    items: framedItems(bodyItems.slice(start), rows),
  };
}

export function renderSignIn(
  state: SignInState,
  columns: number,
  linkify: (url: string, text: string) => string,
  approvalsKey = "Ctrl-B a"
): string[] {
  if (state.phase === "idle") return [];
  const out: string[] = [];
  const title = (text: string, tone: "cyan" | "green" | "red" | "yellow") =>
    out.push(paint(`⚿ ${text}`, "bold", tone));
  switch (state.phase) {
    case "starting":
      title(`Connecting ${state.label}${symbols.ellipsis}`, "cyan");
      out.push(style.gray("  Asking the server to start the sign-in. Esc cancels."));
      break;
    case "protected-input":
      title(`Connect ${state.label}`, "cyan");
      out.push(
        ...indentWrap(
          `Open the trusted approvals overlay (${approvalsKey}) to enter the API key. The key never goes through chat. Esc cancels.`,
          columns,
          "  "
        )
      );
      break;
    case "waiting":
      title(`Sign in to ${state.label}`, "cyan");
      out.push("  1. Open this link (your terminal opens it on your computer):");
      // The URL is one OSC 8 link per wrapped line, so it stays clickable and copyable.
      for (const piece of chunk(state.url, Math.max(10, columns - 5)))
        out.push(`     ${linkify(state.url, style.underline(style.blue(piece)))}`);
      if (state.callbackOrigin) {
        out.push(
          ...indentWrap(
            `2. After you approve, your browser goes to an address starting with ${state.callbackOrigin} that may not load. Copy that whole address and paste it here.`,
            columns,
            "  ",
            "     "
          )
        );
        if (state.pasteError)
          out.push(
            ...indentWrap(state.pasteError, columns, style.red(`  ${symbols.cross} `), "    ").map(
              (l) => style.red(l)
            )
          );
        out.push(
          style.gray(
            "  Paste the address (it is sent when you paste) · y copies the link · Esc cancels"
          )
        );
      } else {
        out.push(
          style.gray(
            "  The connection completes by itself when you finish in the browser. y copies the link · Esc cancels"
          )
        );
      }
      break;
    case "completing":
      title(`Finishing ${state.label} sign-in${symbols.ellipsis}`, "cyan");
      break;
    case "done":
      title(`${state.label} is connected`, "green");
      out.push(
        style.gray(
          "  Models from this provider are now available: /model to choose one. Any key closes this."
        )
      );
      break;
    case "error":
      title(state.title, "red");
      out.push(...indentWrap(state.message, columns, "  "));
      out.push(style.gray("  Any key closes this."));
      break;
  }
  return out;
}

function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}

/** Menu of completions under the composer. */
export function renderMenu(
  items: ReadonlyArray<{ label: string; detail?: string }>,
  index: number,
  columns: number,
  maxRows: number
): ListLines {
  if (items.length === 0) return { lines: [], items: [] };
  const rows = Math.min(maxRows, items.length);
  const start = Math.max(0, Math.min(index - Math.floor(rows / 2), items.length - rows));
  const labelWidth = Math.min(32, Math.max(...items.map((item) => width(item.label))) + 2);
  const out: string[] = [];
  for (let i = start; i < start + rows; i++) {
    const item = items[i]!;
    const selected = i === index;
    const label = item.label + " ".repeat(Math.max(0, labelWidth - width(item.label)));
    const line = `${selected ? style.cyan("❯ ") : "  "}${selected ? style.bold(label) : label}${item.detail ? style.gray(item.detail) : ""}`;
    out.push(truncate(line, columns));
  }
  return { lines: out, items: out.map((_, i) => start + i) };
}
