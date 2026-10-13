import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readPtyStream, type PtyStreamEvent } from "@workspace/pty-stream";
import { SessionManager, type SessionOwner } from "./sessionManager.js";

const OWNER: SessionOwner = {
  key: "user:alice",
  launchedBy: { callerId: "panel:test", callerKind: "panel" },
};

describe("SessionManager janitor", () => {
  it("returns JSON-safe session info when no terminal agent is detected", async () => {
    const manager = new SessionManager({}, { janitorIntervalMs: 60 * 60_000 });
    const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
    const owner = OWNER;
    const opened = manager.open(
      {
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 5000)"],
        cwd: root,
        env: {},
        cols: 80,
        rows: 24,
      },
      owner
    );
    const session = manager.requireOwner(opened.sessionId, owner.key);

    const info = manager.info(session);

    expect(Object.hasOwn(info, "detectedAgent")).toBe(false);
    expect(JSON.parse(JSON.stringify(info))).toEqual(info);
    manager.dispose(session);
  });

  it("emits watch-all heartbeats only after an idle interval", async () => {
    vi.useFakeTimers();
    const manager = new SessionManager(
      {},
      { janitorIntervalMs: 60 * 60_000, watchAllHeartbeatMs: 40 }
    );
    const fakePty = new FakePty();
    (
      manager as unknown as {
        pty: { spawn: () => FakePty };
      }
    ).pty = { spawn: () => fakePty };
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const response = manager.watchAllInfo(OWNER.key);
      reader = response.body!.getReader();

      await expect(readEvent(reader)).resolves.toMatchObject({
        type: "snapshot-batch",
        sessions: [],
      });

      await vi.advanceTimersByTimeAsync(20);
      const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
      const opened = manager.open(
        {
          command: process.execPath,
          args: ["-e", "setTimeout(() => {}, 5000)"],
          cwd: root,
          env: {},
          cols: 80,
          rows: 24,
        },
        OWNER
      );
      await expect(readEvent(reader)).resolves.toMatchObject({
        type: "opened",
        sessionId: opened.sessionId,
      });

      const heartbeat = readEvent(reader, 100);
      const onHeartbeat = vi.fn();
      heartbeat.then(onHeartbeat, onHeartbeat);
      await vi.advanceTimersByTimeAsync(39);
      expect(onHeartbeat).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(heartbeat).resolves.toMatchObject({ type: "heartbeat" });

      manager.dispose(manager.requireOwner(opened.sessionId, OWNER.key));
    } finally {
      await reader?.cancel();
      vi.useRealTimers();
    }
  });

  it("disposes exited, old, listenerless sessions and preserves live sessions", async () => {
    const onDispose = vi.fn();
    const manager = new SessionManager({ onDispose }, { janitorIntervalMs: 60 * 60_000, exitedSessionTtlMs: 0 });
    const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
    const owner = OWNER;
    const live = manager.open({ command: process.execPath, args: ["-e", "setTimeout(() => {}, 5000)"], cwd: root, env: {}, cols: 80, rows: 24 }, owner);
    const exited = manager.open({ command: process.execPath, args: ["-e", ""], cwd: root, env: {}, cols: 80, rows: 24 }, owner);

    await manager.awaitExit(manager.requireOwner(exited.sessionId, owner.key));
    manager.sweepExitedSessionsForTest();

    expect(onDispose).toHaveBeenCalledWith(exited.sessionId);
    expect(() => manager.requireOwner(exited.sessionId, owner.key)).toThrow("Unknown session");
    expect(manager.requireOwner(live.sessionId, owner.key)).toBeTruthy();
    manager.dispose(manager.requireOwner(live.sessionId, owner.key));
  });

  it("releases an exit waiter when its caller cancels, leaving the process running", async () => {
    const manager = new SessionManager({ onDispose: vi.fn() });
    const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
    const opened = manager.open(
      { command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], cwd: root, env: {}, cols: 80, rows: 24 },
      OWNER
    );
    const session = manager.requireOwner(opened.sessionId, OWNER.key);
    const cancel = new AbortController();
    const waiting = manager.awaitExit(session, cancel.signal);
    cancel.abort(new Error("caller cancelled"));
    await expect(waiting).rejects.toThrow("caller cancelled");
    expect(session.exitWaiters).toHaveLength(0);
    expect(session.alive).toBe(true);
    manager.dispose(session);
  });

  it("preserves recently exited sessions until the TTL expires", async () => {
    const onDispose = vi.fn();
    const manager = new SessionManager({ onDispose }, { janitorIntervalMs: 60 * 60_000, exitedSessionTtlMs: 60_000 });
    const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
    const owner = OWNER;
    const opened = manager.open({ command: process.execPath, args: ["-e", ""], cwd: root, env: {}, cols: 80, rows: 24 }, owner);
    const session = manager.requireOwner(opened.sessionId, owner.key);

    await manager.awaitExit(session);
    manager.sweepExitedSessionsForTest();

    expect(onDispose).not.toHaveBeenCalledWith(opened.sessionId);
    expect(manager.requireOwner(opened.sessionId, owner.key)).toBeTruthy();
    manager.dispose(session);
  });

  it("sends reset to attached readers when scrollback is cleared and keeps the cursor", async () => {
    const { manager, fakePty, session } = await fakeSession();
    fakePty.emitData("before");
    const stream = events(manager.attach(session));
    await expect(stream.next()).resolves.toMatchObject({ value: { kind: "hello", epoch: 0, start: 0, cursor: 6 } });
    await expect(stream.next()).resolves.toMatchObject({ value: { kind: "data", at: 0 } });

    manager.clearScrollback(session);
    await expect(stream.next()).resolves.toMatchObject({ value: { kind: "reset", epoch: 1, cursor: 6 } });
    fakePty.emitData("after");
    const data = (await stream.next()).value as Extract<PtyStreamEvent, { kind: "data" }>;
    expect(data.at).toBe(6);
    expect(text(data.bytes)).toBe("after");
    await stream.return(undefined);
    manager.dispose(session);
  });

  it("replays exactly after a resume position, and reports trimmed or stale positions", async () => {
    const { manager, fakePty, session } = await fakeSession();
    fakePty.emitData("hello ");
    fakePty.emitData("world");

    const resumed = await collect(manager.attach(session, { after: { epoch: 0, cursor: 6 } }), 2);
    expect(resumed[1]).toMatchObject({ kind: "data", at: 6 });
    expect(text((resumed[1] as { bytes: Uint8Array }).bytes)).toBe("world");

    manager.setScrollbackLimit(session, 1024);
    fakePty.emitData("x".repeat(2000));
    const gapped = await collect(manager.attach(session, { after: { epoch: 0, cursor: 3 } }), 3);
    expect(gapped[0]).toMatchObject({ kind: "hello", start: 2011 - 1024 });
    expect(gapped[1]).toMatchObject({ kind: "gap", from: 3, to: 2011 - 1024 });
    expect(gapped[2]).toMatchObject({ kind: "data", at: 2011 - 1024 });

    manager.clearScrollback(session);
    const stale = await collect(manager.attach(session, { after: { epoch: 0, cursor: 2011 } }), 2);
    expect(stale[1]).toMatchObject({ kind: "reset", epoch: 1, cursor: 2011 });
    manager.dispose(session);
  });

  it("keeps output bytes exact and trims to a character boundary", async () => {
    const { manager, fakePty, session } = await fakeSession();
    manager.setScrollbackLimit(session, 1024);
    // "─" is three bytes; keeping the last 1024 of 1200 cuts one in half.
    fakePty.emitData(Buffer.from("─".repeat(400)));
    const [hello, data] = await collect(manager.attach(session), 2);
    const bytes = (data as { bytes: Uint8Array }).bytes;
    expect(bytes.byteLength).toBe(1023);
    expect(bytes[0]).toBe(0xe2);
    expect((hello as { start: number }).start).toBe(1200 - 1023);
    expect(text(bytes)).toBe("─".repeat(341));
    expect(manager.getScrollback(session).text).toBe("─".repeat(341));
    manager.dispose(session);
  });

  it("pauses the PTY while any attachment is behind, counting bytes on both sides", async () => {
    const { manager, fakePty, session } = await fakeSession();
    const first = events(manager.attach(session));
    const hello = (await first.next()).value as Extract<PtyStreamEvent, { kind: "hello" }>;
    const second = events(manager.attach(session));
    const secondHello = (await second.next()).value as Extract<PtyStreamEvent, { kind: "hello" }>;

    // Box-drawing characters are three bytes each: 50000 of them are 150000 bytes.
    fakePty.emitData(Buffer.from("─".repeat(50000)));
    expect(fakePty.pause).toHaveBeenCalledTimes(1);

    manager.acknowledge(session, hello.attachId, 150000);
    expect(fakePty.resume).not.toHaveBeenCalled();
    manager.acknowledge(session, secondHello.attachId, 140000);
    expect(fakePty.resume).toHaveBeenCalledTimes(1);

    await first.return(undefined);
    await second.return(undefined);
    manager.dispose(session);
  });

  it("redraws the foreground program on attach with a size", async () => {
    const { manager, session, fakePty } = await fakeSession();
    await collect(manager.attach(session, { size: { cols: 100, rows: 40 } }), 1);
    expect(fakePty.resize).toHaveBeenCalledWith(100, 40);
    manager.dispose(session);
  });

  it("ends the stream with exit after the process exits", async () => {
    const { manager, fakePty, session } = await fakeSession();
    const stream = events(manager.attach(session));
    await stream.next();
    fakePty.emitExit(3);
    await expect(stream.next()).resolves.toMatchObject({ value: { kind: "exit", code: 3 } });
    await expect(stream.next()).resolves.toMatchObject({ done: true });
    manager.dispose(session);
  });

  it("emits coalesced watch-all snapshots for plain output activity and resize changes", async () => {
    const manager = new SessionManager({}, { janitorIntervalMs: 60 * 60_000 });
    const response = manager.watchAllInfo(OWNER.key);
    const reader = response.body!.getReader();
    await expect(readEvent(reader)).resolves.toMatchObject({ type: "snapshot-batch", sessions: [] });

    const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
    const owner = OWNER;
    const opened = manager.open({
      command: process.execPath,
      args: ["-e", "process.stdout.write('plain output'); setTimeout(() => {}, 5000)"],
      cwd: root,
      env: {},
      cols: 80,
      rows: 24,
    }, owner);
    await expect(readEvent(reader)).resolves.toMatchObject({ type: "opened", sessionId: opened.sessionId });

    await expect(readEvent(reader)).resolves.toMatchObject({
      type: "snapshot",
      sessionId: opened.sessionId,
      info: expect.objectContaining({ bytesOut: expect.any(Number), lastActivityAt: expect.any(Number) }),
    });

    const session = manager.requireOwner(opened.sessionId, owner.key);
    manager.resize(session, 100, 30);
    await expect(readEvent(reader, 1200)).resolves.toMatchObject({
      type: "snapshot",
      sessionId: opened.sessionId,
      info: expect.objectContaining({ cols: 100, rows: 30 }),
    });

    await reader.cancel();
    manager.dispose(session);
  });

  it("trims stored scrollback when the per-session limit is lowered", async () => {
    const manager = new SessionManager({}, { janitorIntervalMs: 60 * 60_000 });
    const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
    const owner = OWNER;
    const opened = manager.open({
      command: process.execPath,
      args: ["-e", "process.stdout.write('a'.repeat(2048) + 'tail')"],
      cwd: root,
      env: {},
      cols: 80,
      rows: 24,
    }, owner);
    const session = manager.requireOwner(opened.sessionId, owner.key);

    await manager.awaitExit(session);
    manager.setScrollbackLimit(session, 1024);

    const scrollback = manager.getScrollback(session);
    expect(scrollback.text.length).toBeLessThanOrEqual(1024);
    expect(scrollback.text).toMatch(/a*tail$/);
    manager.dispose(session);
  });
});

