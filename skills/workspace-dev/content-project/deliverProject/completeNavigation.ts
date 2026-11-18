import type { Draft, Plan } from "../types.js";

function projectLink(source: string, href: string): string | null {
  const target = href.split("#", 1)[0] ?? "";
  if (target.startsWith("/")) return null;
  const parts = source.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (part && part !== ".") {
      parts.push(part);
    }
  }
  return parts.join("/");
}

/** Keep valid navigation, retain broken link labels, and link to the pages actually written. */
export default function completeNavigation(
  documents: Draft[],
  plan: Plan,
): Draft[] {
  const written = new Set([
    ...documents.map((document) => document.path),
    "sources.json",
  ]);
  const connected = documents.map((document) => ({
    ...document,
    text: document.text.replace(
      /\[([^\]\n]+)\]\(([^)\n]+)\)/gu,
      (link, label: string, href: string) => {
        if (href.startsWith("#") || /^[a-z]+:/iu.test(href)) return link;
        const target = projectLink(document.path, href);
        return target && written.has(target) ? link : label;
      },
    ),
  }));
  const readme = connected.find((document) => document.path === "README.md");
  if (!readme)
    throw new Error("Draft the planned README before completing navigation.");
  const missing = plan.pages
    .filter((page) => page.path.startsWith("docs/") && written.has(page.path))
    .filter((page) => !readme.text.includes("](" + page.path + ")"))
    .map((page) => "- [" + page.role + "](" + page.path + ")");
  if (missing.length === 0) return connected;
  const text =
    readme.text.trimEnd() + "\n\n## Documents\n\n" + missing.join("\n") + "\n";
  return connected.map((document) =>
    document.path === readme.path ? { ...document, text } : document,
  );
}
