import type { JsonValue } from "@panticonic/pi-chord";
/** Product provenance carried by actual native inputs and task ancestry. */
export interface AgentProductContextPolicy {
  mode?: "full" | "isolated";
  includeWorkspacePrompt?: boolean;
  includeSkillIndex?: boolean;
  promptFile?: string;
  promptFileContent?: string;
  tokenBudget?: number;
}

export interface AgentProductMetadata {
  /** Immutable application provenance pinned at the actual native input admission. */
  domain?: { kind: string; data: JsonValue };
  origin?: "agent-initiated" | "scheduled";
  /** Durable reviewed automation provenance for this exact tick. */
  automation?: {
    missionId: string;
    runId: string;
    /** Account that owns this mission revision; used for exact `owner` addressing in fresh runs. */
    ownerUserId: string;
    name: string;
    revision: number;
    action: "prompt" | "eval" | "watch" | "notify" | "method";
    trigger: "manual" | "scheduled";
    startedAt: number;
    createdAt: number;
    activatedAt?: number;
    runNumber?: number;
    /** Opaque host admission for a separate executor. Continuing the current
     * task uses its existing closure instead. Never rendered to the model. */
    authoritySessionNonce?: string;
    schedule:
      | {
          kind: "interval";
          everyMs: number;
          anchorAt?: number;
          jitterMs?: number;
          untilAt?: number;
          maxRuns?: number;
        }
      | {
          kind: "cron";
          expression: string;
          timezone: string;
          untilAt?: number;
          maxRuns?: number;
        }
      | null;
  };
  /** Direct invocations either finish immediately or continue when their check signals work. */
  completion?: "after-invocation" | "when-signaled";
  contextPolicy?: AgentProductContextPolicy;
  delivery?: "none" | "channel" | "last-contact";
  ackToken?: string;
  silentOk?: boolean;
  /** Admit this input as the next native run instead of steering active work. */
  deliverAfterTurn?: boolean;
  /** Exact retained child run whose deferred report this prompt carries.
   * Runtime-owned: it lets a same-turn suspend release the report once the
   * child's current turn closes without retiring the collaborator. */
  supervisedRunId?: string;
  /**
   * A machine-stable user-interface selection carried by the same message as
   * its readable text. The context builder exposes this bounded structure to
   * the model; delivery controls above remain transport-only.
   */
  interaction?: {
    source: string;
    kind: string;
    action: string;
    targetId: string;
    /** Selected option values, for controls that choose among options. */
    values?: string[];
  };
}