async function fakeSession() {
  const manager = new SessionManager({}, { janitorIntervalMs: 60 * 60_000 });
  const fakePty = new FakePty();
  (manager as unknown as { pty: { spawn: () => FakePty } }).pty = { spawn: () => fakePty };
  const root = await mkdtemp(join(tmpdir(), "session-manager-test-"));
  const opened = manager.open(
    { command: process.execPath, args: [], cwd: root, env: {}, cols: 80, rows: 24 },
    OWNER
  );
  return { manager, fakePty, session: manager.requireOwner(opened.sessionId, OWNER.key) };
}

function events(response: Response): AsyncGenerator<PtyStreamEvent, void, undefined> {
  return readPtyStream(response.body!);
}

async function collect(response: Response, count: number): Promise<PtyStreamEvent[]> {
  const stream = events(response);
  const out: PtyStreamEvent[] = [];
  while (out.length < count) {
    const next = await stream.next();
    if (next.done) break;
    out.push(next.value);
  }
  await stream.return(undefined);
  return out;
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs = 1000): Promise<unknown> {
  const decoder = new TextDecoder();
  const next = await Promise.race([
    reader.read(),
    delay(timeoutMs).then(() => {
      throw new Error("timed out");
    }),
  ]);
  if (!next.value) return undefined;
  return JSON.parse(decoder.decode(next.value).trim());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakePty {
  pid = 123;
  private dataHandler: ((data: Buffer | string) => void) | undefined;
  private exitHandler: ((event: { exitCode: number; signal?: number }) => void) | undefined;
  pause = vi.fn();
  resume = vi.fn();
  write = vi.fn();
  resize = vi.fn();
  kill = vi.fn();

  onData(cb: (data: Buffer | string) => void): void {
    this.dataHandler = cb;
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitHandler = cb;
  }

  emitData(data: Buffer | string): void {
    this.dataHandler?.(data);
  }

  emitExit(exitCode = 0): void {
    this.exitHandler?.({ exitCode });
  }
}
