import { resolveChannelEndpoint } from "@workspace/pubsub";
import { agentRpcMethods } from "./rpc-contract.js";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import {
  AGENTIC_PROTOCOL_VERSION,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import type { RuntimeEntityCreateSpec } from "@vibestudio/shared/runtime/entitySpec";
import { doTargetId } from "@vibestudio/shared/workspaceServiceRpc";
import {
  AGENT_SETTING_KEYS,
  toSubscriptionConfig,
  type AgentSubscriptionConfig,
  type ChannelSubscriptionConfig,
} from "./agent-subscription-config.js";

/**
 * Runtime-agnostic launch/invite primitives for agent DOs. Browser panels,
 * headless sessions, and parent agents all enter through this port; caller
 * authority is enforced by runtime/channel services, not by duplicate helpers.
 */
export interface AgentLaunchRpc {
  call: import("@vibestudio/rpc").RpcCaller["call"];
}

export interface AgentEntityHandle {
  id?: string;
  targetId: string;
  contextId?: string;
  agentInitialization?: AgentSubscriptionResult;
}

/** A successful reasoning membership has its complete native initialization
 * committed. Addressed supervision memberships do not own a model loop. */
export interface AgentSubscriptionResult {
  ok: boolean;
  participantId: string;
}

export interface AgentEntityCreateInput {
  source: string;
  className: string;
  key: string;
  contextId?: string;
  ref?: string;
  config?: AgentSubscriptionConfig | Record<string, unknown>;
  stateArgs?: Record<string, unknown>;
  resourceBindings?: Array<{
    resource: { kind: string; id: string };
    capabilities: string[];
    scope: { kind: "entity" } | { kind: "agent-channel"; channelId: string };
  }>;
  /** Host derives the self entity/context coordinates and binds this agent to the channel. */
  agentChannelId?: string;
  agentInitialization?: {
    channelId: string;
    config?: Record<string, unknown>;
    replay?: boolean;
  };
}

export interface AgentChannelSubscriptionInput {
  channelId: string;
  contextId: string;
  config?: AgentSubscriptionConfig | Record<string, unknown>;
  replay?: boolean;
}

export interface AgentChannelUnsubscriptionInput {
  source: string;
  className: string;
  key: string;
  channelId: string;
}

export interface LaunchAgentIntoChannelInput extends AgentEntityCreateInput {
  channelId: string;
  replay?: boolean;
  missingContextErrorMessage?: string;
}

export interface LaunchAgentIntoChannelResult {
  handle: AgentEntityHandle;
  subscription: AgentSubscriptionResult;
  contextId: string;
}

export interface CreateSubagentContextInput {
  parentContextId: string;
  ownerEntityId: string;
  targetKey: string;
}

export interface AgentTaskSeedInput {
  senderParticipantId: string;
  task: string;
  messageId: string;
  childParticipantId: string;
  displayName?: string;
  senderMetadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AgentTaskSeedChannel {
  publishAgenticEvent(
    participantId: string,
    event: AgenticEvent,
    opts?: {
      idempotencyKey?: string;
      senderMetadata?: Record<string, unknown>;
    },
  ): Promise<{ id?: number }>;
}

export function targetIdFor(
  handleOrTargetId: AgentEntityHandle | string,
): string {
  return typeof handleOrTargetId === "string"
    ? handleOrTargetId
    : handleOrTargetId.targetId;
}

export function requireAgentSubscriptionResult(
  operation: "subscribeChannel" | "importChannelKnowledge",
  result: unknown,
): AgentSubscriptionResult {
  if (
    !result ||
    typeof result !== "object" ||
    typeof (result as { ok?: unknown }).ok !== "boolean" ||
    typeof (result as { participantId?: unknown }).participantId !== "string" ||
    !(result as { participantId: string }).participantId.trim()
  ) {
    throw new Error(`${operation} returned no participant identity`);
  }
  return result as AgentSubscriptionResult;
}

type AgentEntityCreateSpec = Extract<RuntimeEntityCreateSpec, { kind: "do" }>;

export function buildAgentEntityCreateSpec(
  input: AgentEntityCreateInput,
): AgentEntityCreateSpec {
  const stateArgs = {
    ...(input.stateArgs ?? {}),
    ...(input.config !== undefined
      ? {
          agentConfig: input.agentInitialization
            ? Object.fromEntries(
                Object.entries(input.config).filter(([key]) =>
                  (AGENT_SETTING_KEYS as readonly string[]).includes(key),
                ),
              )
            : input.config,
        }
      : {}),
  };
  return {
    kind: "do",
    execution: {
      surface: "code",
      source: input.source,
      ...(input.ref ? { ref: input.ref } : {}),
    },
    className: input.className,
    key: input.key,
    ...(input.contextId ? { contextId: input.contextId } : {}),
    ...(Object.keys(stateArgs).length > 0 ? { stateArgs } : {}),
    ...(input.resourceBindings
      ? { resourceBindings: input.resourceBindings }
      : {}),
    ...(input.agentChannelId ? { agentChannelId: input.agentChannelId } : {}),
    ...(input.agentInitialization
      ? { agentInitialization: input.agentInitialization }
      : {}),
  };
}

export async function createAgentEntity(
  rpc: AgentLaunchRpc,
  input: AgentEntityCreateInput,
): Promise<AgentEntityHandle> {
  return rpc.call("main", mainRpcMethods["runtime.createEntity"], [
    buildAgentEntityCreateSpec(input),
  ]);
}

export async function retireAgentEntity(
  rpc: AgentLaunchRpc,
  id: string,
): Promise<void> {
  await rpc.call("main", mainRpcMethods["runtime.retireEntity"], [{ id }]);
}

export async function subscribeAgentToChannel(
  rpc: AgentLaunchRpc,
  handleOrTargetId: AgentEntityHandle | string,
  input: AgentChannelSubscriptionInput,
): Promise<AgentSubscriptionResult> {
  const channelRef = await resolveChannelEndpoint(rpc, input.channelId);
  return requireAgentSubscriptionResult(
    "subscribeChannel",
    await rpc.call(
      targetIdFor(handleOrTargetId),
      agentRpcMethods["subscribeChannel"],
      [
        {
          channelId: input.channelId,
          channelRef,
          contextId: input.contextId,
          config: toSubscriptionConfig(input.config),
          replay: input.replay,
        },
      ],
    ),
  );
}

/**
 * Unsubscribe an already-active agent without acquiring or reactivating it.
 * Absence or retirement is reported by the ordinary active-entity relay.
 */
export async function unsubscribeAgentFromChannel(
  rpc: AgentLaunchRpc,
  input: AgentChannelUnsubscriptionInput,
): Promise<{ ok: boolean }> {
  return rpc.call(
    doTargetId({
      source: input.source,
      className: input.className,
      objectKey: input.key,
    }),
    agentRpcMethods["unsubscribeChannel"],
    [input.channelId],
  );
}

/** Create/bind the execution scope, then initialize the channel. Success
 * means instructions, model policy, tools and replay history are committed;
 * no later configuration-discovery step is required before accepting input. */
export async function launchAgentIntoChannel(
  rpc: AgentLaunchRpc,
  input: LaunchAgentIntoChannelInput,
): Promise<LaunchAgentIntoChannelResult> {
  const handle = await createAgentEntity(rpc, {
    ...input,
    agentInitialization: {
      channelId: input.channelId,
      config: toSubscriptionConfig(input.config),
      replay: input.replay,
    },
  });
  if (
    input.contextId &&
    handle.contextId &&
    handle.contextId !== input.contextId
  ) {
    throw new Error(
      `runtime.createEntity returned existing agent ${handle.id ?? handle.targetId} in context ` +
        `${handle.contextId}, but channel ${input.channelId} is in context ${input.contextId}`,
    );
  }
  const contextId = input.contextId ?? handle.contextId;
  if (!contextId)
    throw new Error(
      input.missingContextErrorMessage ??
        "runtime.createEntity did not return a contextId for agent initialization",
    );
  const subscription = requireAgentSubscriptionResult(
    "subscribeChannel",
    handle.agentInitialization,
  );
  return { handle, subscription, contextId };
}

export async function createSubagentContext(
  rpc: AgentLaunchRpc,
  input: CreateSubagentContextInput,
): Promise<{ contextId: string }> {
  return rpc.call("main", mainRpcMethods["runtime.createSubagentContext"], [
    input,
  ]);
}

export function buildAgentTaskSeedEvent(
  input: AgentTaskSeedInput,
): AgenticEvent<"message.completed"> {
  if (!input.childParticipantId.trim()) {
    throw new Error("Agent task seed requires a child participant identity");
  }
  const displayName = input.displayName ?? "Subagent task";
  const senderMetadata = input.senderMetadata ?? {};
  return {
    kind: "message.completed",
    actor: {
      kind: "user",
      id: input.senderParticipantId,
      displayName,
      metadata: senderMetadata,
    },
    causality: { messageId: input.messageId as never },
    payload: {
      protocol: AGENTIC_PROTOCOL_VERSION,
      role: "user",
      blocks: [
        {
          blockId: `${input.messageId}:block:0` as never,
          type: "text",
          content: input.task,
        },
      ],
      outcome: "completed",
      tier: "primary",
      to: [
        {
          kind: "participant" as const,
          participantId: input.childParticipantId,
        },
      ],
      // Turn metadata makes the child's ordinary turn closure observable to
      // its vessel. A subagent that returns a final answer instead of calling
      // the explicit `complete` tool must still publish a durable terminal.
      metadata: { origin: "agent-initiated" },
    },
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export async function publishAgentTaskSeed(
  channel: AgentTaskSeedChannel,
  input: AgentTaskSeedInput,
): Promise<{ id?: number }> {
  const senderMetadata = input.senderMetadata ?? {};
  return channel.publishAgenticEvent(
    input.senderParticipantId,
    buildAgentTaskSeedEvent({ ...input, senderMetadata }),
    { idempotencyKey: input.messageId, senderMetadata },
  );
}

export { toSubscriptionConfig };
export type { AgentSubscriptionConfig, ChannelSubscriptionConfig };
