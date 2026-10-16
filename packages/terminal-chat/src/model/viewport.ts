/**
 * Transcript virtualisation: which lines of which rows are on screen.
 *
 * Only the rows that intersect the viewport are laid out (rows are laid out
 * lazily through `RowSource.lines`). Scrolling is anchored to a row, not to a
 * line count, so new messages arriving below do not move what the person is
 * reading; `follow` sticks to the newest line.
 */

export interface RowSource {
  readonly count: number;
  idAt(index: number): string;
  indexOf(id: string): number;
  lines(index: number): readonly string[];
}

export type ScrollState =
  | { mode: "follow" }
  /** The viewport's first line is line `line` of row `id`. */
  | { mode: "anchored"; id: string; line: number };

export const FOLLOW: ScrollState = { mode: "follow" };

export interface VisibleLine {
  text: string;
  rowIndex: number;
  /** First line of its row (where the selection marker goes). */
  first: boolean;
}

export interface Window {
  lines: VisibleLine[];
  /** The first row is (at least partly) visible: time to page in older history. */
  atTop: boolean;
  /** The last line is visible. */
  atBottom: boolean;
}

/** Normalise a scroll state into a concrete top position. */
function topOf(
  source: RowSource,
  rows: number,
  scroll: ScrollState
): { index: number; line: number } {
  if (source.count === 0) return { index: 0, line: 0 };
  if (scroll.mode === "anchored") {
    const index = source.indexOf(scroll.id);
    if (index >= 0) {
      const length = source.lines(index).length;
      return { index, line: Math.max(0, Math.min(scroll.line, Math.max(0, length - 1))) };
    }
  }
  return bottomTop(source, rows);
}

/** The top position that shows the last `rows` lines. */
function bottomTop(source: RowSource, rows: number): { index: number; line: number } {
  let remaining = rows;
  for (let index = source.count - 1; index >= 0; index--) {
    const length = source.lines(index).length;
    if (length >= remaining) return { index, line: length - remaining };
    remaining -= length;
  }
  return { index: 0, line: 0 };
}

export function computeWindow(source: RowSource, rows: number, scroll: ScrollState): Window {
  const lines: VisibleLine[] = [];
  if (source.count === 0 || rows <= 0) return { lines, atTop: true, atBottom: true };
  const top = topOf(source, rows, scroll);
  let index = top.index;
  let line = top.line;
  while (index < source.count && lines.length < rows) {
    const rowLines = source.lines(index);
    for (; line < rowLines.length && lines.length < rows; line++) {
      lines.push({ text: rowLines[line]!, rowIndex: index, first: line === 0 });
    }
    if (line >= rowLines.length) {
      index++;
      line = 0;
    }
  }
  const atBottom = index >= source.count;
  if (atBottom && lines.length < rows && !(top.index === 0 && top.line === 0)) {
    // Scrolled past the end (rows shrank or content changed): show the bottom.
    return computeWindow(source, rows, FOLLOW);
  }
  return { lines, atTop: top.index === 0 && top.line === 0, atBottom };
}

/** Scroll by `delta` lines (negative = up, towards older rows). */
export function scrollBy(
  source: RowSource,
  rows: number,
  scroll: ScrollState,
  delta: number
): ScrollState {
  if (source.count === 0) return FOLLOW;
  let { index, line } = topOf(source, rows, scroll);
  let remaining = delta;
  while (remaining < 0) {
    if (line > 0) {
      const step = Math.min(line, -remaining);
      line -= step;
      remaining += step;
    } else if (index > 0) {
      index--;
      line = source.lines(index).length;
    } else break;
  }
  while (remaining > 0) {
    const length = source.lines(index).length;
    if (line + remaining < length) {
      line += remaining;
      remaining = 0;
    } else if (index < source.count - 1) {
      remaining -= length - line;
      index++;
      line = 0;
    } else {
      line = Math.max(0, length - 1);
      remaining = 0;
    }
  }
  const next: ScrollState = { mode: "anchored", id: source.idAt(index), line };
  return computeWindow(source, rows, next).atBottom ? FOLLOW : next;
}

/** Scroll the least amount that makes row `index` fully visible (or its top, if taller than the viewport). */
export function revealRow(
  source: RowSource,
  rows: number,
  scroll: ScrollState,
  index: number
): ScrollState {
  if (index < 0 || index >= source.count) return scroll;
  const window = computeWindow(source, rows, scroll);
  const visible = window.lines.filter((l) => l.rowIndex === index);
  const length = source.lines(index).length;
  if (visible.length === Math.min(length, rows) && (visible[0]?.first || length > rows))
    return scroll;
  const firstVisibleRow = window.lines[0]?.rowIndex ?? 0;
  if (index <= firstVisibleRow || length >= rows) {
    const next: ScrollState = { mode: "anchored", id: source.idAt(index), line: 0 };
    return computeWindow(source, rows, next).atBottom ? FOLLOW : next;
  }
  // Below the viewport: put the row's last line on the bottom edge.
  let remaining = rows - length;
  let top = index;
  let line = 0;
  while (remaining > 0 && top > 0) {
    const previous = source.lines(top - 1).length;
    if (previous >= remaining) {
      top -= 1;
      line = previous - remaining;
      remaining = 0;
    } else {
      remaining -= previous;
      top -= 1;
    }
  }
  const next: ScrollState = { mode: "anchored", id: source.idAt(top), line };
  return computeWindow(source, rows, next).atBottom ? FOLLOW : next;
}

/** A `RowSource` over an array, laying rows out on demand. */
export function rowSource<T>(
  items: readonly T[],
  id: (item: T) => string,
  layout: (item: T, index: number) => readonly string[]
): RowSource {
  let ids: Map<string, number> | null = null;
  return {
    count: items.length,
    idAt: (index) => id(items[index]!),
    indexOf: (key) => {
      if (!ids) {
        ids = new Map();
        items.forEach((item, index) => ids!.set(id(item), index));
      }
      return ids.get(key) ?? -1;
    },
    lines: (index) => layout(items[index]!, index),
  };
}
