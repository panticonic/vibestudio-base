/** What an agent knows about something that went wrong, written down before judging or reporting it. */
export type Evidence = {
  /** What the user (or the agent on the user's behalf) was trying to do, in a sentence or two. */
  goal: string;
  /** What actually happened: error text exactly as shown, or the wrong result described. */
  observed: string;
  /** What should have happened according to the documentation or the user. Empty when unknown. */
  expected: string;
  /** The product operation token when known, for example `eval.returnImage`; null when unknown. Letters, digits and `_.:@/-` only. */
  operation: string | null;
  /** What was tried since, and whether a retry worked. Empty when nothing was tried. */
  attempts: string;
  /** True only when the agent itself reproduced the failure; false when it is the user's account or a single sighting. */
  reproduced: boolean;
  /** One invocation to fetch a bounded diagnostic for, when the failure happened inside a known invocation. */
  invocation?: { trajectoryId: string; branchId: string; invocationId: string };
};

/**
 * Whose problem a failure is.
 * - platform: Vibestudio itself broke a documented contract: a wrong result from a platform tool or service, an
 *   internal error, a crash, state that disagrees with itself.
 * - user-code: the code that failed was written in the workspace (apps, panels, extensions, workers, project code,
 *   including code the agent wrote in this task), and the failure is that code's own bug or build error.
 * - refusal: the platform correctly refused: validation, permission, approval, path or revision checks working as
 *   designed.
 * - transient: a one-off network, rate-limit or timeout failure that cleared on retry.
 */
export type DefectClass = "platform" | "user-code" | "refusal" | "transient";

export type ReportSection =
  | "goal"
  | "symptom"
  | "expected"
  | "reproduction"
  | "timeline"
  | "impact"
  | "investigation"
  | "findings"
  | "hypotheses"
  | "attempts"
  | "verification"
  | "questions";

/** One narrative section the agent proposes to add to the report. */
export type DraftSection = {
  section: ReportSection;
  /** observed: the agent saw it itself. inferred: reasoned from observations. unverified: the user's account, not checked. */
  claims: "observed" | "inferred" | "unverified";
  /** Markdown for the user to review. Plain facts; no credentials, no home paths, no private reasoning. */
  markdown: string;
};

/**
 * A proposed problem report, built from the evidence with secrets and private paths removed. Nothing is saved or sent: the agent creates the draft with `problemReports`, shows it to
 * the user, and sends only after the one-time approval.
 */
export type Draft = {
  /**
   * The fields of the report's `problem` that come from the evidence. The agent chooses `category`, `component` and
   * `kind` (the enums of `problemReports`) when it creates the report: they are judgments about the product, and an
   * invented value would be wrong in the stored report.
   */
  problem: {
    /** Product operation token copied from the evidence, or null. */
    operation: string | null;
    /** The observed behavior in the user's words, the first 280 characters. */
    symptom: string;
    /** The expected behavior; empty when the evidence has none. */
    expected: string;
  };
  narrative: DraftSection[];
  /** Things the report cannot show yet, for the agent to tell the user. */
  gaps: string[];
  /** Where the report would go and the narrative size limit, from `problemReports.availability`. */
  destination: string;
  narrativeLimitBytes: number;
};
