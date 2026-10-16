/**
 * Screen layout: everything the app shows, as exactly `rows - 1` lines plus
 * the composer cursor. Pure, so the whole screen is testable as text.
 *
 * One row stays free: once Ink's output fills the screen it clears the whole
 * terminal on every frame instead of rewriting its own lines.
 */
import type { FeedbackFormArgs } from "@workspace/pubsub";
import { indentWrap, padEnd, paint, style, symbols, truncate, width } from "../model/ansi.js";
import { layoutComposer, type EditorState } from "../model/composer.js";
import type { CommandName, Completion } from "../model/commands.js";
import { key, type KeyEvent } from "../model/keys.js";
import { renderForm, type FormHit, type FormState } from "../model/forms.js";
import type { Mode } from "../model/keymap.js";
import {
  renderHelp,
  renderMenu,
  renderPicker,
  renderQueue,
  renderSignIn,
  type PickerState,
  type QueueItem,
} from "../model/overlays.js";
import { statusLine, type StatusInfo } from "../model/status.js";
import { computeWindow, type RowSource, type ScrollState } from "../model/viewport.js";
import type { Notice } from "../runtime/chatRuntime.js";
import type { SignInState } from "../runtime/providerSignIn.js";
import type { PromptSpec } from "./actions.js";

export type ScreenOverlay =
  | { kind: "picker"; picker: PickerState }
  | { kind: "prompt"; prompt: PromptSpec; editor: EditorState }
  | { kind: "help"; scroll: number }
  | {
      kind: "detail";
      title: string;
      lines: (columns: number) => readonly string[];
      copyText: string;
      scroll: number;
    }
  | { kind: "queue"; index: number };

export interface Banner {
  tone: "info" | "warning" | "error";
  title: string;
  message: string;
}

export interface ScreenModel {
  size: { columns: number; rows: number };
  transcript: {
    source: RowSource;
    scroll: ScrollState;
    selectedIndex: number;
    loadingOlder: boolean;
    replaySettled: boolean;
    hasMore: boolean;
    historyError: string | null;
  };
  empty: { title: string; lines: string[] } | null;
  overlay: {
    overlay: ScreenOverlay;
    queue: QueueItem[];
    undo: string | null;
  } | null;
  form: {
    state: FormState;
    args: FeedbackFormArgs;
    scroll?: number | null;
  } | null;
  signIn: SignInState;
  notices: readonly Notice[];
  banners: Banner[];
  outbox: QueueItem[];
  menu: { items: Completion[]; index: number } | null;
  composer: {
    editor: EditorState;
    attachments: string[];
    placeholder: string;
    mode: Mode;
    /** Actions of the selected message, as its keys and labels. */
    selectedActions: ReadonlyArray<{ key: string; label: string }> | null;
  };
  status: StatusInfo;
  approvalsKey: string;
  linkify: (url: string, text: string) => string;
}

/** What a click on a span does: exactly what its key, command or pick does. */
export type ScreenTarget =
  | { kind: "key"; key: KeyEvent }
  | { kind: "command"; name: CommandName }
  /** A transcript row, by its index in the transcript. */
  | { kind: "row"; index: number }
  /** An item of the open picker or queue, as listed. */
  | { kind: "item"; index: number }
  /** A completion of the inline command or mention menu. */
  | { kind: "completion"; index: number }
  /** Back to the newest message, following new ones again. */
  | { kind: "latest" }
  /** A field, option or button of the agent's question. */
  | { kind: "form"; hit: FormHit }
  | { kind: "composer" };

/** A clickable span of one screen line, columns `x0` (inclusive) to `x1` (exclusive). */
export interface Hit {
  y: number;
  x0: number;
  x1: number;
  target: ScreenTarget;
}

export interface Screen {
  lines: string[];
  /** What is clickable where, from the same layout that drew the lines. */
  hits: Hit[];
  cursor: { x: number; y: number } | null;
  /** Rows the transcript got this frame (for paging). */
  transcriptRows: number;
  overlayRows: number;
}

