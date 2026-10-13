/**
 * Screen layout: everything the app shows, as exactly `rows - 1` lines plus
 * the composer cursor. Pure, so the whole screen is testable as text.
 *
 * One row stays free: once Ink's output fills the screen it clears the whole
 * terminal on every frame instead of rewriting its own lines.
 */
import type { FeedbackFormArgs } from "@workspace/pubsub";
import { indentWrap, padEnd, paint, style, symbols, truncate } from "../model/ansi.js";
import { layoutComposer, type EditorState } from "../model/composer.js";
import type { Completion } from "../model/commands.js";
import { renderForm, type FormState } from "../model/forms.js";
import type { Mode } from "../model/keymap.js";
import { renderHelp, renderMenu, renderPicker, renderQueue, renderSignIn, type PickerState, type QueueItem } from "../model/overlays.js";
import { statusLine, type StatusInfo } from "../model/status.js";
import { computeWindow, type RowSource, type ScrollState } from "../model/viewport.js";
import type { Notice } from "../runtime/chatRuntime.js";
import type { SignInState } from "../runtime/providerSignIn.js";
import type { PromptSpec } from "./actions.js";

export type ScreenOverlay =
  | { kind: "picker"; picker: PickerState }
  | { kind: "prompt"; prompt: PromptSpec; editor: EditorState }
  | { kind: "help"; scroll: number }
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
  overlay: { overlay: ScreenOverlay; queue: QueueItem[]; undo: string | null } | null;
  form: { state: FormState; args: FeedbackFormArgs } | null;
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
    selectedHint: string | null;
  };
  status: StatusInfo;
  approvalsKey: string;
  linkify: (url: string, text: string) => string;
}

export interface Screen {
  lines: string[];
  cursor: { x: number; y: number } | null;
  /** Rows the transcript got this frame (for paging). */
  transcriptRows: number;
}

