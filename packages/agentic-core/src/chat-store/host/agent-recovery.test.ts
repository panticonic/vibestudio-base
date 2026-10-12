import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentRecoveryLoop, type AgentRecoveryState } from "./agent-recovery.js";

afterEach(() => {
  vi.useRealTimers();
});

function loop(onFailure = vi.fn()) {
  const states: AgentRecoveryState[] = [];
  const recovery = new AgentRecoveryLoop({
    onState: (state) => states.push(state),
    onFailure,
  });
  return { recovery, states, onFailure };
}

describe("agent recovery ownership", () => {
  it("restarts after its first generation is cancelled", async () => {
    const signals: AbortSignal[] = [];
    const recover = vi.fn(async (signal: AbortSignal) => {
      signals.push(signal);
      await Promise.resolve();
      signal.throwIfAborted();
    });
    const { recovery, onFailure } = loop();
    recovery.run(recover);
    recovery.retry();
    await vi.waitFor(() => expect(recovery.state.status).toBe("idle"));
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("ignores an abandoned failure after a replacement recovery succeeds", async () => {
    let rejectOld!: (error: Error) => void;
    let oldSignal!: AbortSignal;
    const old = (signal: AbortSignal) => {
      oldSignal = signal;
      return new Promise<void>((_resolve, reject) => {
        rejectOld = reject;
      });
    };
    const next = vi.fn(async () => {});
    const { recovery, onFailure } = loop();
    recovery.run(old);
    recovery.run(next);
    await vi.waitFor(() => expect(recovery.state.status).toBe("idle"));
    expect(oldSignal.aborted).toBe(true);
    rejectOld(new Error("abandoned"));
    await Promise.resolve();
    expect(recovery.state).toEqual({ status: "idle", error: null });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("cancels retry backoff when disposed", async () => {
    vi.useFakeTimers();
    const recover = vi.fn(async () => {
      throw new Error("not ready");
    });
    const { recovery } = loop();
    recovery.run(recover);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    recovery.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reaches a terminal failure and permits an explicit fresh recovery", async () => {
    vi.useFakeTimers();
    const recover = vi.fn(async (): Promise<void> => {
      throw new Error("offline");
    });
    const { recovery, onFailure } = loop();
    recovery.run(recover);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recovery.state).toEqual({ status: "failed", error: "offline" });
    expect(onFailure).toHaveBeenCalledTimes(1);
    recover.mockImplementation(async () => {});
    recovery.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(recovery.state).toEqual({ status: "idle", error: null });
  });
});
