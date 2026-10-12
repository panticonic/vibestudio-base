// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStateArgsRuntime } from "../../../runtime/src/panel/stateArgs.js";
import { asPanelSlotId } from "@vibestudio/shared/panel/idValues";

const binding = vi.hoisted(() => ({ get: () => ({}) as unknown }));
vi.mock("@workspace/runtime", () => ({
  panel: { stateArgs: { get: () => binding.get() } },
  Rpc: {},
}));
import { useStateArgs } from "../hooks.js";

afterEach(cleanup);

describe("state args subscriptions", () => {
  it("keeps unrelated field identity, so work keyed on it does not restart, when only the read cursor advances", async () => {
    const initial = {
      installedAgents: [{ key: "agent-1", config: { model: "test" } }],
      forkCursors: { chat: 1 },
    };
    const state = createStateArgsRuntime({
      slotId: asPanelSlotId("panel:tree/test"),
      call: vi.fn(),
      initial,
      changed: (detail) =>
        window.dispatchEvent(
          new CustomEvent("vibestudio:stateArgsChanged", { detail }),
        ),
    });
    binding.get = state.get;
    // Work keyed on `installedAgents` (as agent recovery is) runs once per identity.
    const recover = vi.fn();
    const { result } = renderHook(() => {
      const args = useStateArgs<typeof initial>();
      useEffect(() => {
        recover();
      }, [args.installedAgents]);
      return { args };
    });
    await waitFor(() => expect(recover).toHaveBeenCalledTimes(1));

    for (const chat of [2, 3, 4]) {
      await act(async () =>
        state.apply(
          JSON.parse(JSON.stringify({ ...initial, forkCursors: { chat } })),
        ),
      );
    }
    expect(result.current.args.forkCursors.chat).toBe(4);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(result.current.args.installedAgents).toBe(initial.installedAgents);

    await act(async () =>
      state.apply({
        ...initial,
        installedAgents: [{ key: "agent-2", config: { model: "other" } }],
      }),
    );
    expect(recover).toHaveBeenCalledTimes(2);
    expect(result.current.args.installedAgents[0]?.key).toBe("agent-2");
  });
});
