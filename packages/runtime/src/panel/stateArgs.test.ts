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

  it("shares the canonical snapshot across a setter reply and duplicate host event", async () => {
    const initial = { config: { enabled: true }, cursor: 1 };
    const changed = vi.fn();
    const call = async <T>(_service: string, method: string): Promise<T> => {
      if (method === "workspace-state.panelTree.detail") {
        return {
          currentHistory: { state_args: JSON.stringify(initial) },
          entity: {},
        } as T;
      }
      return undefined as T;
    };
    const state = createStateArgsRuntime({
      slotId: asPanelSlotId("panel:tree/test"),
      initial,
      call,
      changed,
    });
    const reply = await state.set({ cursor: 2 });
    expect(reply).toBe(state.get());
    state.apply({ config: { enabled: true }, cursor: 2 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(state.get<typeof initial>().config).toBe(initial.config);
  });
});
