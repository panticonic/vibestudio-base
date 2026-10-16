/**
 * Adapters from a runtime's primitives to the `ChatHostPorts` contract.
 *
 * Each chat surface (the chat panel, the terminal chat, and the desktop, Ink
 * and React Native chat clients) owns a different runtime but needs the same
 * port glue: the workspace-event name mapping, review waiting over the host
 * rpc, a state port over its durable store. The glue lives here, as small
 * factories over explicit primitives, so a surface is one thin call.
 */
import { SHELL_APPROVAL_PENDING_CHANGED_EVENT } from "@vibestudio/shell-core/approvalState";
import type { EventName } from "@vibestudio/shared/events";
import { waitForApprovalResolution } from "@workspace/pubsub";
import type { WorkspaceReviewWaiter } from "../../provisional-agent-lifecycle.js";
import type {
  ChatHostConnectionPort,
  ChatHostNotification,
  ChatHostPorts,
  ChatHostRpc,
  ChatHostState,
  ChatHostStatePatch,
  ChatHostWorkspaceEvent,
  StateArgsPort,
} from "./ports.js";

type ReviewRpc = Parameters<typeof waitForApprovalResolution>[0];

/** The host event each `ChatHostWorkspaceEvent` is delivered as. */
export const CHAT_HOST_WORKSPACE_EVENT_NAMES = {
  "approvals-changed": SHELL_APPROVAL_PENDING_CHANGED_EVENT,
  "units-changed": "workspace:units-changed",
  "workspace-config-changed": "workspace:config-changed",
} as const satisfies Record<ChatHostWorkspaceEvent, EventName>;

/** The slice of `EventsClient` the workspace-event adapter uses. */
export interface ChatHostEventsClient {
  on(event: EventName, listener: () => void): () => void;
  subscribe(event: EventName): Promise<unknown>;
  unsubscribe(event: EventName): Promise<unknown>;
}

/** Map `ChatHostWorkspaceEvent`s onto host events, subscribing for the handler's lifetime. */
export function createWorkspaceEventPort(
  events: ChatHostEventsClient
): NonNullable<ChatHostPorts["onWorkspaceEvent"]> {
  return (event, handler) => {
    const name = CHAT_HOST_WORKSPACE_EVENT_NAMES[event];
    const off = events.on(name, handler);
    void events.subscribe(name);
    return () => {
      off();
      void events.unsubscribe(name);
    };
  };
}

/** Wait for a workspace review over the host rpc (approval resolution events). */
export function createReviewWaiter(rpc: ReviewRpc): WorkspaceReviewWaiter {
  return async (approvalId) => {
    await waitForApprovalResolution(rpc, approvalId);
  };
}

/** Apply a `ChatHostStatePatch` the way every state store does: `null` clears the key. */
export function applyChatHostStatePatch(
  state: ChatHostState,
  partial: ChatHostStatePatch
): ChatHostState {
  const next: Record<string, unknown> = { ...state };
  for (const [key, value] of Object.entries(partial)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as ChatHostState;
}

/**
 * A `StateArgsPort` over a store that owns more than the chat host's keys (a
 * panel's state args). The store's own patch result is not the port's.
 */
export function createStateArgsPort(store: {
  get(): ChatHostState;
  patch(partial: ChatHostStatePatch): Promise<unknown>;
  subscribe(listener: () => void): () => void;
}): StateArgsPort {
  return {
    get: () => store.get(),
    patch: async (partial) => {
      await store.patch(partial);
    },
    subscribe: (listener) => store.subscribe(listener),
  };
}

/** Primitives a surface supplies; everything else is derived. */
export interface ChatHostPortsInput {
  /** Authenticated host client: calls services, reports transport status and recovery. */
  rpc: ChatHostRpc & ChatHostConnectionPort & ReviewRpc;
  contextId: string | undefined;
  instanceId: string;
  state: StateArgsPort;
  /** Workspace events client. Omitted: the host never hears workspace events. */
  events?: ChatHostEventsClient;
  /** Surface failures that no snapshot field renders. */
  notify?: (notification: ChatHostNotification) => void | Promise<unknown>;
  /** Override review waiting; defaults to waiting over `rpc`. */
  waitForReview?: WorkspaceReviewWaiter;
  localModels?: ChatHostPorts["localModels"];
  recoveryCoordinator?: ChatHostPorts["recoveryCoordinator"];
  randomUuid?: () => string;
}

/** Assemble `ChatHostPorts` from a runtime's primitives. */
export function createChatHostPorts(input: ChatHostPortsInput): ChatHostPorts {
  const { rpc, events, waitForReview, ...rest } = input;
  return {
    ...rest,
    rpc,
    connection: rpc,
    waitForReview: waitForReview ?? createReviewWaiter(rpc),
    ...(events ? { onWorkspaceEvent: createWorkspaceEventPort(events) } : {}),
  };
}
