/**
 * What the terminal chat needs from whoever launches it. Both launch forms
 * (the terminal app, running in the workspace, and the terminal client,
 * running on the person's computer) supply their own ports through this one
 * input; tests construct it directly. Nothing else in the app knows how it
 * was launched.
 */
import type { RpcClient } from "@vibestudio/rpc";

/** The RPC surface the chat uses: an authenticated client of the workspace gateway. */
export type ChatRpc = RpcClient;

/**
 * Durable per-session state held server-side for this terminal session.
 * `get()` is synchronous (latest committed value); `patch()` resolves once
 * durable and `null` deletes a key; `subscribe()` reports every change.
 */
export interface SessionStateStore {
  get(): Readonly<Record<string, unknown>>;
  patch(partial: Record<string, unknown>): Promise<void>;
  subscribe(listener: () => void): () => void;
}

/** Files the chat may read and write, on whichever machine the launcher serves. */
export interface ChatFiles {
  /** Read a file for an attachment; the path is as the person typed it. */
  read(
    path: string,
    options?: { signal?: AbortSignal }
  ): Promise<{ name: string; mimeType: string; bytes: Uint8Array }>;
  /**
   * Write an export to `path`, a destination the person confirmed (the chat
   * suggests one and lets them edit it). Returns the path as written.
   */
  writeExport(
    path: string,
    contents: string,
    options?: { signal?: AbortSignal }
  ): Promise<string>;
}

export interface TerminalChatBootstrap {
  rpc: ChatRpc;
  /** The workspace context this terminal session was launched in. */
  contextId: string;
  /** Stable id of this terminal session (scopes recovery keys and the participant id). */
  sessionId: string;
  state: SessionStateStore;
  /**
   * Null when the launcher grants no file access (the terminal client without
   * the `local-files` capability): attaching and exporting then explain why
   * they are unavailable instead of failing obscurely.
   */
  files: ChatFiles | null;
}
