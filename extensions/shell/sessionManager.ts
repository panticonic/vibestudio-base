import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nodePty from "node-pty";
import {
  encodePtyStreamEvent,
  FLOW_HIGH_WATERMARK_BYTES,
  FLOW_LOW_WATERMARK_BYTES,
  type PtyAttachOptions,
  type PtyStreamEvent,
} from "@workspace/pty-stream";
import { nodeSetInterval, nodeSetTimeout } from "./nodeTimers.js";
import { createDetectionState, scanChunk, type DetectionState } from "./portDetector.js";
import type { OpenRequest, ScrollCursor, SessionInfo, SessionInfoEvent } from "./types.js";

type PtyProcess = {
  pid: number;
  /** Spawned with `encoding: null`: raw output bytes, never decoded. */
  onData(cb: (data: Buffer | string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
  kill(signal?: string): void;
};

/** Who a session belongs to, and which principal opened it. */
export interface SessionOwner {
  /**
   * The owning person (`user:<userId>`) when the caller acts for one, so the
   * session can be resumed from any of their devices and clients; otherwise
   * the exact caller (`caller:<callerId>`), e.g. for system principals.
   */
  key: string;
  launchedBy: { callerId: string; callerKind: string };
}

/** One attached client: its stream and its flow-control account (bytes). */
interface Attachment {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  unacknowledgedBytes: number;
}

interface Session {
  id: string;
  owner: SessionOwner;
  label: string;
  command: { argv: string[]; cwd: string };
  contextId?: string;
  revisionLabel?: string;
  pid: number;
  cols: number;
  rows: number;
  startedAt: number;
  lastActivityAt: number;
  alive: boolean;
  exit?: { code: number | null; signal?: string; at: number };
  pty?: PtyProcess;
  /** Retained output window; `chunks[0].start` is the oldest retained byte. */
  chunks: Array<{ start: number; end: number; bytes: Uint8Array }>;
  /** Monotonic byte cursor: the address of the next output byte. Never reset. */
  cursor: number;
  /** Incremented when the scrollback is cleared; positions of older epochs are void. */
  epoch: number;
  scrollbackLimit: number;
  bytesOut: number;
  detection: DetectionState;
  meta: Record<string, unknown>;
  attachments: Map<string, Attachment>;
  exitWaiters: Array<(value: { exitCode: number | null; signal?: string }) => void>;
  flowPaused: boolean;
}

export interface SessionManagerHooks {
  onExit?(sessionId: string): void;
  onDispose?(sessionId: string): void;
}

export interface SessionManagerOptions {
  janitorIntervalMs?: number;
  exitedSessionTtlMs?: number;
  watchAllHeartbeatMs?: number;
  /**
   * Resolve display-only `detectedAgent` metadata from structured argv.
   * Omitted ⇒ no agent tagging.
   */
  detectAgent?: (argv: string[]) => { kind: string; title?: string } | undefined;
  /** Resolve a context's exact semantic-state label. Non-context sessions
   * retain a best-effort local Git branch label. */
  resolveContextRevision?: (contextId: string) => Promise<string | undefined>;
}

const SCROLLBACK_BYTES = 256 * 1024;
const MAX_SCROLLBACK_BYTES = 8 * 1024 * 1024;
const META_BYTES = 16 * 1024;
const EXITED_SESSION_TTL_MS = 60 * 60_000;
const JANITOR_INTERVAL_MS = 30 * 60_000;
const WATCH_ALL_HEARTBEAT_MS = 15_000;

type Watcher = {
  owner: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat?: NodeJS.Timeout;
};

type PendingSnapshot = {
  session: Session;
  timer: NodeJS.Timeout;
};

/** Skip UTF-8 continuation bytes so a trimmed window starts on a character. */
function characterStart(bytes: Uint8Array): number {
  let offset = 0;
  while (offset < bytes.byteLength && offset < 3 && (bytes[offset]! & 0xc0) === 0x80) offset += 1;
  return offset;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private allWatchers = new Set<Watcher>();
  private lastSnapshotAt = new Map<string, number>();
  private pendingSnapshots = new Map<string, PendingSnapshot>();
  private readonly pty = nodePty as {
    spawn: (file: string, args: string[], opts: unknown) => PtyProcess;
  };
  private janitor: NodeJS.Timeout;
  private exitedSessionTtlMs: number;
  private watchAllHeartbeatMs: number;
  private readonly detectAgent?: (argv: string[]) => { kind: string; title?: string } | undefined;
  private readonly resolveContextRevision?: (contextId: string) => Promise<string | undefined>;

  constructor(
    private readonly hooks: SessionManagerHooks = {},
    opts: SessionManagerOptions = {}
  ) {
    this.exitedSessionTtlMs = opts.exitedSessionTtlMs ?? EXITED_SESSION_TTL_MS;
    this.watchAllHeartbeatMs = opts.watchAllHeartbeatMs ?? WATCH_ALL_HEARTBEAT_MS;
    this.detectAgent = opts.detectAgent;
    this.resolveContextRevision = opts.resolveContextRevision;
    this.janitor = nodeSetInterval(
      () => this.sweepExitedSessions(),
      opts.janitorIntervalMs ?? JANITOR_INTERVAL_MS
    );
    this.janitor.unref?.();
  }

  get ptyAvailable(): boolean {
    return !!this.pty;
  }

  open(
    req: Omit<OpenRequest, "cwd" | "env"> & {
      cwd: string;
      env: NodeJS.ProcessEnv;
      contextId?: string;
    },
    owner: SessionOwner
  ): { sessionId: string } {
    const id = randomUUID();
    const command = req.command ?? process.env["SHELL"] ?? "/bin/bash";
    const args = req.args ?? [];
    const label = req.label ?? [command, ...args].join(" ");
    const session: Session = {
      id,
      owner,
      label,
      command: { argv: [command, ...args], cwd: req.cwd },
      ...(req.contextId ? { contextId: req.contextId } : {}),
      pid: -1,
      cols: req.cols,
      rows: req.rows,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      alive: true,
      chunks: [],
      cursor: 0,
      epoch: 0,
      scrollbackLimit: SCROLLBACK_BYTES,
      bytesOut: 0,
      detection: createDetectionState(),
      meta: {},
      attachments: new Map(),
      exitWaiters: [],
      flowPaused: false,
    };

    const pty = this.pty.spawn(command, args, {
      name: "xterm-256color",
      cols: req.cols,
      rows: req.rows,
      cwd: req.cwd,
      env: req.env,
      encoding: null,
    });
    session.pid = pty.pid;
    session.pty = pty;
    pty.onData((data) => this.record(session, typeof data === "string" ? Buffer.from(data) : data));
    pty.onExit((event) =>
      this.markExit(session, event.exitCode, event.signal ? `SIG${event.signal}` : undefined)
    );
    this.sessions.set(id, session);
    this.emitToOwner(session.owner.key, {
      type: "opened",
      sessionId: id,
      info: this.info(session),
    });
    this.refreshRevisionLabel(session);
    return { sessionId: id };
  }

  requireOwner(sessionId: string, owner: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw Object.assign(new Error("Unknown session"), { code: "ENOENT" });
    if (session.owner.key !== owner) {
      throw Object.assign(new Error("Not the session owner"), { code: "EACCES" });
    }
    return session;
  }

  list(owner: string): SessionInfo[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.owner.key === owner)
      .map((session) => this.info(session));
  }

  info(session: Session): SessionInfo {
    const detectedAgent = this.detectAgent?.(session.command.argv);
    return {
      sessionId: session.id,
      owner: session.owner.key,
      launchedBy: session.owner.launchedBy,
      label: session.label,
      command: session.command,
      ...(session.contextId ? { contextId: session.contextId } : {}),
      ...(session.revisionLabel ? { revisionLabel: session.revisionLabel } : {}),
      pid: session.pid,
      pgid: session.pid,
      cols: session.cols,
      rows: session.rows,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      alive: session.alive,
      ...(session.exit ? { exit: session.exit } : {}),
      processTree: [],
      listeningPorts: [],
      detectedPorts: session.detection.detectedPorts,
      detectedUrls: session.detection.detectedUrls,
      bytesOut: session.bytesOut,
      meta: session.meta,
      ...(detectedAgent ? { detectedAgent } : {}),
    };
  }

  dispose(session: Session): void {
    this.clearPendingSnapshot(session.id);
    session.pty?.kill("SIGTERM");
    this.closeAttachments(session);
    for (const waiter of session.exitWaiters.splice(0)) {
      waiter({ exitCode: session.exit?.code ?? null, signal: session.exit?.signal });
    }
    this.sessions.delete(session.id);
    this.lastSnapshotAt.delete(session.id);
    this.hooks.onDispose?.(session.id);
    this.emitToOwner(session.owner.key, { type: "disposed", sessionId: session.id });
  }

  ownerOf(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.owner.key;
  }

  ownerFor(sessionId: string): SessionOwner | undefined {
    return this.sessions.get(sessionId)?.owner;
  }

  cwdOf(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.command.cwd;
  }

  contextIdOf(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.contextId;
  }

  setLabel(session: Session, label: string): void {
    session.label = label.slice(0, 80);
    this.emitSnapshot(session);
  }

  restart(
    session: Session,
    req: { env: NodeJS.ProcessEnv; cols?: number; rows?: number; command?: string; args?: string[] }
  ): { sessionId: string } {
    const [originalCommand, ...originalArgs] = session.command.argv;
    const command = req.command ?? originalCommand;
    const args = req.args ?? originalArgs;
    return this.open(
      {
        command,
        args,
        cwd: session.command.cwd,
        env: req.env,
        cols: req.cols ?? session.cols,
        rows: req.rows ?? session.rows,
        label: session.label,
        ...(session.contextId ? { contextId: session.contextId } : {}),
      },
      session.owner
    );
  }

  write(session: Session, data: string): void {
    session.pty?.write(data);
  }

  resize(session: Session, cols: number, rows: number): void {
    session.cols = cols;
    session.rows = rows;
    session.pty?.resize(cols, rows);
    this.emitSnapshot(session);
  }

  /**
   * Make the program in the foreground redraw at `cols`×`rows`. Resizing
   * delivers SIGWINCH only when the size changes, so an unchanged size gets an
   * explicit SIGWINCH to the terminal's foreground process group.
   */
  private redraw(session: Session, cols: number, rows: number): void {
    if (!session.alive) return;
    if (cols !== session.cols || rows !== session.rows) {
      this.resize(session, cols, rows);
      return;
    }
    void foregroundProcessGroup(session.pid).then((group) => {
      if (!session.alive) return;
      try {
        process.kill(-group, "SIGWINCH");
      } catch {
        // The group exited between lookup and signal; nothing is left to redraw.
      }
    });
  }

  kill(session: Session, signal: NodeJS.Signals = "SIGTERM"): void {
    session.pty?.kill(signal);
  }

  getScrollback(
    session: Session,
    maxBytes = session.scrollbackLimit
  ): { text: string; cursor: ScrollCursor } {
    const boundedMaxBytes = Math.min(MAX_SCROLLBACK_BYTES, Math.max(1024, maxBytes));
    const bytes = this.window(session, Math.max(0, session.cursor - boundedMaxBytes));
    const aligned = bytes.subarray(characterStart(bytes));
    return {
      text: Buffer.from(aligned.buffer, aligned.byteOffset, aligned.byteLength).toString("utf8"),
      cursor: String(session.cursor),
    };
  }

  setScrollbackLimit(session: Session, maxBytes: number): void {
    session.scrollbackLimit = Math.min(MAX_SCROLLBACK_BYTES, Math.max(1024, Math.floor(maxBytes)));
    this.trimScrollback(session);
    this.emitSnapshot(session);
  }

  /** Drop the retained output; attached clients receive `reset` and clear. */
  clearScrollback(session: Session): void {
    session.chunks = [];
    session.epoch += 1;
    for (const attachment of session.attachments.values()) {
      this.send(attachment, { kind: "reset", epoch: session.epoch, cursor: session.cursor });
    }
    this.emitSnapshot(session);
  }

  /**
   * Attach to the session's output as a framed stream (`@workspace/pty-stream`).
   * The stream opens with `hello`, replays the retained window after
   * `opts.after` (with `reset` when that position belongs to an earlier epoch,
   * or `gap` when part of it was trimmed), then follows live output until the
   * process exits or the attacher cancels.
   */
  attach(session: Session, opts: PtyAttachOptions = {}): Response {
    const attachment: Attachment = {
      id: randomUUID(),
      controller: undefined as unknown as ReadableStreamDefaultController<Uint8Array>,
      unacknowledgedBytes: 0,
    };
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        attachment.controller = controller;
        const start = this.retainedStart(session);
        this.send(attachment, {
          kind: "hello",
          attachId: attachment.id,
          epoch: session.epoch,
          start,
          cursor: session.cursor,
          alive: session.alive,
          cols: session.cols,
          rows: session.rows,
        });
        let from = start;
        const after = opts.after;
        if (after && after.epoch === session.epoch && after.cursor <= session.cursor) {
          if (after.cursor < start) {
            this.send(attachment, { kind: "gap", from: after.cursor, to: start });
          } else {
            from = after.cursor;
          }
        } else if (after) {
          // A position from an earlier epoch (or past the end) cannot be
          // continued: the client starts over from the retained window.
          this.send(attachment, { kind: "reset", epoch: session.epoch, cursor: start });
        }
        const replay = this.window(session, from);
        if (replay.byteLength > 0) {
          this.send(attachment, { kind: "data", at: from, bytes: replay });
          attachment.unacknowledgedBytes += replay.byteLength;
        }
        if (!session.alive) {
          this.send(attachment, {
            kind: "exit",
            code: session.exit?.code ?? null,
            ...(session.exit?.signal ? { signal: session.exit.signal } : {}),
          });
          controller.close();
          return;
        }
        session.attachments.set(attachment.id, attachment);
        this.updateFlowControl(session);
        if (opts.size) this.redraw(session, opts.size.cols, opts.size.rows);
      },
      cancel: () => {
        session.attachments.delete(attachment.id);
        this.updateFlowControl(session);
      },
    });
    return new Response(stream, {
      headers: { "content-type": "application/vnd.vibestudio.pty-stream" },
    });
  }

  /** An attacher consumed `bytes` of output it was sent. */
  acknowledge(session: Session, attachId: string, bytes: number): void {
    const attachment = session.attachments.get(attachId);
    if (!attachment) return; // Detached meanwhile; its account is already gone.
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    attachment.unacknowledgedBytes = Math.max(
      0,
      attachment.unacknowledgedBytes - Math.floor(bytes)
    );
    this.updateFlowControl(session);
  }

  awaitExit(session: Session): Promise<{ exitCode: number | null; signal?: string }> {
    if (!session.alive)
      return Promise.resolve({
        exitCode: session.exit?.code ?? null,
        signal: session.exit?.signal,
      });
    return new Promise((resolve) => session.exitWaiters.push(resolve));
  }

  watchInfo(session: Session): Response {
    const encoder = new TextEncoder();
    let timer: NodeJS.Timeout | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const send = () =>
          controller.enqueue(encoder.encode(`${JSON.stringify(this.info(session))}\n`));
        send();
        timer = nodeSetInterval(send, 1000);
      },
      cancel: () => {
        if (timer) clearInterval(timer);
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
  }

  watchAllInfo(owner: string): Response {
    let watcher: Watcher | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        watcher = {
          owner,
          controller,
        };
        this.allWatchers.add(watcher);
        this.sendToWatcher(watcher, { type: "snapshot-batch", sessions: this.list(owner) });
      },
      cancel: () => {
        if (!watcher) return;
        if (watcher.heartbeat) clearTimeout(watcher.heartbeat);
        this.allWatchers.delete(watcher);
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
  }

  setMeta(session: Session, key: string, value: unknown): void {
    const next = { ...session.meta, [key]: value };
    this.assertMetaSize(next);
    session.meta = next;
    this.emitSnapshot(session);
  }

  getMeta(session: Session, key?: string): unknown {
    return key ? session.meta[key] : session.meta;
  }

  deleteMeta(session: Session, key: string): void {
    if (!(key in session.meta)) return;
    const next = { ...session.meta };
    delete next[key];
    session.meta = next;
    this.emitSnapshot(session);
  }

  setMetaById(sessionId: string, key: string, value: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw Object.assign(new Error("Unknown session"), { code: "ENOENT" });
    this.setMeta(session, key, value);
  }

  getMetaById(sessionId: string, key?: string): unknown {
    const session = this.sessions.get(sessionId);
    if (!session) throw Object.assign(new Error("Unknown session"), { code: "ENOENT" });
    return this.getMeta(session, key);
  }

  deleteMetaById(sessionId: string, key: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw Object.assign(new Error("Unknown session"), { code: "ENOENT" });
    this.deleteMeta(session, key);
  }

  setLabelById(sessionId: string, label: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw Object.assign(new Error("Unknown session"), { code: "ENOENT" });
    this.setLabel(session, label);
  }

  writeById(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw Object.assign(new Error("Unknown session"), { code: "ENOENT" });
    this.write(session, text);
  }

  sweepExitedSessionsForTest(): void {
    this.sweepExitedSessions();
  }

  private refreshRevisionLabel(session: Session): void {
    // Context sessions display their exact semantic working head. Only
    // non-context sessions probe a local `.git` checkout.
    const probe =
      session.contextId && this.resolveContextRevision
        ? this.resolveContextRevision(session.contextId)
        : readGitBranch(session.command.cwd);
    void probe.then((branch) => {
      if (!branch) return;
      const current = this.sessions.get(session.id);
      if (current !== session) return;
      session.revisionLabel = branch;
      this.emitSnapshot(session);
    });
  }

  private record(session: Session, bytes: Uint8Array): void {
    const chunk = new Uint8Array(bytes);
    const start = session.cursor;
    session.cursor += chunk.byteLength;
    session.bytesOut += chunk.byteLength;
    session.lastActivityAt = Date.now();
    session.chunks.push({ start, end: session.cursor, bytes: chunk });
    this.trimScrollback(session);
    scanChunk(session.detection, chunk);
    for (const attachment of session.attachments.values()) {
      this.send(attachment, { kind: "data", at: start, bytes: chunk });
      attachment.unacknowledgedBytes += chunk.byteLength;
    }
    this.updateFlowControl(session);
    this.emitSnapshot(session);
  }

  /**
   * Pause the PTY while any attachment is more than the high watermark behind;
   * resume once every attachment is back under the low watermark.
   */
  private updateFlowControl(session: Session): void {
    let behind = 0;
    for (const attachment of session.attachments.values()) {
      behind = Math.max(behind, attachment.unacknowledgedBytes);
    }
    if (!session.flowPaused && behind > FLOW_HIGH_WATERMARK_BYTES) {
      session.flowPaused = true;
      session.pty?.pause();
    } else if (session.flowPaused && behind <= FLOW_LOW_WATERMARK_BYTES) {
      session.flowPaused = false;
      session.pty?.resume();
    }
  }

  private send(attachment: Attachment, event: PtyStreamEvent): void {
    for (const frame of encodePtyStreamEvent(event)) attachment.controller.enqueue(frame);
  }

  private closeAttachments(session: Session): void {
    for (const attachment of session.attachments.values()) {
      try {
        attachment.controller.close();
      } catch {
        // The attacher cancelled concurrently; its stream is already closed.
      }
    }
    session.attachments.clear();
    this.updateFlowControl(session);
  }

  private retainedStart(session: Session): number {
    return session.chunks[0]?.start ?? session.cursor;
  }

  /** The retained bytes from `from` (clamped to the window) to the cursor. */
  private window(session: Session, from: number): Uint8Array {
    const parts = session.chunks
      .filter((chunk) => chunk.end > from)
      .map((chunk) => (chunk.start < from ? chunk.bytes.subarray(from - chunk.start) : chunk.bytes));
    return parts.length === 1 ? parts[0]! : new Uint8Array(Buffer.concat(parts));
  }

  private markExit(session: Session, code: number | null, signal?: string): void {
    this.clearPendingSnapshot(session.id);
    session.alive = false;
    session.exit = { code, ...(signal ? { signal } : {}), at: Date.now() };
    for (const waiter of session.exitWaiters.splice(0)) waiter({ exitCode: code, signal });
    for (const attachment of session.attachments.values()) {
      this.send(attachment, { kind: "exit", code, ...(signal ? { signal } : {}) });
    }
    this.closeAttachments(session);
    this.hooks.onExit?.(session.id);
    this.emitToOwner(session.owner.key, {
      type: "exit",
      sessionId: session.id,
      exit: session.exit,
    });
    this.emitSnapshotNow(session);
  }

  private trimScrollback(session: Session): void {
    const start = Math.max(0, session.cursor - session.scrollbackLimit);
    while (session.chunks.length && session.chunks[0]!.end <= start) {
      session.chunks.shift();
    }
    const first = session.chunks[0];
    if (first && first.start < start) {
      const trimmed = first.bytes.subarray(start - first.start);
      // Start the window on a character boundary so a replay never begins
      // inside a UTF-8 sequence.
      const aligned = trimmed.subarray(characterStart(trimmed));
      session.chunks[0] = {
        start: first.end - aligned.byteLength,
        end: first.end,
        bytes: aligned,
      };
      if (aligned.byteLength === 0) session.chunks.shift();
    }
  }

  private emitSnapshot(session: Session): void {
    const now = Date.now();
    const last = this.lastSnapshotAt.get(session.id) ?? 0;
    const elapsed = now - last;
    if (elapsed >= 1000) {
      this.emitSnapshotNow(session);
      return;
    }
    if (this.pendingSnapshots.has(session.id)) return;
    const timer = nodeSetTimeout(() => {
      this.pendingSnapshots.delete(session.id);
      if (this.sessions.has(session.id)) this.emitSnapshotNow(session);
    }, 1000 - elapsed);
    timer.unref?.();
    this.pendingSnapshots.set(session.id, { session, timer });
  }

  private emitSnapshotNow(session: Session): void {
    this.lastSnapshotAt.set(session.id, Date.now());
    this.emitToOwner(session.owner.key, {
      type: "snapshot",
      sessionId: session.id,
      info: this.info(session),
    });
  }

  private clearPendingSnapshot(sessionId: string): void {
    const pending = this.pendingSnapshots.get(sessionId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingSnapshots.delete(sessionId);
  }

  private emitToOwner(owner: string, event: SessionInfoEvent): void {
    for (const watcher of this.allWatchers) {
      if (watcher.owner !== owner) continue;
      try {
        this.sendToWatcher(watcher, event);
      } catch {
        if (watcher.heartbeat) clearTimeout(watcher.heartbeat);
        this.allWatchers.delete(watcher);
      }
    }
  }

  private sendToWatcher(watcher: Watcher, event: SessionInfoEvent): void {
    watcher.controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
    if (watcher.heartbeat) clearTimeout(watcher.heartbeat);
    watcher.heartbeat = nodeSetTimeout(() => {
      try {
        this.sendToWatcher(watcher, { type: "heartbeat", at: Date.now() });
      } catch {
        if (watcher.heartbeat) clearTimeout(watcher.heartbeat);
        this.allWatchers.delete(watcher);
      }
    }, this.watchAllHeartbeatMs);
    watcher.heartbeat.unref?.();
  }

  private sweepExitedSessions(): void {
    const cutoff = Date.now() - this.exitedSessionTtlMs;
    for (const session of this.sessions.values()) {
      if (!session.alive && session.lastActivityAt < cutoff && session.attachments.size === 0) {
        this.dispose(session);
      }
    }
  }

  private assertMetaSize(meta: Record<string, unknown>): void {
    const bytes = Buffer.byteLength(JSON.stringify(meta), "utf8");
    if (bytes > META_BYTES) {
      throw Object.assign(new Error("Session metadata exceeds 16KB"), { code: "E2BIG" });
    }
  }
}

