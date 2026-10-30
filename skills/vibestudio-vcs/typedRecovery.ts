/**
 * Typed VCS recovery: the next step for a failed `vcs` call, chosen from the
 * error's `code` and structured fields. The messages explain; they are never
 * parsed. Every code the service can return has an entry (the test keeps the
 * table equal to `vcsErrorSchema`), and the table is the executable form of
 * [references/typed-recovery.md](references/typed-recovery.md).
 */

/** The `code` values of `VcsError`, plus the two the agent tools add. */
export type RecoverableCode =
  | "RevisionChanged"
  | "CommandIdReuse"
  | "InvalidReference"
  | "Unauthorized"
  | "ConflictPresent"
  | "CoupledGroupIncomplete"
  | "ScopeTooLarge"
  | "IntegrationIncomplete"
  | "SourceIsAncestor"
  | "MergeDriverError"
  | "IntegrityFailure"
  | "DestinationOccupied"
  | "NoEffect"
  | "SubagentTerminal"
  | "WorkingChangesPresent"
  | "ExternalEffectFailed"
  | "BuildGateFailed";

/** A failed `vcs` call, as the typed error reports it. Only the fields recovery reads are named. */
export interface TypedVcsError {
  code: string;
  message?: string;
  /** ScopeTooLarge: which bounded scope overflowed. */
  scope?: string;
  /** ScopeTooLarge: its maximum. */
  maximum?: number;
  /** CoupledGroupIncomplete: the structural group that was split. */
  group?: string;
  /** ConflictPresent, CoupledGroupIncomplete, IntegrityFailure: the coordinates involved. */
  coordinates?: readonly unknown[];
  /** IntegrationIncomplete: source coordinates with no decision. */
  unaccountedCoordinates?: readonly unknown[];
  /** CommandIdReuse, NoEffect: the command identity. */
  commandId?: string;
  /** DestinationOccupied: the occupied path. */
  path?: string;
  /** ExternalEffectFailed: the failed host effect. */
  effectId?: string;
  /** IntegrityFailure: the opaque diagnostic handle. */
  handle?: string;
  /** BuildGateFailed: whether the failure is in source, infrastructure, or both. */
  failureClass?: "source" | "infrastructure" | "mixed";
  /** BuildGateFailed: the service's own recovery. */
  recovery?: { action: "repair-source" | "reobserve"; instruction: string };
}

/** Which call failed; ConflictPresent means one thing from a merge and another from a revert. */
export interface FailedCall {
  operation?: string;
}

export type RecoveryAction =
  | "reread-status-and-replan"
  | "omit-command-id"
  | "refresh-reference"
  | "obtain-authority"
  | "resolve-conflicts"
  | "select-whole-group"
  | "page-or-narrow"
  | "conclude-integration"
  | "compare-local-instead"
  | "resolve-from-review"
  | "stop-record-handle"
  | "choose-free-destination"
  | "inspect-current-state"
  | "use-retained-result"
  | "finish-or-discard-local-chain"
  | "retry-same-command"
  | "repair-and-commit-again"
  | "write-intended-result"
  | "report-unrecognized-code";

export interface NextStep {
  code: string;
  action: RecoveryAction;
  /** The step, naming the error's own values. */
  instruction: string;
  /** True when working around the error is wrong: report it instead. */
  stop: boolean;
  /**
   * What a retry of the same call may be: "same-command-id" only when method,
   * arguments, basis, cause and intent stay byte-identical; "new-command-id" after
   * re-observing; "none" when repeating cannot help.
   */
  retry: "none" | "same-command-id" | "new-command-id";
}

type Entry = (error: TypedVcsError, call: FailedCall) => Omit<NextStep, "code">;

const count = (items: readonly unknown[] | undefined): number => items?.length ?? 0;

