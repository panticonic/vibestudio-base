/**
 * Whether a message is MDX (rendered with components) or plain Markdown: the
 * one rule every chat surface applies, so a message is a card in the browser
 * exactly when it is a card in the terminal.
 *
 * MDX when a capitalized tag names a registered component (so an unclosed
 * `<Callout>` still compiles, fails, and is reported) or is shaped like an
 * element: self-closing (`<Slider ... />`) or closed (`</Slider>`), so an
 * unknown component is reported too. Prose generics such as `Array<T>` or
 * `Map<K, V>` are neither and render as Markdown without a spurious failure
 * report. Props may span lines and contain `=>`, so the opening tag and its
 * terminator are matched separately.
 */
const JSX_OPENING_RE = /<([A-Z][\w.]*)(?=[\s/>])/g;

// A message that defines its own components (`import { useState } from
// "react"`, `export function Stepper() {…}`) is an MDX module. Only statements
// outside fenced code count: an `import` line inside a ```ts snippet is prose.
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const ESM_STATEMENT_RE =
  /^(?:import\s*(?:["']|[\w$*{][^\n]*?\bfrom\s*["'])|export\s+(?:default\b|const\b|let\b|var\b|function\b|async\s+function\b|class\b|\{|\*))/;

function containsEsmStatement(content: string): boolean {
  let fence: string | null = null;
  for (const line of content.split("\n")) {
    const opener = FENCE_RE.exec(line)?.[1];
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = null;
    } else if (opener) {
      fence = opener;
    } else if (ESM_STATEMENT_RE.test(line)) {
      return true;
    }
  }
  return false;
}

/** `registered`: the component names a surface's MDX may use without importing them. */
export function isMdxMessage(content: string, registered: ReadonlySet<string>): boolean {
  for (const match of content.matchAll(JSX_OPENING_RE)) {
    const name = match[1]!;
    if (registered.has(name.split(".")[0]!)) return true;
    const rest = content.slice(match.index + match[0].length);
    if (rest.includes("/>") || rest.includes(`</${name}`)) return true;
  }
  return containsEsmStatement(content);
}
