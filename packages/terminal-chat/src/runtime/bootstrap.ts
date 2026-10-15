/**
 * What the terminal chat needs from whoever launches it. The program's entry
 * module obtains these from the trusted launch material (gateway URL,
 * principal grant, context id); tests construct them directly. Nothing else
 * in the app knows how it was launched.
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

/** Files on the machine the program runs on (the workspace runtime). */
export interface ChatFiles {
  /** Read a file for an attachment; the path is as the person typed it. */
  read(
    path: string,
    options?: { signal?: AbortSignal }
  ): Promise<{ name: string; mimeType: string; bytes: Uint8Array }>;
  /** Write an export; returns its portable workspace-relative path for trusted-browser Download. */
  writeExport(
    fileName: string,
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
  files: ChatFiles;
}
