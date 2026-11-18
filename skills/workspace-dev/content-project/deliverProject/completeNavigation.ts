import type { Draft, Plan } from "../types.js";

/** Add links to actual produced pages while preserving the authored README. */
export default function completeNavigation(
  documents: Draft[],
  plan: Plan,
): Draft[] {
  const readme = documents.find((document) => document.path === "README.md");
  if (!readme)
    throw new Error("Draft the planned README before completing navigation.");
  const written = new Set(documents.map((document) => document.path));
  const missing = plan.pages
    .filter((page) => page.path.startsWith("docs/") && written.has(page.path))
    .filter((page) => !readme.text.includes("](" + page.path + ")"))
    .map((page) => "- [" + page.role + "](" + page.path + ")");
  if (missing.length === 0) return documents;
  const text =
    readme.text.trimEnd() + "\n\n## Documents\n\n" + missing.join("\n") + "\n";
  return documents.map((document) =>
    document.path === readme.path ? { ...document, text } : document,
  );
}