const TONES = {
  info: "cyan",
  success: "green",
  warning: "yellow",
  error: "red",
} as const;

export function layoutScreen(model: ScreenModel): Screen {
  const columns = Math.max(20, model.size.columns);
  const total = Math.max(6, model.size.rows - 1);
  const bottom: string[] = [];
  let cursor: Screen["cursor"] = null;

  // Status line, always last.
  const status = statusLine(model.status, columns);

  // A pending form owns everything above the status line.
  if (model.form) {
    const rendered = renderForm(model.form.state, model.form.args, columns - 2);
    const room = total - 2;
    const start = Math.max(
      0,
      Math.min(
        model.form.scroll ?? rendered.focusLine - Math.floor(room / 2),
        rendered.lines.length - room
      )
    );
    const lines = [
      style.gray(
        padEnd(
          `${symbols.rule.repeat(2)} An agent is asking ${symbols.rule.repeat(columns)}`,
          columns
        )
      ),
    ];
    for (const line of rendered.lines.slice(start, start + room)) lines.push(` ${line}`);
    while (lines.length < total - 1) lines.push("");
    lines.push(status);
    // Rendered form line `n` is screen line 1 + n - start, one column in.
    const hits: Hit[] = rendered.hits
      .filter((hit) => hit.line >= start && hit.line < start + room)
      .map((hit) => ({
        y: 1 + hit.line - start,
        x0: hit.x0 + 1,
        x1: Math.min(columns, hit.x1 + 1),
        target: { kind: "form", hit },
      }));
    if (rendered.cursor && rendered.cursor.line >= start && rendered.cursor.line < start + room) {
      cursor = {
        x: rendered.cursor.column + 1,
        y: rendered.cursor.line - start + 1,
      };
    }
    return { lines, hits, cursor, transcriptRows: 0, overlayRows: 0 };
  }

  // Bottom area, built upwards. Every hint is also a button for its key.
  const hint = hintLine(hintSegments(model), columns);
  bottom.unshift(status);
  bottom.unshift(hint.text);

  let menuCount = 0;
  let menuItems: number[] = [];
  const composerLines: string[] = [];
  if (!model.overlay && model.signIn.phase === "idle") {
    const prompt = model.composer.mode === "select" ? style.gray("› ") : style.cyan("› ");
    const width = columns - 2;
    const maxRows = Math.max(1, Math.min(8, Math.floor(total / 3)));
    const editor = model.composer.editor;
    if (!editor.text) {
      composerLines.push(prompt + style.gray(truncate(model.composer.placeholder, width)));
      if (model.composer.mode === "compose") cursor = { x: 2, y: 0 };
    } else {
      const layout = layoutComposer(editor.text, editor.cursor, width);
      const start = Math.max(
        0,
        Math.min(layout.cursorRow - maxRows + 1, layout.lines.length - maxRows)
      );
      layout.lines
        .slice(start, start + maxRows)
        .forEach((line, index) =>
          composerLines.push((index === 0 && start === 0 ? prompt : "  ") + line)
        );
      if (model.composer.mode === "compose")
        cursor = { x: 2 + layout.cursorColumn, y: layout.cursorRow - start };
    }
    if (model.composer.attachments.length) {
      composerLines.push(
        style.magenta(
          truncate(
            `  attached: ${model.composer.attachments.join(", ")} (sent with your next message)`,
            columns
          )
        )
      );
    }
    bottom.unshift(...composerLines);
    bottom.unshift(style.gray(symbols.rule.repeat(columns)));
    if (model.menu) {
      const menu = renderMenu(model.menu.items, model.menu.index, columns, 6);
      menuCount = menu.lines.length;
      menuItems = menu.items.filter((index): index is number => index !== null);
      bottom.unshift(...menu.lines);
    }
  }

  // Sign-in card (modal for keys, but the transcript stays visible above it).
  const signIn = renderSignIn(model.signIn, columns, model.linkify, model.approvalsKey);

  // Queued messages, notices and banners sit between transcript and composer.
  const middle: string[] = [];
  /** Middle lines (by index) that open the queue. */
  const queueLines: number[] = [];
  for (const banner of model.banners.slice(-3)) {
    const text = banner.message ? `${banner.title} — ${banner.message}` : banner.title;
    middle.push(
      ...indentWrap(text, columns, paint(`${symbols.warning} `, TONES[banner.tone]), "  ")
        .slice(0, 2)
        .map((l) => paint(l, TONES[banner.tone]))
    );
  }
  for (const notice of model.notices.slice(-2)) {
    const text = notice.message ? `${notice.title} — ${notice.message}` : notice.title;
    middle.push(
      ...indentWrap(
        text,
        columns,
        paint(
          notice.tone === "error"
            ? `${symbols.cross} `
            : notice.tone === "success"
              ? `${symbols.check} `
              : "• ",
          TONES[notice.tone]
        ),
        "  "
      )
        .slice(0, 3)
        .map((l) => paint(l, TONES[notice.tone]))
    );
  }
  if (model.outbox.length > 0 && !model.overlay) {
    queueLines.push(middle.length, ...model.outbox.slice(-3).map((_, i) => middle.length + 1 + i));
    middle.push(
      style.gray(
        `${symbols.rule} queued (${model.outbox.length}) — /queue edits or discards ${symbols.rule}`
      )
    );
    for (const item of model.outbox.slice(-3)) {
      middle.push(
        truncate(
          `  ${item.failed ? style.red(symbols.cross) : style.yellow("◷")} ${item.text.replace(/\s+/g, " ")} ${style.gray(`(${item.state})`)}`,
          columns
        )
      );
    }
  }

  const fixed = bottom.length + middle.length + signIn.length;
  const rows = Math.max(1, total - fixed);
  let top: string[];
  /** What each top line shows: a transcript row or a listed item. */
  let topTargets: (ScreenTarget | null)[] = [];
  let transcriptRows = rows;
  const itemTargets = (items: (number | null)[]) =>
    items.map((index): ScreenTarget | null => (index === null ? null : { kind: "item", index }));
  if (model.overlay) {
    const overlay = model.overlay.overlay;
    if (overlay.kind === "picker") {
      const list = renderPicker(overlay.picker, columns, rows);
      top = list.lines;
      topTargets = itemTargets(list.items);
    } else if (overlay.kind === "help")
      top = renderHelp(columns, rows, model.approvalsKey, overlay.scroll).lines;
    else if (overlay.kind === "queue") {
      const list = renderQueue(
        model.overlay.queue,
        overlay.index,
        model.overlay.undo,
        columns,
        rows
      );
      top = list.lines;
      topTargets = itemTargets(list.items);
    } else if (overlay.kind === "detail") {
      const content = overlay.lines(columns);
      const room = Math.max(1, rows - 3);
      const start = Math.max(0, Math.min(overlay.scroll, content.length - room));
      top = [
        style.bold(truncate(overlay.title, columns)),
        style.gray(symbols.rule.repeat(columns)),
        ...content.slice(start, start + room),
      ];
      while (top.length < rows - 1) top.push("");
      top.push(style.gray(truncate("↑↓ PgUp/PgDn scroll · Home/End · y copy · Esc back", columns)));
    } else {
      const prompt = overlay.prompt;
      const body: string[] = [
        paint(prompt.title, "bold"),
        style.gray(symbols.rule.repeat(columns)),
      ];
      if (prompt.hint)
        body.push(...indentWrap(prompt.hint, columns, "").map((l) => style.gray(l)), "");
      const layout = layoutComposer(overlay.editor.text, overlay.editor.cursor, columns - 2);
      const at = body.length;
      layout.lines.forEach((line) => body.push(`${style.cyan("│")} ${line}`));
      body.push(
        "",
        style.gray(
          `Enter ${prompt.submitLabel ?? "save"}${prompt.multiline ? " · Alt-Enter new line" : ""} · Esc cancel`
        )
      );
      const caretLine = at + layout.cursorRow;
      const start = Math.max(0, Math.min(caretLine - rows + 2, body.length - rows));
      top = body.slice(start, start + rows);
      cursor = { x: 2 + layout.cursorColumn, y: caretLine - start };
    }
    while (top.length < rows) top.push("");
    transcriptRows = 0;
  } else {
    const transcript = transcriptLines(model, rows, columns);
    top = transcript.lines;
    topTargets = transcript.rows.map((index) => (index === null ? null : { kind: "row", index }));
    if (transcript.jumpLine !== null) topTargets[transcript.jumpLine] = { kind: "latest" };
  }

  const lines = [...top.slice(0, rows), ...signIn, ...middle, ...bottom];
  const hits: Hit[] = [];
  const whole = (y: number, target: ScreenTarget) => hits.push({ y, x0: 0, x1: columns, target });
  topTargets.slice(0, rows).forEach((target, y) => target && whole(y, target));
  const middleTop = rows + signIn.length;
  for (const line of queueLines) whole(middleTop + line, { kind: "command", name: "queue" });
  // Bottom: menu, rule, composer, hint, status.
  const bottomTop = middleTop + middle.length;
  menuItems.forEach((index, i) => whole(bottomTop + i, { kind: "completion", index }));
  for (let i = 0; i < composerLines.length; i++)
    whole(bottomTop + menuCount + 1 + i, { kind: "composer" });
  const hintY = lines.length - 2;
  for (const span of hint.spans) hits.push({ ...span, y: hintY });
  whole(lines.length - 1, { kind: "key", key: key("f2") });
  if (cursor && !model.overlay) {
    // Composer cursor: y is relative to the composer's first line, which
    // follows the transcript, sign-in card, middle area, menu and separator.
    cursor = {
      x: cursor.x,
      y: rows + signIn.length + middle.length + menuCount + 1 + cursor.y,
    };
  }
  if (model.signIn.phase !== "idle" && !model.overlay) cursor = null;
  // On a very small terminal the bottom area wins; the transcript is cut first.
  const overflow = Math.max(0, lines.length - total);
  if (cursor && overflow)
    cursor = cursor.y - overflow >= 0 ? { x: cursor.x, y: cursor.y - overflow } : null;
  return {
    lines: lines.slice(overflow),
    hits: hits.map((hit) => ({ ...hit, y: hit.y - overflow })).filter((hit) => hit.y >= 0),
    cursor,
    transcriptRows,
    overlayRows: model.overlay ? rows : 0,
  };
}

