/**
 * Environment ports of the ChatHostController.
 *
 * The controller holds the chat host's policy (which channel, which agents,
 * which model) and reaches its environment only through these interfaces. A
 * browser panel backs them with its runtime (`panel.stateArgs`, the panel rpc,
 * shell notifications); a Durable Object backs `StateArgsPort` with its own
 * storage and omits the browser-only ports.
 */
import type { RpcCaller, RpcClient } from "@vibestudio/rpc";
import type { WorkspaceReviewWaiter } from "../../provisional-agent-lifecycle.js";
import type { InstalledAgentRecord } from "./installed-agents.js";

/**
 * The durable host state a chat surface owns. In the chat panel these are the
 * panel's state args; extra keys owned by the surface (presentation, action
 * bar, focus requests, …) may live beside them and are preserved untouched.
 */
export interface ChatHostState {
  /** The conversation channel. Absent until bootstrap mints and persists one. */
  channelName?: string;
  /** Agents this host added; recovery re-subscribes any that are missing. */
  installedAgents?: InstalledAgentRecord[];
  /** Pinned agent worker source / class for the first agent. */
  agentSource?: string;
  agentClass?: string;
  /** Host-level agent config layered over workspace defaults for new agents. */
  agentConfig?: Record<string, unknown>;
  /** System prompt applied to agents this host creates. */
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace-vibestudio" | "replace";
  /** Per-fork read cursors (channelId → last-seen head seq). */
  forkCursors?: Record<string, number>;
}

/** A partial update; `null` clears a key. */
export type ChatHostStatePatch = {
  [K in keyof ChatHostState]?: ChatHostState[K] | null;
};

/**
 * Durable host state. `get()` must return the latest committed value
 * synchronously (the controller re-reads it at every decision instead of
 * trusting a captured copy, so concurrent patches are never clobbered).
 * `patch()` resolves once durable; a rejection that carries a pending
 * workspace review is retried by the controller after the review resolves.
 * `subscribe()` reports changes made by anyone (including this controller).
 */
export interface StateArgsPort {
  get(): ChatHostState;
  patch(partial: ChatHostStatePatch): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** RPC caller for host services ("main" and workspace Durable Objects). */
export interface ChatHostRpc {
  call: RpcCaller["call"];
}

/** Actual RPC transport status and completed recovery-generation observations. */
export type ChatHostConnectionPort = Pick<RpcClient, "status" | "onStatusChange" | "onRecovery">;

export interface ChatHostNotification {
  type: "info" | "warning" | "error";
  title: string;
  message?: string;
}

/**
 * Workspace events the controller listens to: a pending workspace review was
 * added or decided, the workspace configuration changed, or a publication
 * changed the workspace's units (host event `workspace:units-changed`). They
 * drive model refresh, agent catalog reads and installed-agent recovery; the
 * controller never polls.
 */
export type ChatHostWorkspaceEvent =
  | "approvals-changed"
  | "workspace-config-changed"
  | "units-changed";

export interface ChatHostPorts {
  rpc: ChatHostRpc;
  /** The workspace context this host runs in; agents are created in it. */
  contextId: string | undefined;
  state: StateArgsPort;
  /** Resolve once an exact workspace review is decided (approve or deny). */
  waitForReview?: WorkspaceReviewWaiter;
  /** RPC transport lifecycle; model discovery is re-read after generation recovery. */
  connection?: ChatHostConnectionPort;
  /**
   * Surface a failure of a user action that no snapshot field renders (e.g.
   * removing an agent failed). Failures the snapshot carries
   * (`modelSettingsError`, `agentCatalogError`, `recovery.error`) are never
   * also notified, so a host never shows the same failure twice.
   */
  notify?: (notification: ChatHostNotification) => void | Promise<unknown>;
  /**
   * Subscribe to a workspace event. Approval changes can unblock channel
   * bootstrap, model settings and the chat connection; config changes refresh
   * model settings.
   */
  onWorkspaceEvent?: (event: ChatHostWorkspaceEvent, handler: () => void) => () => void;
  /** Local model runtime (extension). Absent where none is installed. */
  localModels?: {
    installModel(modelRef: string): Promise<void>;
    /** Model list, server state or download progress changed. */
    onChange(handler: () => void): () => void;
  };
  /**
   * Re-run work after the host transport recovers. `key` must be unique per
   * host instance.
   */
  recoveryCoordinator?: {
    registerResubscribeHandler(
      key: string,
      handler: () => Promise<void> | void,
      options?: { includeCurrentGeneration?: boolean }
    ): () => void;
  };
  /** Unique id of this host instance (panel slot id); scopes recovery keys. */
  instanceId: string;
  /** Random id source (tests make it deterministic). */
  randomUuid?: () => string;
}
