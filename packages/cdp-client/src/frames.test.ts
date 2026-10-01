import { describe, expect, it } from "vitest";
import { FrameRegistry, type FrameTransport } from "./frames";
class Transport implements FrameTransport {
  listeners = new Map<string, Set<(p: unknown) => void>>();
  closed = new Set<(e: Error) => void>();
  children = new Map<string, Transport>();
  send(): Promise<unknown> {
    return Promise.resolve({});
  }
  on(name: string, callback: (p: unknown) => void) {
    const set = this.listeners.get(name) ?? new Set();
    set.add(callback);
    this.listeners.set(name, set);
    return () => {
      set.delete(callback);
    };
  }
  onClosed(callback: (e: Error) => void) {
    this.closed.add(callback);
    return () => {
      this.closed.delete(callback);
    };
  }
  onDisconnect(callback: (e: Error) => void) {
    return this.onClosed(callback);
  }
  session(id: string) {
    let child = this.children.get(id);
    if (!child) {
      child = new Transport();
      this.children.set(id, child);
    }
    return child;
  }
  emit(name: string, value: unknown) {
    for (const callback of this.listeners.get(name) ?? []) callback(value);
  }
  context(frameId: string, id: number) {
    this.emit("Runtime.executionContextCreated", {
      context: { id, auxData: { isDefault: true, frameId } },
    });
  }
}
describe("frame lifecycle", () => {
  it("replaces destroyed execution contexts and waits through frame swaps", async () => {
    const transport = new Transport(),
      frames = new FrameRegistry(transport);
    transport.context("frame", 1);
    expect((await frames.resolve("frame")).contextId).toBe(1);
    transport.emit("Runtime.executionContextDestroyed", {
      executionContextId: 1,
    });
    transport.emit("Page.frameDetached", { frameId: "frame", reason: "swap" });
    const pending = frames.resolve("frame");
    transport.context("frame", 2);
    expect((await pending).contextId).toBe(2);
    frames.close();
    expect(
      [...transport.listeners.values()].every((set) => set.size === 0),
    ).toBe(true);
  });
  it("propagates authoritative detach and disconnect without deadlines", async () => {
    const transport = new Transport(),
      frames = new FrameRegistry(transport);
    const detached = frames.resolve("gone");
    transport.emit("Page.frameDetached", { frameId: "gone", reason: "remove" });
    await expect(detached).rejects.toThrow("detached");
    const pending = frames.resolve("slow");
    const error = new Error("provider disconnected");
    for (const callback of transport.closed) callback(error);
    await expect(pending).rejects.toBe(error);
    frames.close();
  });
  it("uses related iframe sessions without attaching unrelated pages", async () => {
    const transport = new Transport(),
      frames = new FrameRegistry(transport);
    transport.emit("Target.attachedToTarget", {
      sessionId: "page",
      targetInfo: { targetId: "other", type: "page" },
    });
    expect(transport.children.size).toBe(0);
    transport.emit("Target.attachedToTarget", {
      sessionId: "child",
      targetInfo: { targetId: "iframe", type: "iframe" },
    });
    const child = transport.session("child");
    child.context("iframe", 7);
    expect(await frames.resolve("iframe")).toEqual({
      channel: child,
      contextId: 7,
    });
    expect(frames.targetFrame(child)).toBe("iframe");
    frames.close();
  });
});
