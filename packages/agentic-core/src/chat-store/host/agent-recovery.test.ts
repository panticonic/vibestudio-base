import { describe, expect, it, vi } from "vitest";
import {
  AgentRecoveryRunner,
  type AgentRecoveryProgress,
  type AgentRecoveryState,
} from "./agent-recovery.js";

function runner() {
  const states: AgentRecoveryState[] = [];
  const recovery = new AgentRecoveryRunner((state) => states.push(state));
  return { recovery, states };
}

describe("agent recovery runner", () => {
  it("supersedes an attempt that a newer trigger replaced", async () => {
    const signals: AbortSignal[] = [];
    const recover = vi.fn(async (signal: AbortSignal) => {
      signals.push(signal);
      await Promise.resolve();
      signal.throwIfAborted();
    });
    const { recovery } = runner();
    recovery.run(recover);
    recovery.trigger();
    await vi.waitFor(() => expect(recovery.state.status).toBe("idle"));
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
    expect(recovery.state.attempt).toBe(2);
  });

  it("ignores an abandoned failure after a replacement task succeeds", async () => {
    let rejectOld!: (error: Error) => void;
    let oldSignal!: AbortSignal;
    const old = (signal: AbortSignal) => {
      oldSignal = signal;
      return new Promise<void>((_resolve, reject) => {
        rejectOld = reject;
      });
    };
    const { recovery } = runner();
    recovery.run(old);
    recovery.run(async () => {});
    await vi.waitFor(() => expect(recovery.state.status).toBe("idle"));
    expect(oldSignal.aborted).toBe(true);
    rejectOld(new Error("abandoned"));
    await Promise.resolve();
    expect(recovery.state).toMatchObject({ status: "idle", error: null, attempt: 1 });
  });

  it("makes one attempt per trigger: a failure is terminal until the next trigger, with no timer", async () => {
    vi.useFakeTimers();
    try {
      const recover = vi.fn<(signal: AbortSignal, progress: AgentRecoveryProgress) => Promise<void>>(
        async (_signal, progress) => {
          progress.missing(["ai-chat"]);
          throw new Error("worker build failed");
        }
      );
      const { recovery } = runner();
      recovery.run(recover);
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.state).toMatchObject({
        status: "failed",
        missing: ["ai-chat"],
        attempt: 1,
        error: {
          title: "@ai-chat didn't reconnect to this conversation",
          detail: "worker build failed",
        },
      });
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(recover).toHaveBeenCalledTimes(1);
      recover.mockImplementation(async () => {});
      recovery.trigger();
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.state).toMatchObject({ status: "idle", error: null, missing: [], attempt: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports progress and stops publishing after disposal", async () => {
    let finish!: () => void;
    const { recovery, states } = runner();
    recovery.run(
      (_signal, progress) =>
        new Promise<void>((resolve) => {
          progress.missing(["a", "b"]);
          finish = resolve;
        })
    );
    expect(recovery.state).toMatchObject({ status: "recovering", missing: ["a", "b"] });
    recovery.dispose();
    const published = states.length;
    finish();
    await Promise.resolve();
    expect(states).toHaveLength(published);
  });
});
