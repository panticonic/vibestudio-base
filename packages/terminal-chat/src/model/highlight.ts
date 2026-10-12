/**
 * Syntax highlighting for fenced code blocks: highlight.js (pure JS, runs in
 * workerd) tokenises, and its HTML class spans are mapped onto the standard
 * ANSI colours. Unknown languages render plain rather than guessed.
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { style, type StyleName } from "./ansi.js";

const LANGUAGES = {
  bash,
  css,
  diff,
  go,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
} as const;

for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);
hljs.registerAliases(["sh", "shell", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["ts", "tsx", "mts", "cts"], { languageName: "typescript" });
hljs.registerAliases(["js", "jsx", "mjs", "cjs"], { languageName: "javascript" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["rs"], { languageName: "rust" });
hljs.registerAliases(["md"], { languageName: "markdown" });
hljs.registerAliases(["patch"], { languageName: "diff" });

/** highlight.js scope → ANSI style. Scopes not listed inherit their parent's style. */
const SCOPE_STYLES: Record<string, StyleName[]> = {
  keyword: ["magenta"],
  built_in: ["cyan"],
  type: ["cyan"],
  literal: ["blue"],
  number: ["blue"],
  string: ["green"],
  regexp: ["red"],
  symbol: ["blue"],
  comment: ["gray", "italic"],
  doc: ["gray", "italic"],
  meta: ["gray"],
  title: ["yellow"],
  "title.function": ["yellow"],
  "title.class": ["yellow", "bold"],
  attr: ["cyan"],
  attribute: ["cyan"],
  name: ["magenta"],
  tag: ["magenta"],
  variable: ["red"],
  "template-variable": ["red"],
  params: [],
  section: ["bold", "yellow"],
  bullet: ["yellow"],
  emphasis: ["italic"],
  strong: ["bold"],
  addition: ["green"],
  deletion: ["red"],
  selector: ["magenta"],
  property: ["cyan"],
};

export function isKnownLanguage(language: string | null | undefined): boolean {
  return !!language && !!hljs.getLanguage(language);
}

/**
 * Highlight `code` and return one ANSI string per source line. Each styled
 * run is opened and closed within its line, so lines can be sliced and
 * scrolled independently.
 */
export function highlightLines(code: string, language: string | null | undefined): string[] {
  if (!language || !hljs.getLanguage(language)) return code.split("\n");
  let html: string;
  try {
    html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return code.split("\n");
  }
  return htmlToAnsiLines(html);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#x27": "'",
  "#39": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x27|#39|amp|lt|gt|quot);/g, (_, name: string) => ENTITIES[name] ?? "");
}

function scopeStyles(className: string): StyleName[] | null {
  // `hljs-title function_` → "title.function"; `hljs-keyword` → "keyword".
  const parts = className
    .split(/\s+/)
    .map((part) => part.replace(/^hljs-/, "").replace(/_+$/, ""))
    .filter(Boolean);
  const joined = parts.join(".");
  return SCOPE_STYLES[joined] ?? SCOPE_STYLES[parts[0] ?? ""] ?? null;
}

/** Convert highlight.js span markup to per-line ANSI. Exported for tests. */
export function htmlToAnsiLines(html: string): string[] {
  const lines: string[] = [""];
  const stack: StyleName[][] = [];
  const current = (): StyleName[] => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.length > 0) return stack[i]!;
    return [];
  };
  const emit = (text: string) => {
    const styles = current();
    const pieces = text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) lines.push("");
      if (!piece) return;
      let styled = piece;
      for (const name of styles) styled = style[name](styled);
      lines[lines.length - 1] += styled;
    });
  };
  const tag = /<span class="([^"]*)">|<\/span>/g;
  let last = 0;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    if (match.index > last) emit(decodeEntities(html.slice(last, match.index)));
    if (match[1] !== undefined) stack.push(scopeStyles(match[1]) ?? []);
    else stack.pop();
    last = tag.lastIndex;
  }
  if (last < html.length) emit(decodeEntities(html.slice(last)));
  return lines;
}
