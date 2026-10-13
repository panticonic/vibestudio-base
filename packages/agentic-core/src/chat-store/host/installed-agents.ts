/** Installed-agent records and launch-config composition for chat hosts. */
import { mergeAgentConfig } from "@workspace/agentic-core/agent-subscription-config";

/**
 * Return the host-bound panel context and reject any channel/UI claim that
 * disagrees with it. State args never select a workspace branch.
 */
export function requireChatContextId(
  runtimeContextId: string | undefined,
  claimedContextId?: string
): string {
  const runtime = runtimeContextId?.trim();
  if (!runtime) throw new Error("Chat panel runtime has no workspace context");
  const claimed = claimedContextId?.trim();
  if (claimed && claimed !== runtime) {
    throw new Error(
      `Chat channel context ${claimed} does not match panel workspace context ${runtime}`
    );
  }
  return runtime;
}

/** Per-agent record persisted into `stateArgs.installedAgents`. */
export interface InstalledAgentRecord {
  agentId: string;
  handle: string;
  key: string;
  source: string;
  className: string;
  /** Per-agent config (model/effort/approval/respondPolicy/…) used to (re)create
   *  the agent — seeded into its creation stateArgs, NOT the subscription. */
  config?: Record<string, unknown>;
}

/** Coerce a proposed handle into the channel participant-handle rule
 *  (`/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/`): replace invalid chars with `-`, drop a
 *  leading non-letter run, and cap length (leaving room for a `-xxxx` suffix).
 *  Guarantees a valid base handle regardless of the agent's manifest metadata. */
export function sanitizeHandle(raw: string, fallback = "ai-chat"): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^[^a-zA-Z]+/, "");
  return cleaned.slice(0, 50) || fallback;
}

/** Append a newly-added agent to the existing installedAgents list. Pure helper
 *  used by handleAddAgent so the persistence shape is unit-testable. */
export function appendInstalledAgent(
  existing: InstalledAgentRecord[] | undefined,
  agent: InstalledAgentRecord
): InstalledAgentRecord[] {
  return [...(existing ?? []), agent];
}

export interface BuildAgentSubscriptionConfigOptions {
  handle: string;
  globalConfig?: Record<string, unknown>;
  perAgentConfig?: Record<string, unknown>;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace-vibestudio" | "replace";
}

/**
 * Build explicit panel overrides and channel presentation. Workspace defaults
 * are applied by the shared launch primitive.
 */
export function buildAgentSubscriptionConfig({
  handle,
  globalConfig,
  perAgentConfig,
  systemPrompt,
  systemPromptMode,
}: BuildAgentSubscriptionConfigOptions): {
  subscribeConfig: Record<string, unknown>;
  perAgent: Record<string, unknown>;
} {
  const perAgent: Record<string, unknown> = { ...(perAgentConfig ?? {}) };
  delete perAgent["handle"];

  const subscribeConfig: Record<string, unknown> = {
    ...mergeAgentConfig(globalConfig, perAgent),
    handle,
  };

  if (systemPrompt && subscribeConfig["systemPrompt"] === undefined) {
    subscribeConfig["systemPrompt"] = systemPrompt;
  }
  if (systemPromptMode && subscribeConfig["systemPromptMode"] === undefined) {
    subscribeConfig["systemPromptMode"] = systemPromptMode;
  }

  return { subscribeConfig, perAgent };
}

/** A Durable Object participant's identity, parsed from `do:<source>:<class>:<key>`. */
export interface ChannelDORef {
  source: string;
  className: string;
  objectKey: string;
}

/** Parse a channel participant id into its Durable Object identity, if it is one. */
export function parseDoTargetId(participantId: string): ChannelDORef | null {
  if (!participantId.startsWith("do:")) return null;
  const body = participantId.slice(3);
  const slashIdx = body.indexOf("/");
  const colonAfterSlash = slashIdx >= 0 ? body.indexOf(":", slashIdx) : -1;
  if (colonAfterSlash === -1) return null;
  const source = body.slice(0, colonAfterSlash);
  const rest = body.slice(colonAfterSlash + 1);
  const nextColon = rest.indexOf(":");
  if (nextColon === -1) return null;
  return {
    source,
    className: rest.slice(0, nextColon),
    objectKey: rest.slice(nextColon + 1),
  };
}
