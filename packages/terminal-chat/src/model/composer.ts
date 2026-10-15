/**
 * The composer's editing state machine. Pure: every operation maps an
 * `EditorState` to the next one. The draft text itself is the chat store's
 * (`session.input`), so a draft the store restores after a rejected send
 * shows up here; this module owns the cursor and history navigation.
 */
import { width } from "./ansi.js";

export interface EditorState {
  text: string;
  /** Cursor as a code-unit offset into `text`. */
  cursor: number;
  /** Index into `history` while browsing it (0 = most recent); null when editing. */
  historyIndex: number | null;
  /** The draft that was being edited before history browsing began. */
  stash: string | null;
}

export const emptyEditor: EditorState = {
  text: "",
  cursor: 0,
  historyIndex: null,
  stash: null,
};

export function editorFor(text: string, previous?: EditorState): EditorState {
  if (previous && previous.text === text) return previous;
  return {
    text,
    cursor: previous ? Math.min(previous.cursor, text.length) : text.length,
    historyIndex: null,
    stash: null,
  };
}

export type EditCommand =
  | { kind: "insert"; text: string }
  | { kind: "newline" }
  | { kind: "backspace" }
  | { kind: "delete" }
  | { kind: "left" }
  | { kind: "right" }
  | { kind: "word-left" }
  | { kind: "word-right" }
  | { kind: "line-start" }
  | { kind: "line-end" }
  | { kind: "delete-word-back" }
  | { kind: "delete-word-forward" }
  | { kind: "kill-line-back" }
  | { kind: "kill-line-forward" }
  | { kind: "up"; history: readonly string[] }
  | { kind: "down"; history: readonly string[] }
  | { kind: "clear" };

/** Whether the cursor is on the first / last line, where Up/Down browse history. */
export function cursorLine(state: EditorState): {
  line: number;
  lines: number;
  column: number;
} {
  const before = state.text.slice(0, state.cursor);
  const line = before.split("\n").length - 1;
  const column = state.cursor - (before.lastIndexOf("\n") + 1);
  return { line, lines: state.text.split("\n").length, column };
}

const isWordChar = (char: string | undefined) => !!char && /[\p{L}\p{N}_]/u.test(char);

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function wordLeft(text: string, cursor: number): number {
  let index = cursor;
  while (index > 0 && !isWordChar(text.slice(prevIndex(text, index), index)))
    index = prevIndex(text, index);
  while (index > 0 && isWordChar(text.slice(prevIndex(text, index), index)))
    index = prevIndex(text, index);
  return index;
}

function wordRight(text: string, cursor: number): number {
  let index = cursor;
  while (index < text.length && !isWordChar(text.slice(index, nextIndex(text, index))))
    index = nextIndex(text, index);
  while (index < text.length && isWordChar(text.slice(index, nextIndex(text, index))))
    index = nextIndex(text, index);
  return index;
}

/** Cursor movement and deletion use whole displayed graphemes, including ZWJ emoji. */
function prevIndex(text: string, cursor: number): number {
  let previous = 0;
  for (const part of graphemes.segment(text)) {
    if (part.index >= cursor) break;
    previous = part.index;
  }
  return previous;
}

function nextIndex(text: string, cursor: number): number {
  for (const part of graphemes.segment(text)) {
    const end = part.index + part.segment.length;
    if (end > cursor) return end;
  }
  return text.length;
}

function splice(state: EditorState, from: number, to: number, insert = ""): EditorState {
  const text = state.text.slice(0, from) + insert + state.text.slice(to);
  return {
    text,
    cursor: from + insert.length,
    historyIndex: null,
    stash: null,
  };
}

function moveTo(state: EditorState, cursor: number): EditorState {
  return { ...state, cursor: Math.max(0, Math.min(state.text.length, cursor)) };
}

function lineBounds(text: string, cursor: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", cursor - 1) + 1;
  const newline = text.indexOf("\n", cursor);
  return { start, end: newline === -1 ? text.length : newline };
}

function verticalMove(state: EditorState, direction: -1 | 1): EditorState | null {
  const { line, lines, column } = cursorLine(state);
  const target = line + direction;
  if (target < 0 || target >= lines) return null;
  const all = state.text.split("\n");
  let offset = 0;
  for (let i = 0; i < target; i++) offset += all[i]!.length + 1;
  const desiredCells = width(all[line]!.slice(0, column));
  let targetOffset = 0;
  let cells = 0;
  for (const part of graphemes.segment(all[target]!)) {
    const nextCells = cells + width(part.segment);
    if (nextCells > desiredCells) break;
    cells = nextCells;
    targetOffset = part.index + part.segment.length;
  }
  return moveTo(state, offset + targetOffset);
}

