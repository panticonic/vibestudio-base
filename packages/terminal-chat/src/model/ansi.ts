/**
 * ANSI styling and layout primitives for the terminal chat.
 *
 * Only the 16 standard colours, bold, dim, italic, underline, strikethrough
 * and inverse are used: they follow the person's terminal theme, so the app
 * stays readable on dark and light backgrounds alike. Nothing here paints a
 * background colour except `inverse`, which swaps the theme's own pair.
 */
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import sliceAnsi from "slice-ansi";

const ESC = "\x1b[";

type Style = (text: string) => string;

const sgr =
  (open: number, close: number): Style =>
  (text) =>
    text.length === 0 ? text : `${ESC}${open}m${text}${ESC}${close}m`;

export const style = {
  bold: sgr(1, 22),
  dim: sgr(2, 22),
  italic: sgr(3, 23),
  underline: sgr(4, 24),
  inverse: sgr(7, 27),
  strike: sgr(9, 29),
  red: sgr(31, 39),
  green: sgr(32, 39),
  yellow: sgr(33, 39),
  blue: sgr(34, 39),
  magenta: sgr(35, 39),
  cyan: sgr(36, 39),
  gray: sgr(90, 39),
} as const;

export type StyleName = keyof typeof style;

export function paint(text: string, ...names: Array<StyleName | false | undefined>): string {
  let out = text;
  for (const name of names) if (name) out = style[name](out);
  return out;
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/** Display width in terminal cells (wide CJK/emoji count 2, ANSI counts 0). */
export function width(text: string): number {
  return stringWidth(text);
}

/**
 * Remove control characters that would let message content move the cursor
 * or change modes. Tabs become spaces; everything else non-printable goes.
 */
export function sanitize(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "  ")
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b./g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
  );
}

/** Hard-wrap styled text to `columns`, keeping styles open across breaks. */
export function wrap(text: string, columns: number): string[] {
  const cols = Math.max(1, columns);
  return wrapAnsi(text, cols, { hard: true, trim: false, wordWrap: true }).split("\n");
}

/** Cut styled text to at most `columns` cells, adding an ellipsis when cut. */
export function truncate(text: string, columns: number): string {
  if (columns <= 0) return "";
  if (width(text) <= columns) return text;
  if (columns === 1) return "…";
  return `${sliceAnsi(text, 0, columns - 1)}${ESC}0m…`;
}

/** Pad styled text with spaces to exactly `columns` cells (truncating if longer). */
export function padEnd(text: string, columns: number): string {
  const cut = truncate(text, columns);
  return cut + " ".repeat(Math.max(0, columns - width(cut)));
}

/** Prefix every line with `first` (first line) / `rest` (following lines), wrapping to fit. */
export function indentWrap(text: string, columns: number, first: string, rest = first): string[] {
  const inner = Math.max(1, columns - Math.max(width(first), width(rest)));
  const out: string[] = [];
  for (const line of text.split("\n")) {
    for (const piece of wrap(line, inner)) out.push((out.length === 0 ? first : rest) + piece);
  }
  return out;
}

export const symbols = {
  user: "›",
  agent: "●",
  bullet: "•",
  collapsed: "▸",
  expanded: "▾",
  cursor: "▌",
  rule: "─",
  check: "✓",
  cross: "✗",
  warning: "!",
  ellipsis: "…",
} as const;