function readGitBranch(cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let child: ReturnType<typeof spawn> | undefined;
    const finish = (branch?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(branch);
    };
    const timer = setTimeout(() => {
      child?.kill("SIGKILL");
      finish();
    }, 500);
    try {
      child = spawn("git", ["-C", cwd, "branch", "--show-current"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < 1024) stdout += chunk.toString("utf8");
      });
      child.on("error", () => finish());
      child.on("close", (code) => {
        const branch = stdout.trim();
        finish(code === 0 && branch ? branch.slice(0, 120) : undefined);
      });
    } catch {
      // Branch context is a UI affordance only; session startup should not fail if git is unavailable.
      finish();
    }
  });
}

/**
 * The foreground process group of the session's terminal (who should redraw).
 * Linux reads it from /proc (`tpgid`); elsewhere `ps` reports it.
 */
async function foregroundProcessGroup(pid: number): Promise<number> {
  if (process.platform === "linux") {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => null);
    // Fields after the parenthesised command name: state ppid pgrp session tty_nr tpgid.
    const fields = stat?.slice(stat.lastIndexOf(")") + 2).split(" ");
    const tpgid = Number(fields?.[5]);
    return Number.isInteger(tpgid) && tpgid > 0 ? tpgid : pid;
  }
  return new Promise((resolve) => {
    let out = "";
    const child = spawn("ps", ["-o", "tpgid=", "-p", String(pid)], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    child.on("error", () => resolve(pid));
    child.on("close", () => {
      const tpgid = Number(out.trim());
      resolve(Number.isInteger(tpgid) && tpgid > 0 ? tpgid : pid);
    });
  });
}
