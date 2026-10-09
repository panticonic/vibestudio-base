// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostCommand } from "@workspace/runtime";

const host = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    connected: true,
    listeners,
    dispose: vi.fn(),
    register: vi.fn(),
  };
  state.register.mockImplementation(() => state.dispose);
  return state;
});
vi.mock("@workspace/runtime", () => ({
  Rpc: {},
  panel: { registerHostCommands: host.register },
  workspaceConnection: {
    get connected() {
      return host.connected;
    },
    subscribe(listener: () => void) {
      host.listeners.add(listener);
      return () => host.listeners.delete(listener);
    },
  },
}));
import { useHostCommands } from "../hooks.js";

afterEach(() => {
  cleanup();
  host.connected = true;
  host.register.mockClear();
  host.dispose.mockClear();
});

describe("useHostCommands", () => {
  it("registers with the latest handler and disposes only its own registration", () => {
    const commands: HostCommand[] = [{ id: "open", label: "Open" }];
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onRun }) => useHostCommands(commands, onRun),
      { initialProps: { onRun: first } },
    );
    expect(host.register).toHaveBeenCalledOnce();
    rerender({ onRun: second });
    expect(host.register).toHaveBeenCalledOnce();
    const run = host.register.mock.calls[0]![1] as (id: string) => void;
    run("open");
    expect(second).toHaveBeenCalledWith("open");
    expect(first).not.toHaveBeenCalled();
    unmount();
    expect(host.dispose).toHaveBeenCalledOnce();
  });

  it("re-registers when any command field changes", () => {
    const { rerender } = renderHook(
      ({ commands }) => useHostCommands(commands, () => undefined),
      {
        initialProps: {
          commands: [{ id: "drop", label: "Drop" }] as HostCommand[],
        },
      },
    );
    rerender({ commands: [{ id: "drop", label: "Drop", danger: true }] });
    expect(host.register).toHaveBeenCalledTimes(2);
    expect(host.dispose).toHaveBeenCalledOnce();
  });

  it("registers once a disconnected website connects", () => {
    host.connected = false;
    renderHook(() =>
      useHostCommands([{ id: "open", label: "Open" }], () => undefined),
    );
    expect(host.register).not.toHaveBeenCalled();
    act(() => {
      host.connected = true;
      for (const listener of host.listeners) listener();
    });
    expect(host.register).toHaveBeenCalledOnce();
  });
});
