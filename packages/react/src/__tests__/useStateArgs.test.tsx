// @vitest-environment jsdom
import { useCallback } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStateArgsRuntime } from "../../../runtime/src/panel/stateArgs.js";
import { asPanelSlotId } from "@vibestudio/shared/panel/idValues";
import { useAgentRecovery } from "../../../../panels/chat/useAgentRecovery.js";

const binding = vi.hoisted(() => ({ get: () => ({}) as unknown }));
vi.mock("@workspace/runtime", () => ({
  panel: { stateArgs: { get: () => binding.get() } },
  Rpc: {},
}));
import { useStateArgs } from "../hooks.js";

afterEach(cleanup);

describe("state args subscriptions", () => {
  it("does not restart agent recovery when an incoming item advances only the read cursor", async () => {
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
    const recover = vi.fn(async () => {});
    const onFailure = vi.fn();
    const { result } = renderHook(() => {
      const args = useStateArgs<typeof initial>();
      const recoverAgents = useCallback(
        async () => recover(),
        [args.installedAgents],
      );
      return { args, ...useAgentRecovery(recoverAgents, onFailure) };
    });
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(recover).toHaveBeenCalledTimes(1);

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
