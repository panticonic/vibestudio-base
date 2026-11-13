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
