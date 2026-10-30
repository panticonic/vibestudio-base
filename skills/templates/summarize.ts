import type { TemplateInspection, TemplateRole, TemplateSummary } from "./types.js";

/** The name the template gives itself, else the stem of its URL. */
function nameOf(inspection: TemplateInspection): string {
  const declared = inspection.presentation?.name?.trim();
  if (declared) return declared;
  const stem = inspection.pin.url.replace(/\/+$/u, "").split("/").pop() ?? inspection.pin.url;
  return stem.replace(/\.git$/u, "");
}

/** Everything a summary says that needs no judgment: names, counts, and dependency URLs, read from the inspection. */
export function summarize(inspection: TemplateInspection, role: TemplateRole): TemplateSummary {
  const parts: Record<string, number> = {};
  for (const path of inspection.repositories) {
    const folder = path.split("/")[0]!;
    parts[folder] = (parts[folder] ?? 0) + 1;
  }
  return {
    name: nameOf(inspection),
    description: inspection.presentation?.description?.trim() || null,
    role,
    commit: inspection.pin.commit.slice(0, 12),
    dependsOn: inspection.dependencies.map((dependency) => dependency.url),
    parts: Object.fromEntries(Object.entries(parts).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}
