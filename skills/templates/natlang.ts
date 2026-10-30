import templateRemedy from "./templateRemedy.nl";
import templateRole from "./templateRole.nl";
import { summarize } from "./summarize.js";
import type { TemplateInspection, TemplateSummary } from "./types.js";

export { templateRemedy, templateRole };

/**
 * A template at a glance: the small model decides what kind of template it is;
 * names, counts, and dependencies are read from the inspection.
 */
export async function summarizeTemplate(inspection: TemplateInspection): Promise<TemplateSummary> {
  return summarize(inspection, await templateRole(inspection));
}
