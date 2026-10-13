import { describe, expect, it, vi } from "vitest";
import { encodePtyStreamEvent, type PtyStreamEvent } from "@workspace/pty-stream";
import { VscodeTerminalProcessBridge } from "./vscodeTerminalProcess.js";

type Attach = (sessionId: string, opts?: unknown) => Promise<Response>;

function stream(): {
  response: Response;
  push(event: PtyStreamEvent): void;
  close(): void;
  error(err: Error): void;
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    })
  );
  return {
    response,
    push: (event) => {
      for (const frame of encodePtyStreamEvent(event)) controller.enqueue(frame);
    },
    close: () => controller.close(),
    error: (err) => controller.error(err),
  };
}

const HELLO: PtyStreamEvent = {
  kind: "hello",
  attachId: "a1",
  epoch: 0,
  start: 0,
  cursor: 0,
  alive: true,
  cols: 80,
  rows: 24,
};

function harness(attach: Attach) {
  let resubscribe: (() => Promise<void> | void) | null = null;
  const options = {
    sessionId: "session-1",
    shell: {
      attach: vi.fn(attach),
      acknowledge: vi.fn(async () => {}),
      write: vi.fn(async () => {}),
      resize: vi.fn(async () => {}),
    },
    recovery: {
      registerResubscribeHandler: (_name: string, fn: () => Promise<void> | void) => {
        resubscribe = fn;
        return () => (resubscribe = null);
      },
    },
    size: () => ({ cols: 120, rows: 40 }),
    onData: vi.fn(),
    onReset: vi.fn(),
    onGap: vi.fn(),
    onExit: vi.fn(),
    onError: vi.fn(),
    onRecovered: vi.fn(),
  };
  const bridge = new VscodeTerminalProcessBridge(options as never);
  return { bridge, options, resubscribe: () => resubscribe?.() };
}

describe("VscodeTerminalProcessBridge", () => {
  it("attaches fresh with its size, decodes split UTF-8 exactly, and resumes after the last byte on recovery", async () => {
    const first = stream();
    const second = stream();
    const streams = [first, second];
    const { bridge, options, resubscribe } = harness(async () => streams.shift()!.response);

    await bridge.start();
    expect(options.shell.attach).toHaveBeenCalledWith("session-1", { size: { cols: 120, rows: 40 } });
    const bytes = new TextEncoder().encode("é!");
    first.push(HELLO);
    first.push({ kind: "data", at: 0, bytes: bytes.subarray(0, 1) });
    first.push({ kind: "data", at: 1, bytes: bytes.subarray(1) });
    await vi.waitFor(() => expect(options.onData).toHaveBeenCalledTimes(2));
    expect(options.onData.mock.calls.map(([event]) => event.data).join("")).toBe("é!");

    first.error(new Error("connection lost"));
    await vi.waitFor(() => expect(options.onError).toHaveBeenCalledWith("connection lost"));
    await resubscribe();
    expect(options.shell.attach).toHaveBeenLastCalledWith("session-1", { after: { epoch: 0, cursor: 3 } });
    expect(options.onRecovered).toHaveBeenCalled();
    bridge.dispose();
  });

  it("forwards reset, gap and exit, and does not reattach after exit", async () => {
    const only = stream();
    const { bridge, options, resubscribe } = harness(async () => only.response);
    await bridge.start();
    only.push(HELLO);
    only.push({ kind: "gap", from: 0, to: 50 });
    only.push({ kind: "reset", epoch: 1, cursor: 50 });
    only.push({ kind: "exit", code: 2 });
    only.close();
    await vi.waitFor(() => expect(options.onExit).toHaveBeenCalledWith({ code: 2 }));
    expect(options.onGap).toHaveBeenCalledWith(50);
    expect(options.onReset).toHaveBeenCalled();
    await resubscribe();
    expect(options.shell.attach).toHaveBeenCalledTimes(1);
    expect(options.onError).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it("acknowledges parsed bytes on the attachment it was given", async () => {
    const only = stream();
    const { bridge, options } = harness(async () => only.response);
    await bridge.start();
    only.push(HELLO);
    await vi.waitFor(() => expect(options.shell.attach).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    bridge.acknowledge(10_000);
    await vi.waitFor(() =>
      expect(options.shell.acknowledge).toHaveBeenCalledWith("session-1", "a1", 10_000)
    );
    bridge.dispose();
  });
});