const TABLE: Record<RecoverableCode, Entry> = {
  RevisionChanged: () => ({
    action: "reread-status-and-replan",
    instruction: "Call status, compare against the new state, and call again. Do not rewrite the expected basis.",
    stop: false,
    retry: "new-command-id",
  }),
  CommandIdReuse: (error) => ({
    action: "omit-command-id",
    instruction: `Command ID ${error.commandId ?? "(unnamed)"} was already used for different content. Omit it and let the client mint one.`,
    stop: false,
    retry: "new-command-id",
  }),
  InvalidReference: () => ({
    action: "refresh-reference",
    instruction: "Refresh the typed ID through status, inspect, list, or resolve. Do not rebuild opaque IDs.",
    stop: false,
    retry: "new-command-id",
  }),
  Unauthorized: () => ({
    action: "obtain-authority",
    instruction: "Stop and obtain the missing authority. Changing the payload does not fix it.",
    stop: true,
    retry: "none",
  }),
  ConflictPresent: (error, call) =>
    call.operation === "revert"
      ? {
          action: "write-intended-result",
          instruction:
            "Newer state means the counteraction would no longer be correct. Inspect the coordinate and write the result you want instead of forcing old bytes.",
          stop: false,
          retry: "none",
        }
      : {
          action: "resolve-conflicts",
          instruction: `${count(error.coordinates)} selected coordinate(s) conflict. Read every returned aspect, attribution chain, resolution list, and both intents. Choose theirs or ours, or write the correct combined state and choose current.`,
          stop: false,
          retry: "new-command-id",
        },
  CoupledGroupIncomplete: (error) => ({
    action: "select-whole-group",
    instruction: `Group ${error.group ?? "(unnamed)"} was split (${count(error.coordinates)} members). Select all members together, or omit the coordinate list so the planner chooses a valid page.`,
    stop: false,
    retry: "new-command-id",
  }),
  ScopeTooLarge: (error) => ({
    action: "page-or-narrow",
    instruction: `${error.scope ?? "The request"} exceeds the maximum${error.maximum === undefined ? "" : ` of ${error.maximum}`}. Page the compare or narrow the coordinate selection. A structural group cannot be divided; never drop members to make it fit.`,
    stop: false,
    retry: "new-command-id",
  }),
  IntegrationIncomplete: (error) => ({
    action: "conclude-integration",
    instruction: `${count(error.unaccountedCoordinates)} source coordinate(s) have no reachable decision. Run the returned merge recipe: allRemaining: ours to decline the remainder, or current with a rationale for a reviewed combined parent state, then commit again.`,
    stop: false,
    retry: "new-command-id",
  }),
  SourceIsAncestor: () => ({
    action: "compare-local-instead",
    instruction: 'The source is already in the target\'s history, so there is nothing to integrate. Run vcs({ operation: "compare", view: "local" }) to review local work against protected main.',
    stop: false,
    retry: "none",
  }),
  MergeDriverError: () => ({
    action: "resolve-from-review",
    instruction: "Inspect errorData.merges and errorData.review. Earlier pages are already recorded; do not replay them. Resolve from the reported current review.",
    stop: false,
    retry: "new-command-id",
  }),
  IntegrityFailure: (error) => ({
    action: "stop-record-handle",
    instruction: `Stop. Record the typed handle${error.handle === undefined ? "" : ` ${error.handle}`} and the coordinates. Do not write a compensating change or broaden a prompt.`,
    stop: true,
    retry: "none",
  }),
  DestinationOccupied: (error) => ({
    action: "choose-free-destination",
    instruction: `${error.path ?? "The destination"} is occupied. Inspect the file there, then pick a free path or deliberately edit or move the existing file.`,
    stop: false,
    retry: "new-command-id",
  }),
  NoEffect: () => ({
    action: "inspect-current-state",
    instruction: "Inspect current state. Report success only if the requested outcome is already true.",
    stop: false,
    retry: "none",
  }),
  SubagentTerminal: () => ({
    action: "use-retained-result",
    instruction: "The subagent has already finished. Use the returned status, source event, and allowed operations; inspect, read, or merge the retained result instead of sending more instructions.",
    stop: false,
    retry: "none",
  }),
  WorkingChangesPresent: () => ({
    action: "finish-or-discard-local-chain",
    instruction: "Finish, commit, or discard the local chain before the operation that needs a clean state.",
    stop: false,
    retry: "new-command-id",
  }),
  ExternalEffectFailed: (error) => ({
    action: "retry-same-command",
    instruction: `The call is waiting on host effect ${error.effectId ?? "(unnamed)"}. Keep the command ID for an identical retry and inspect the effect diagnostics.`,
    stop: false,
    retry: "same-command-id",
  }),
  BuildGateFailed: (error) => ({
    action: "repair-and-commit-again",
    instruction:
      error.recovery?.action === "reobserve"
        ? `The failure is infrastructure (${error.failureClass ?? "unclassified"}): reobserve, commit a new event, and push it. Never bypass the candidate gate.`
        : "Fix the returned candidate diagnostics, commit a new event, and push it. Never bypass the candidate gate.",
    stop: false,
    retry: "new-command-id",
  }),
};

const isRecoverable = (code: string): code is RecoverableCode => Object.hasOwn(TABLE, code);

/** The next step for a failed `vcs` call. An unrecognized code is reported, never guessed at. */
export function typedRecovery(error: TypedVcsError, call: FailedCall = {}): NextStep {
  if (!isRecoverable(error.code)) {
    return {
      code: error.code,
      action: "report-unrecognized-code",
      instruction: `Unrecognized error code ${error.code}. Do not guess a recovery: report the code and message.`,
      stop: true,
      retry: "none",
    };
  }
  return { code: error.code, ...TABLE[error.code](error, call) };
}

/** Every code with an entry, for the test that keeps the table equal to the service's error schema. */
export const RECOVERABLE_CODES = Object.keys(TABLE) as RecoverableCode[];
