/**
 * The cause a failed call's structured fields already decide, with the remediation the error carried, or null when only
 * its message can say. Exact reading: an agent-tool failure's kind and retry policy, an authority failure's reason code,
 * a VCS error code, the RPC error kind, and the eval's failure kind.
 */
import type { Cause, FailedCall } from "../types.js";

type Typed = { cause: Cause; remediation?: string };

const AUTHORITY: Record<string, Cause> = {
  "approval-required": "needs-approval",
  "fixed-code-not-requested": "missing-authority",
  "receiver-rejected": "missing-authority",
  "user-denied": "missing-authority",
  "connection-required": "wrong-context",
  "invalid-session": "transient",
  "invalid-attestation": "transient",
};

const TOOL_KINDS: Record<string, Cause> = {
  "invalid-input": "bad-arguments",
  "not-found": "wrong-context",
  conflict: "wrong-context",
  infrastructure: "platform-defect",
  integrity: "platform-defect",
};

/** VCS error codes (skills/vibestudio-vcs/typedRecovery.ts has each code's exact step). */
const VCS: Record<string, Cause> = {
  InvalidReference: "bad-arguments",
  CommandIdReuse: "bad-arguments",
  ScopeTooLarge: "bad-arguments",
  RevisionChanged: "wrong-context",
  ConflictPresent: "wrong-context",
  CoupledGroupIncomplete: "wrong-context",
  IntegrationIncomplete: "wrong-context",
  SourceIsAncestor: "wrong-context",
  DestinationOccupied: "wrong-context",
  WorkingChangesPresent: "wrong-context",
  SubagentTerminal: "wrong-context",
  NoEffect: "wrong-context",
  Unauthorized: "missing-authority",
  MergeDriverError: "platform-defect",
  IntegrityFailure: "platform-defect",
};

const RPC_KINDS: Record<string, Cause> = {
  transport: "transient",
  internal: "platform-defect",
  protocol: "platform-defect",
  access: "missing-authority",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

export default function typedCause(failure: FailedCall): Typed | null {
  const error = failure.error;
  const data = record(error.errorData);
  const authority = record(data?.["authorityFailure"]);
  const reason = text(authority?.["reasonCode"]);
  if (reason && AUTHORITY[reason]) {
    const remediation = text(record(authority?.["remediation"])?.["message"]);
    return { cause: AUTHORITY[reason]!, ...(remediation ? { remediation } : {}) };
  }
  if (data?.["protocol"] === "agent-tool-failure.v1") {
    const kind = text(data["kind"]);
    const policy = text(record(data["retry"])?.["policy"]);
    const remediation = text(record(data["recovery"])?.["instruction"]);
    const withRemediation = (cause: Cause): Typed => ({ cause, ...(remediation ? { remediation } : {}) });
    if (kind === "authority") return withRemediation(policy === "request-approval" ? "needs-approval" : "missing-authority");
    if (kind && TOOL_KINDS[kind]) return withRemediation(TOOL_KINDS[kind]!);
    if (kind === "external-effect" && policy === "retry-identical") return withRemediation("transient");
  }
  const vcsCode = text(data?.["code"]) ?? error.code;
  if (vcsCode && VCS[vcsCode]) return { cause: VCS[vcsCode]! };
  if (error.failureKind === "infrastructure") return { cause: "platform-defect" };
  if (error.errorKind && RPC_KINDS[error.errorKind]) return { cause: RPC_KINDS[error.errorKind]! };
  return null;
}
