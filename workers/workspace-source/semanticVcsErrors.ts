export type SemanticVcsErrorCode =
  | "InvalidReference"
  | "RevisionChanged"
  | "NoEffect"
  | "DestinationOccupied"
  | "ConflictPresent"
  | "CoupledGroupIncomplete"
  | "IntegrationIncomplete"
  | "CommandIdReuse"
  | "SourceIsAncestor"
  | "IntegrityFailure"
  | "ScopeTooLarge";

export class SemanticVcsError extends Error {
  /** Schema-owned payload carried unchanged across workerd and RPC boundaries.
   * Callers branch on this structure, never on the diagnostic message. */
  readonly errorData: Record<string, unknown>;

  constructor(
    readonly code: SemanticVcsErrorCode,
    message: string,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "SemanticVcsError";
    this.errorData = { ...detail, code };
  }
}

/** Keep internal journal/effect contract diagnostics inspectable without
 * minting caller-facing semantic error codes for host/control-plane bugs. */
export function internalSemanticIntegrityFailure(
  diagnostic: "CommandInProgress" | "EffectMismatch",
  message: string,
  detail: Record<string, unknown> = {}
): SemanticVcsError {
  return new SemanticVcsError("IntegrityFailure", message, {
    internalDiagnostic: diagnostic,
    ...detail,
  });
}
