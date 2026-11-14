/** How a document section bears on a question. */
export type Fit = "answers" | "related" | "no";

/** A document section that bears on a question, quoted exactly. */
export type Found = {
  /** The file (`skills/sandbox/EVAL.md`) or catalog entry (`docs:service:blobstore.putText`) it is in. */
  source: string;
  /** Its heading path within the file, or the catalog entry's name. */
  section: string;
  /** The section's text, copied exactly from its source. */
  quote: string;
  fit: "answers" | "related";
};

export type Located = {
  /** At most three, those that answer before those that are only related. */
  found: Found[];
  /** Every source whose sections were judged. */
  tried: string[];
};

/** Where to look: path prefixes relative to the workspace root (default: every Markdown file). */
export type DocScope = { paths?: string[] };

/** A rejected tool or service call, as the call reported it. */
export type FailedCall = {
  /** The tool or method that failed: `launch_automation`, `eval`, `workers.launch`. */
  call: string;
  error: {
    message: string;
    code?: string;
    /** The RPC error kind: access, service, transport, protocol, application, internal. */
    errorKind?: string;
    /** The error's structured payload (an agent-tool failure, an authority failure, a VCS error). */
    errorData?: unknown;
    /** An eval's classification: user-code, infrastructure, cancelled. */
    failureKind?: string;
  };
};

/**
 * bad-arguments: the input was wrong. wrong-context: a valid call in the wrong place or state. missing-authority: the
 * caller lacks a grant. needs-approval: a user's decision is required. transient: a passing condition. platform-defect:
 * the platform itself failed.
 */
export type Cause =
  | "bad-arguments"
  | "wrong-context"
  | "missing-authority"
  | "needs-approval"
  | "transient"
  | "platform-defect"
  | "unknown";

export type Recovery = {
  cause: Cause;
  /** typed: the error's structured fields decided the cause; model: the executor read its message. */
  by: "typed" | "model";
  /** What to do next for this cause. */
  next: string;
  /** The remediation the error itself carried, copied exactly. */
  remediation?: string;
  /** Documentation that answers the error, quoted exactly. */
  docs: Found[];
};
