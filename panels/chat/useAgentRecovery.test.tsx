// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentRecovery } from "./useAgentRecovery.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("agent recovery ownership", () => {
  it("restarts after StrictMode cancels its first effect", async () => {
    const signals: AbortSignal[] = [];
    const recover = vi.fn(async (signal: AbortSignal) => {
      signals.push(signal);
      await Promise.resolve();
      signal.throwIfAborted();
    });
    const onFailure = vi.fn();
    const { result } = renderHook(() => useAgentRecovery(recover, onFailure), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));
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
    const onFailure = vi.fn();
    const { result, rerender } = renderHook(
      ({ recover }) => useAgentRecovery(recover, onFailure),
      { initialProps: { recover: old } },
    );
    rerender({ recover: next });
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => rejectOld(new Error("abandoned")));
    expect(result.current).toMatchObject({ status: "idle", error: null });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("cancels retry backoff when unmounted", async () => {
    vi.useFakeTimers();
    const recover = vi.fn(async () => {
      throw new Error("not ready");
    });
    const onFailure = vi.fn();
    const { unmount } = renderHook(() => useAgentRecovery(recover, onFailure));
    await act(async () => {});
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reaches a terminal failure and permits an explicit fresh recovery", async () => {
    vi.useFakeTimers();
    const recover = vi.fn(async (): Promise<void> => {
      throw new Error("offline");
    });
    const onFailure = vi.fn();
    const { result } = renderHook(() => useAgentRecovery(recover, onFailure));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current).toMatchObject({
      status: "failed",
      error: "offline",
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
    recover.mockImplementation(async () => {});
    await act(async () => result.current.retry());
    expect(result.current).toMatchObject({ status: "idle", error: null });
  });
});