/** The transcript's lines, and for each the transcript row it shows (null for none). */
function transcriptLines(
  model: ScreenModel,
  rows: number,
  columns: number
): { lines: string[]; rows: (number | null)[]; jumpLine: number | null } {
  const { source } = model.transcript;
  if (source.count === 0) {
    const empty = model.empty;
    const out: string[] = [];
    if (empty) {
      const block = [paint(empty.title, "bold"), "", ...empty.lines.map((l) => style.gray(l))];
      const pad = Math.max(0, Math.floor((rows - block.length) / 2));
      for (let i = 0; i < pad; i++) out.push("");
      for (const line of block) out.push(`  ${truncate(line, columns - 2)}`);
    }
    while (out.length < rows) out.push("");
    return { lines: out.slice(0, rows), rows: out.slice(0, rows).map(() => null), jumpLine: null };
  }
  const header: string[] = [];
  const window = computeWindow(source, rows, model.transcript.scroll);
  if (window.atTop) {
    if (model.transcript.historyError)
      header.push(
        style.red(
          truncate(
            `${symbols.cross} Older messages didn't load: ${model.transcript.historyError}. Scroll up to retry.`,
            columns
          )
        )
      );
    else if (model.transcript.loadingOlder)
      header.push(style.gray(`${symbols.ellipsis} loading older messages`));
    else if (model.transcript.hasMore)
      header.push(style.gray("↑ older messages — scroll up (PgUp) to load them"));
    else if (model.transcript.replaySettled) header.push(style.gray("↑ start of conversation"));
  }
  const body = header.length
    ? computeWindow(source, rows - header.length, model.transcript.scroll)
    : window;
  const out = [...header];
  const shown: (number | null)[] = header.map(() => null);
  for (const line of body.lines) {
    const selected = line.rowIndex === model.transcript.selectedIndex;
    out.push((selected ? style.cyan("▌ ") : "  ") + line.text);
    shown.push(line.rowIndex);
  }
  // Short transcripts sit at the bottom, next to the composer.
  while (out.length < rows) {
    out.splice(header.length, 0, "");
    shown.splice(header.length, 0, null);
  }
  // Scrolled up: the last line becomes the way back to the newest message.
  let jumpLine: number | null = null;
  if (!body.atBottom && rows > 1) {
    const last = body.lines.at(-1)?.rowIndex ?? source.count - 1;
    const newer = source.count - 1 - last;
    const label = newer > 0 ? `${newer} newer message${newer === 1 ? "" : "s"}` : "more below";
    jumpLine = Math.min(rows, out.length) - 1;
    out[jumpLine] = paint(
      padEnd(` ↓ ${label} — click here or press Ctrl-End to jump to the latest`, columns),
      "inverse",
      "cyan"
    );
    shown[jumpLine] = null;
  }
  return { lines: out.slice(0, rows), rows: shown.slice(0, rows), jumpLine };
}