const TONES = { info: "cyan", success: "green", warning: "yellow", error: "red" } as const;

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
    const start = Math.max(0, Math.min(rendered.focusLine - Math.floor(room / 2), rendered.lines.length - room));
    const lines = [style.gray(padEnd(`${symbols.rule.repeat(2)} An agent is asking ${symbols.rule.repeat(columns)}`, columns))];
    for (const line of rendered.lines.slice(start, start + room)) lines.push(` ${line}`);
    while (lines.length < total - 1) lines.push("");
    lines.push(status);
    if (rendered.cursor && rendered.cursor.line >= start && rendered.cursor.line < start + room) {
      cursor = { x: rendered.cursor.column + 1, y: rendered.cursor.line - start + 1 };
    }
    return { lines, cursor, transcriptRows: 0 };
  }

  // Bottom area, built upwards.
  const hint =
    model.composer.mode === "select"
      ? `${model.composer.selectedHint ?? ""} · ↑↓ move · y copy · Esc back`
      : model.menu
        ? "↑↓ choose · Tab/Enter accept · Esc close"
        : "Enter send · Alt-Enter newline · / commands · Ctrl-K palette · Ctrl-↑ select · F1 help";
  bottom.unshift(status);
  bottom.unshift(style.gray(truncate(hint, columns)));

  let menuCount = 0;
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
      const start = Math.max(0, Math.min(layout.cursorRow - maxRows + 1, layout.lines.length - maxRows));
      layout.lines.slice(start, start + maxRows).forEach((line, index) => composerLines.push((index === 0 && start === 0 ? prompt : "  ") + line));
      if (model.composer.mode === "compose") cursor = { x: 2 + layout.cursorColumn, y: layout.cursorRow - start };
    }
    if (model.composer.attachments.length) {
      composerLines.push(style.magenta(truncate(`  attached: ${model.composer.attachments.join(", ")} (sent with your next message)`, columns)));
    }
    bottom.unshift(...composerLines);
    bottom.unshift(style.gray(symbols.rule.repeat(columns)));
    if (model.menu) {
      const menu = renderMenu(model.menu.items, model.menu.index, columns, 6);
      menuCount = menu.length;
      bottom.unshift(...menu);
    }
  }

  // Sign-in card (modal for keys, but the transcript stays visible above it).
  const signIn = renderSignIn(model.signIn, columns, model.linkify);

  // Queued messages, notices and banners sit between transcript and composer.
  const middle: string[] = [];
  for (const banner of model.banners.slice(-3)) {
    const text = banner.message ? `${banner.title} — ${banner.message}` : banner.title;
    middle.push(...indentWrap(text, columns, paint(`${symbols.warning} `, TONES[banner.tone]), "  ").slice(0, 2).map((l) => paint(l, TONES[banner.tone])));
  }
  for (const notice of model.notices.slice(-2)) {
    const text = notice.message ? `${notice.title} — ${notice.message}` : notice.title;
    middle.push(...indentWrap(text, columns, paint(notice.tone === "error" ? `${symbols.cross} ` : notice.tone === "success" ? `${symbols.check} ` : "• ", TONES[notice.tone]), "  ").slice(0, 3).map((l) => paint(l, TONES[notice.tone])));
  }
  if (model.outbox.length > 0 && !model.overlay) {
    middle.push(style.gray(`${symbols.rule} queued (${model.outbox.length}) — /queue edits or discards ${symbols.rule}`));
    for (const item of model.outbox.slice(-3)) {
      middle.push(truncate(`  ${item.failed ? style.red(symbols.cross) : style.yellow("◷")} ${item.text.replace(/\s+/g, " ")} ${style.gray(`(${item.state})`)}`, columns));
    }
  }

  const fixed = bottom.length + middle.length + signIn.length;
  const rows = Math.max(1, total - fixed);
  let top: string[];
  let transcriptRows = rows;
  if (model.overlay) {
    const overlay = model.overlay.overlay;
    if (overlay.kind === "picker") top = renderPicker(overlay.picker, columns, rows);
    else if (overlay.kind === "help") top = renderHelp(columns, rows, model.approvalsKey, overlay.scroll).lines;
    else if (overlay.kind === "queue") top = renderQueue(model.overlay.queue, overlay.index, model.overlay.undo, columns, rows);
    else {
      const prompt = overlay.prompt;
      const body: string[] = [paint(prompt.title, "bold"), style.gray(symbols.rule.repeat(columns))];
      if (prompt.hint) body.push(...indentWrap(prompt.hint, columns, "").map((l) => style.gray(l)), "");
      const layout = layoutComposer(overlay.editor.text, overlay.editor.cursor, columns - 2);
      const at = body.length;
      layout.lines.forEach((line) => body.push(`${style.cyan("│")} ${line}`));
      body.push("", style.gray(`Enter ${prompt.submitLabel ?? "save"}${prompt.multiline ? " · Alt-Enter new line" : ""} · Esc cancel`));
      top = body.slice(0, rows);
      cursor = { x: 2 + layout.cursorColumn, y: at + layout.cursorRow };
    }
    while (top.length < rows) top.push("");
    transcriptRows = 0;
  } else {
    top = transcriptLines(model, rows, columns);
  }

  const lines = [...top.slice(0, rows), ...signIn, ...middle, ...bottom];
  if (cursor && !model.overlay) {
    // Composer cursor: y is relative to the composer's first line, which
    // follows the transcript, sign-in card, middle area, menu and separator.
    cursor = { x: cursor.x, y: rows + signIn.length + middle.length + menuCount + 1 + cursor.y };
  }
  if (model.signIn.phase !== "idle" && !model.overlay) cursor = null;
  // On a very small terminal the bottom area wins; the transcript is cut first.
  const overflow = Math.max(0, lines.length - total);
  if (cursor && overflow) cursor = cursor.y - overflow >= 0 ? { x: cursor.x, y: cursor.y - overflow } : null;
  return { lines: lines.slice(overflow), cursor, transcriptRows };
}

function transcriptLines(model: ScreenModel, rows: number, columns: number): string[] {
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
    return out.slice(0, rows);
  }
  const header: string[] = [];
  const window = computeWindow(source, rows, model.transcript.scroll);
  if (window.atTop) {
    if (model.transcript.historyError) header.push(style.red(truncate(`${symbols.cross} Older messages didn't load: ${model.transcript.historyError}. Scroll up to retry.`, columns)));
    else if (model.transcript.loadingOlder) header.push(style.gray(`${symbols.ellipsis} loading older messages`));
    else if (model.transcript.hasMore) header.push(style.gray("↑ older messages — scroll up (PgUp) to load them"));
    else if (model.transcript.replaySettled) header.push(style.gray("↑ start of conversation"));
  }
  const body = header.length ? computeWindow(source, rows - header.length, model.transcript.scroll) : window;
  const out = [...header];
  for (const line of body.lines) {
    const selected = line.rowIndex === model.transcript.selectedIndex;
    out.push((selected ? style.cyan("▌ ") : "  ") + line.text);
  }
  // Short transcripts sit at the bottom, next to the composer.
  while (out.length < rows) out.splice(header.length, 0, "");
  return out.slice(0, rows);
}
