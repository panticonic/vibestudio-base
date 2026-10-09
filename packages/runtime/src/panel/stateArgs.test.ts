import { describe, expect, it, vi } from "vitest";
import { asPanelSlotId } from "@vibestudio/shared/panel/idValues";
import { createStateArgsRuntime } from "./stateArgs.js";

describe("state args snapshots", () => {
  it("retains equal branches while publishing changed values and removals", () => {
    const initial = {
      agents: [{ config: { model: "one" } }],
      cursor: 1,
      removed: true,
    };
    const changed = vi.fn();
    const state = createStateArgsRuntime({
      slotId: asPanelSlotId("panel:tree/test"),
      initial,
      call: vi.fn(),
      changed,
    });
    state.apply({
      cursor: 1,
      removed: true,
      agents: [{ config: { model: "one" } }],
    });
    expect(state.get()).toBe(initial);
    expect(changed).not.toHaveBeenCalled();
    state.apply({ agents: [{ config: { model: "one" } }], cursor: 2 });
    const next = state.get<typeof initial>();
    expect(next.agents).toBe(initial.agents);
    expect(next).toEqual({ agents: initial.agents, cursor: 2 });
    expect(changed).toHaveBeenCalledExactlyOnceWith(next);
    state.apply({ agents: [{ config: { model: "two" } }], cursor: 2 });
    expect(state.get<typeof initial>().agents).not.toBe(initial.agents);
    expect(state.get<typeof initial>().agents[0]?.config.model).toBe("two");
  });

  it("shares the canonical snapshot across a patch reply and duplicate host event", async () => {
    const initial = { config: { enabled: true }, cursor: 1 };
    const changed = vi.fn();
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const call = async <T>(
      _service: string,
      method: string,
      args: unknown[],
    ): Promise<T> => {
      calls.push({ method, args });
      if (method === "workspace-state.slot.patchCurrentStateArgs") {
        // The owner returns its authoritative merged result.
        return { config: { enabled: true }, cursor: 2 } as T;
      }
      throw new Error(`Unexpected RPC ${method}`);
    };
    const state = createStateArgsRuntime({
      slotId: asPanelSlotId("panel:tree/test"),
      initial,
      call,
      changed,
    });
    const reply = await state.patch({ cursor: 2 });
    expect(calls).toEqual([
      {
        method: "workspace-state.slot.patchCurrentStateArgs",
        args: ["panel:tree/test", { cursor: 2 }],
      },
    ]);
    expect(reply).toBe(state.get());
    state.apply({ config: { enabled: true }, cursor: 2 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(state.get<typeof initial>().config).toBe(initial.config);
  });

  it("propagates an owner refusal without touching the local snapshot", async () => {
    const initial = { cursor: 1 };
    const changed = vi.fn();
    const conflict = Object.assign(new Error("stateArgs patch conflicted"), {
      code: "PANEL_STATE_ARGS_CONFLICT",
    });
    const state = createStateArgsRuntime({
      slotId: asPanelSlotId("panel:tree/test"),
      initial,
      call: async () => {
        throw conflict;
      },
      changed,
    });
    await expect(state.patch({ cursor: 2 })).rejects.toBe(conflict);
    expect(state.get()).toBe(initial);
    expect(changed).not.toHaveBeenCalled();
  });
});
