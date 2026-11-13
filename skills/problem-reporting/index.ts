/**
 * Problem-report helpers for agent eval:
 *
 *   import { draftProblemReport } from "@workspace-skills/problem-reporting";
 *   const draft = await draftProblemReport(evidence);
 *
 * `draftProblemReport` is exact code (SKILL.md says what it returns); it proposes and saves nothing.
 */
export { draftProblemReport } from "./draft-problem-report.js";
export type { Draft, DraftSection, Evidence, ReportSection } from "./types.js";
