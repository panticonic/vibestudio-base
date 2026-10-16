/** Icons as glyphs: any `@radix-ui/react-icons` name draws as one character. */
import React from "react";
import { Text } from "ink";

const GLYPHS: [RegExp, string][] = [
  [/^(Check|CheckCircled)/, "✓"],
  [/^(Cross|CrossCircled|Close)/, "✗"],
  [/^Plus/, "+"],
  [/^Minus/, "−"],
  [/^ArrowRight|^ChevronRight|^TriangleRight/, "→"],
  [/^ArrowLeft|^ChevronLeft|^TriangleLeft/, "←"],
  [/^ArrowUp|^ChevronUp|^TriangleUp/, "↑"],
  [/^ArrowDown|^ChevronDown|^TriangleDown/, "↓"],
  [/^(InfoCircled|Info)/, "ⓘ"],
  [/^(ExclamationTriangle|Exclamation)/, "!"],
  [/^Star/, "★"],
  [/^Heart/, "♥"],
  [/^Gear/, "⚙"],
  [/^Clock|^Timer|^Stopwatch/, "◷"],
  [/^Calendar/, "▦"],
  [/^MagnifyingGlass/, "⌕"],
  [/^Reload|^Update/, "↻"],
  [/^Trash/, "␡"],
  [/^Pencil/, "✎"],
  [/^Link|^ExternalLink/, "↗"],
  [/^Lightning/, "ϟ"],
  [/^Rocket/, "↟"],
  [/^Globe/, "◍"],
  [/^Lock/, "⚿"],
];

const cache = new Map<string, () => React.ReactElement>();

export function iconFor(name: string): () => React.ReactElement {
  let icon = cache.get(name);
  if (!icon) {
    const glyph = GLYPHS.find(([pattern]) => pattern.test(name))?.[1] ?? "•";
    icon = function Icon() {
      return <Text>{glyph}</Text>;
    };
    cache.set(name, icon);
  }
  return icon;
}

/** A module whose every export is an icon, for `import { CheckIcon } from "@radix-ui/react-icons"`. */
export const iconsModule: Record<string, unknown> = new Proxy(
  {},
  {
    get: (_target, name) =>
      typeof name === "string" && name !== "then" && name !== "__esModule"
        ? iconFor(name)
        : undefined,
    has: (_target, name) => typeof name === "string",
  }
);