type HintSegment = { text: string; target?: ScreenTarget };

const press = (k: KeyEvent): ScreenTarget => ({ kind: "key", key: k });

function hintSegments(model: ScreenModel): HintSegment[] {
  if (model.composer.mode === "select")
    return [
      ...(model.composer.selectedActions ?? []).map((action) => ({
        text: `${action.key} ${action.label}`,
        target: press(action.key === "Enter" ? key("enter") : key("char", { text: action.key })),
      })),
      { text: "↑↓ move" },
      { text: "y copy", target: press(key("char", { text: "y" })) },
      { text: "Esc back", target: press(key("escape")) },
    ];
  if (model.menu)
    return [
      { text: "↑↓ choose" },
      { text: "Tab/Enter accept", target: press(key("tab")) },
      { text: "Esc close", target: press(key("escape")) },
    ];
  return [
    { text: "Enter send", target: press(key("enter")) },
    { text: "F2 settings", target: press(key("f2")) },
    { text: "/ commands", target: press(key("char", { text: "/" })) },
    { text: "Ctrl-K palette", target: press(key("char", { ctrl: true, text: "k" })) },
    { text: "F1 help", target: press(key("f1")) },
    { text: "Ctrl-D quit", target: { kind: "command", name: "quit" } },
    { text: "Alt-Enter newline", target: press(key("enter", { meta: true })) },
    { text: "Ctrl-↑ select", target: press(key("up", { ctrl: true })) },
  ];
}

/** The hint line as text, and the span of each segment that fits. */
function hintLine(
  segments: readonly HintSegment[],
  columns: number
): { text: string; spans: Omit<Hit, "y">[] } {
  const spans: Omit<Hit, "y">[] = [];
  let x = 0;
  for (const segment of segments) {
    const end = x + width(segment.text);
    if (segment.target && end <= columns) spans.push({ x0: x, x1: end, target: segment.target });
    x = end + 3;
  }
  return {
    text: style.gray(truncate(segments.map((segment) => segment.text).join(" · "), columns)),
    spans,
  };
}
