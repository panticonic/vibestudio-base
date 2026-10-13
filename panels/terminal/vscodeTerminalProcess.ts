/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  PtyStreamAcknowledger,
  PtyStreamCursor,
  readPtyStream,
  type PtyStreamEvent,
} from "@workspace/pty-stream";
import type { ShellApi } from "./types.js";

export type VscodeProcessDataEvent = {
  /** Output decoded with a streaming UTF-8 decoder (exact across chunk boundaries). */
  data: string;
  /** Output bytes this event carries: what the frontend acknowledges once parsed. */
  byteLength: number;
  trackCommit: boolean;
};

/** Re-attach when the panel's connection to the server recovers. */
export interface TerminalRecovery {
  registerResubscribeHandler(name: string, fn: () => Promise<void> | void): () => void;
}

export type VscodeTerminalProcessBridgeOptions = {
  sessionId: string;
  shell: Pick<ShellApi, "attach" | "acknowledge" | "write" | "resize">;
  recovery: TerminalRecovery;
  /** The frontend's current size, sent on a fresh attach so full-screen programs redraw. */
  size(): { cols: number; rows: number } | undefined;
  onData(event: VscodeProcessDataEvent): void;
  /** The session's scrollback was cleared: clear the frontend before more data. */
  onReset(): void;
  /** Output was trimmed before this client read it. */
  onGap(lostBytes: number): void;
  onExit(exit: { code: number | null; signal?: string }): void;
  onError(error: string): void;
  onRecovered?(): void;
};

/**
 * vibestudio connectivity adapter for VS Code's terminal process-manager role.
 *
 * It holds one attachment to the shell extension's framed output stream
 * (`@workspace/pty-stream`): the first attach replays the retained output and
 * asks the program to redraw at this frontend's size; later attaches resume
 * exactly after the last byte this client consumed. A transport loss ends the
 * stream, and the panel connection's recovery (resubscribe) re-attaches; an
 * `exit` frame ends it for good. Flow control acknowledges parsed bytes.
 */
export class VscodeTerminalProcessBridge {
  private attachment: AbortController | null = null;
  private disposed = false;
  private exited = false;
  private live = false;
  private generation = 0;
  private failed = false;
  private readonly cursor = new PtyStreamCursor();
  private decoder = new TextDecoder();
  private acknowledger: PtyStreamAcknowledger | null = null;
  private unregisterRecovery: (() => void) | null = null;

  constructor(private readonly options: VscodeTerminalProcessBridgeOptions) {}

  async start(): Promise<void> {
    this.unregisterRecovery = this.options.recovery.registerResubscribeHandler(
      `terminal:${this.options.sessionId}`,
      () => (this.live || this.exited || this.disposed ? undefined : this.attach())
    );
    await this.attach();
  }

  private async attach(): Promise<void> {
    const generation = ++this.generation;
    this.attachment?.abort();
    this.attachment = null;
    const after = this.cursor.resumeAfter();
    const size = after ? undefined : this.options.size();
    let response: Response;
    try {
      response = await this.options.shell.attach(this.options.sessionId, {
        ...(after ? { after } : {}),
        ...(size ? { size } : {}),
      });
    } catch (err) {
      this.fail(generation, err);
      return;
    }
    if (this.disposed || generation !== this.generation) {
      void response.body?.cancel().catch(() => {});
      return;
    }
    if (!response.body) {
      this.fail(generation, new Error("The shell returned no terminal output stream"));
      return;
    }
    this.live = true;
    if (this.failed) {
      this.failed = false;
      this.options.onRecovered?.();
    }
    const attachment = new AbortController();
    this.attachment = attachment;
    void this.read(readPtyStream(response.body, attachment.signal), generation);
  }

  private async read(
    reader: AsyncGenerator<PtyStreamEvent, void, undefined>,
    generation: number
  ): Promise<void> {
    try {
      for await (const event of reader) {
        if (this.disposed || generation !== this.generation) return;
        this.handle(event);
      }
      if (this.disposed || generation !== this.generation) return;
      this.live = false;
      if (!this.exited) {
        this.failed = true;
        this.options.onError("Terminal output disconnected; it resumes when the connection returns.");
      }
    } catch (err) {
      this.fail(generation, err);
    }
  }

  private handle(event: PtyStreamEvent): void {
    this.cursor.apply(event);
    switch (event.kind) {
      case "hello": {
        const sessionId = this.options.sessionId;
        const attachId = event.attachId;
        this.acknowledger = new PtyStreamAcknowledger(
          (bytes) => this.options.shell.acknowledge(sessionId, attachId, bytes),
          (error) =>
            console.warn(`[terminal] Failed to acknowledge output for session ${sessionId}:`, error)
        );
        return;
      }
      case "data": {
        const data = this.decoder.decode(event.bytes, { stream: true });
        this.options.onData({ data, byteLength: event.bytes.byteLength, trackCommit: false });
        return;
      }
      case "reset":
        this.decoder = new TextDecoder();
        this.options.onReset();
        return;
      case "gap":
        this.decoder = new TextDecoder();
        this.options.onGap(event.to - event.from);
        return;
      case "exit":
        this.exited = true;
        this.live = false;
        this.options.onExit({ code: event.code, ...(event.signal ? { signal: event.signal } : {}) });
        return;
    }
  }

  private fail(generation: number, err: unknown): void {
    if (this.disposed || generation !== this.generation) return;
    this.live = false;
    this.failed = true;
    this.options.onError(err instanceof Error ? err.message : "Terminal output failed");
  }

  async write(data: string): Promise<void> {
    await this.options.shell.write(this.options.sessionId, data);
  }

  resize(cols: number, rows: number): Promise<void> {
    return this.options.shell.resize(this.options.sessionId, cols, rows);
  }

  /** The frontend parsed `bytes` of output. */
  acknowledge(bytes: number): void {
    this.acknowledger?.consumed(bytes);
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.unregisterRecovery?.();
    this.unregisterRecovery = null;
    this.attachment?.abort();
    this.attachment = null;
  }
}