function browseHistory(
  state: EditorState,
  history: readonly string[],
  direction: -1 | 1
): EditorState {
  // direction -1 = older (Up), +1 = newer (Down).
  if (direction === -1) {
    const next = state.historyIndex === null ? 0 : state.historyIndex + 1;
    if (next >= history.length) return state;
    const text = history[next]!;
    return {
      text,
      cursor: text.length,
      historyIndex: next,
      stash: state.historyIndex === null ? state.text : state.stash,
    };
  }
  if (state.historyIndex === null) return state;
  if (state.historyIndex === 0) {
    const text = state.stash ?? "";
    return { text, cursor: text.length, historyIndex: null, stash: null };
  }
  const text = history[state.historyIndex - 1]!;
  return {
    ...state,
    text,
    cursor: text.length,
    historyIndex: state.historyIndex - 1,
  };
}

export function applyEdit(state: EditorState, command: EditCommand): EditorState {
  const { text, cursor } = state;
  switch (command.kind) {
    case "insert":
      return splice(state, cursor, cursor, command.text.replace(/\r\n?/g, "\n"));
    case "newline":
      return splice(state, cursor, cursor, "\n");
    case "backspace":
      return cursor === 0 ? state : splice(state, prevIndex(text, cursor), cursor);
    case "delete":
      return cursor >= text.length ? state : splice(state, cursor, nextIndex(text, cursor));
    case "left":
      return moveTo(state, prevIndex(text, cursor));
    case "right":
      return moveTo(state, nextIndex(text, cursor));
    case "word-left":
      return moveTo(state, wordLeft(text, cursor));
    case "word-right":
      return moveTo(state, wordRight(text, cursor));
    case "line-start":
      return moveTo(state, lineBounds(text, cursor).start);
    case "line-end":
      return moveTo(state, lineBounds(text, cursor).end);
    case "delete-word-back":
      return splice(state, wordLeft(text, cursor), cursor);
    case "delete-word-forward":
      return splice(state, cursor, wordRight(text, cursor));
    case "kill-line-back": {
      const { start } = lineBounds(text, cursor);
      return splice(state, start === cursor && cursor > 0 ? cursor - 1 : start, cursor);
    }
    case "kill-line-forward": {
      const { end } = lineBounds(text, cursor);
      return splice(state, cursor, end === cursor && cursor < text.length ? cursor + 1 : end);
    }
    case "up":
      return verticalMove(state, -1) ?? browseHistory(state, command.history, -1);
    case "down":
      return verticalMove(state, 1) ?? browseHistory(state, command.history, 1);
    case "clear":
      return emptyEditor;
  }
}

export interface ComposerLayout {
  lines: string[];
  /** Cursor row/column within `lines` (cells). */
  cursorRow: number;
  cursorColumn: number;
}

/**
 * Soft-wrap the draft to `columns` cells and locate the cursor. Wrapping is
 * by cell width (CJK and emoji take two), breaking long words hard.
 */
export function layoutComposer(text: string, cursor: number, columns: number): ComposerLayout {
  const cols = Math.max(2, columns);
  const lines: string[] = [];
  let cursorRow = 0;
  let cursorColumn = 0;
  let offset = 0;
  for (const logical of text.split("\n")) {
    let row = "";
    let rowWidth = 0;
    const chars = Array.from(graphemes.segment(logical), (part) => part.segment);
    let index = offset;
    if (cursor === index) {
      cursorRow = lines.length;
      cursorColumn = 0;
    }
    for (const char of chars) {
      const w = width(char);
      if (rowWidth + w > cols - 1) {
        lines.push(row);
        row = "";
        rowWidth = 0;
        if (cursor === index) {
          cursorRow = lines.length;
          cursorColumn = 0;
        }
      }
      row += char;
      rowWidth += w;
      index += char.length;
      if (cursor === index) {
        cursorRow = lines.length;
        cursorColumn = rowWidth;
      }
    }
    lines.push(row);
    offset = index + 1;
  }
  return { lines, cursorRow, cursorColumn };
}

/** The `@mention` token being typed at the cursor, if any. */
export function mentionAt(state: EditorState): { start: number; query: string } | null {
  const before = state.text.slice(0, state.cursor);
  const match = /(^|\s)@([\w.-]*)$/u.exec(before);
  if (!match) return null;
  return { start: state.cursor - match[2]!.length - 1, query: match[2]! };
}

/** Replace the `@query` at the cursor with `@handle `. */
export function completeMention(state: EditorState, handle: string): EditorState {
  const mention = mentionAt(state);
  if (!mention) return state;
  return splice(state, mention.start, state.cursor, `@${handle} `);
}

/** Handles mentioned in a draft, in order of first appearance. */
export function mentionedHandles(text: string, known: readonly string[]): string[] {
  const set = new Set(known);
  const found: string[] = [];
  for (const match of text.matchAll(/(^|\s)@([\w.-]+)/gu)) {
    const handle = match[2]!;
    if (set.has(handle) && !found.includes(handle)) found.push(handle);
  }
  return found;
}
