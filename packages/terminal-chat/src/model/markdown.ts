/**
 * Markdown → ANSI lines.
 *
 * Parsing is the shared compact-surface engine (`parseMarkdown` from
 * `@workspace/quickfire-core`: micromark + GFM, the same grammar as the chat
 * panel), so the terminal and the panel cannot disagree about what a reply
 * says. This module only lays the resulting tree out for a given width.
 */
import {
  inlineToPlainText,
  parseMarkdown,
  type MarkdownAlign,
  type MarkdownBlock,
  type MarkdownInline,
} from "@workspace/quickfire-core";
import { paint, sanitize, style, symbols, width, wrap } from "./ansi.js";
import { highlightLines } from "./highlight.js";

export function renderMarkdown(source: string, columns: number): string[] {
  return renderBlocks(parseMarkdown(sanitize(source)), Math.max(10, columns));
}

export function renderBlocks(blocks: readonly MarkdownBlock[], columns: number): string[] {
  const out: string[] = [];
  blocks.forEach((block, index) => {
    if (index > 0 && needsGap(blocks[index - 1]!, block)) out.push("");
    out.push(...renderBlock(block, columns));
  });
  return out;
}

function needsGap(previous: MarkdownBlock, next: MarkdownBlock): boolean {
  // Headings sit directly on their content; everything else gets one blank line.
  return !(previous.kind === "heading" && next.kind !== "heading");
}

function renderBlock(block: MarkdownBlock, columns: number): string[] {
  switch (block.kind) {
    case "paragraph":
      return wrap(renderInline(block.children), columns);
    case "heading": {
      const text = renderInline(block.children);
      if (block.level === 1) return wrap(paint(text, "bold", "underline"), columns);
      if (block.level === 2) return wrap(paint(text, "bold"), columns);
      return wrap(paint(text, "bold", "dim"), columns);
    }
    case "quote":
      return renderBlocks(block.children, columns - 2).map(
        (line) => `${style.gray("│")} ${style.italic(line)}`
      );
    case "list":
      return renderList(block, columns);
    case "code":
      return renderCode(block.text, block.language, columns);
    case "embed":
      return renderCode(block.text, block.label.toLowerCase(), columns, block.label);
    case "table":
      return renderTable(block.head, block.rows, block.align, columns);
    case "rule":
      return [style.gray(symbols.rule.repeat(Math.min(columns, 40)))];
  }
}

function renderList(block: Extract<MarkdownBlock, { kind: "list" }>, columns: number): string[] {
  const out: string[] = [];
  const markers = block.items.map((_, index) =>
    block.ordered ? `${block.start + index}.` : symbols.bullet
  );
  const markerWidth = Math.max(...markers.map((m) => width(m))) + 1;
  block.items.forEach((item, index) => {
    if (index > 0 && !block.tight) out.push("");
    const box = item.checked === undefined ? "" : item.checked ? "[x] " : "[ ] ";
    const raw = markers[index]!;
    const marker = (block.ordered ? raw : style.cyan(raw)) + " ".repeat(markerWidth - width(raw));
    const pad = " ".repeat(markerWidth);
    const body = renderBlocks(item.children, columns - markerWidth);
    if (body.length === 0) body.push("");
    body[0] = box + body[0];
    body.forEach((line, lineIndex) => out.push((lineIndex === 0 ? marker : pad) + line));
  });
  return out;
}

function renderCode(
  text: string,
  language: string | null,
  columns: number,
  label?: string
): string[] {
  const header = label ?? language ?? "";
  const lines = highlightLines(text.replace(/\n$/, ""), language);
  const gutter = style.gray("│ ");
  const out: string[] = [style.gray(`╭─${header ? ` ${header} ` : ""}`)];
  for (const line of lines) {
    for (const piece of wrap(line, columns - 2)) out.push(gutter + piece);
  }
  out.push(style.gray("╰─"));
  return out;
}

export function renderInline(nodes: readonly MarkdownInline[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.text;
        break;
      case "code":
        out += style.cyan(node.text);
        break;
      case "strong":
        out += style.bold(renderInline(node.children));
        break;
      case "emphasis":
        out += style.italic(renderInline(node.children));
        break;
      case "strike":
        out += style.strike(renderInline(node.children));
        break;
      case "link": {
        const label = renderInline(node.children);
        const plain = inlineToPlainText(node.children);
        out += style.underline(style.blue(label));
        if (plain !== node.href) out += style.gray(` (${node.href})`);
        break;
      }
      case "image":
        out += style.magenta(`[image${node.alt ? `: ${node.alt}` : ""}]`);
        break;
      case "break":
        out += "\n";
        break;
    }
  }
  return out;
}

function renderTable(
  head: MarkdownInline[][],
  rows: MarkdownInline[][][],
  align: MarkdownAlign[],
  columns: number
): string[] {
  const cells = [head, ...rows].map((row) => row.map((cell) => renderInline(cell)));
  const count = Math.max(...cells.map((row) => row.length));
  const widths = Array.from({ length: count }, (_, column) =>
    Math.max(1, ...cells.map((row) => width(row[column] ?? "")))
  );
  const total = widths.reduce((sum, w) => sum + w, 0) + (count - 1) * 3;
  if (total > columns) {
    // Too wide for a grid: one record per row, "Header: value".
    const headers = head.map((cell) => inlineToPlainText(cell));
    const out: string[] = [];
    rows.forEach((row, index) => {
      if (index > 0) out.push(style.gray(symbols.rule.repeat(Math.min(columns, 20))));
      row.forEach((_, column) => {
        const key = style.bold(`${headers[column] ?? `#${column + 1}`}: `);
        out.push(...wrap(key + (cells[index + 1]![column] ?? ""), columns));
      });
    });
    return out;
  }
  const line = (row: string[]) =>
    widths
      .map((w, column) => alignCell(row[column] ?? "", w, align[column] ?? null))
      .join(style.gray(" │ "));
  const separator = style.gray(widths.map((w) => "─".repeat(w)).join("─┼─"));
  return [style.bold(line(cells[0]!)), separator, ...cells.slice(1).map(line)];
}

function alignCell(text: string, cellWidth: number, align: MarkdownAlign): string {
  const gap = Math.max(0, cellWidth - width(text));
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return " ".repeat(left) + text + " ".repeat(gap - left);
  }
  return text + " ".repeat(gap);
}
