import { describe, expect, it } from "vitest";
import { createTendril, type TendrilAgentRuntime } from "./agent.js";

function fakeRuntime() {
  const presentations: { slotId: string; deviceId: string | null; label: string }[] = [];
  const calls: { name: string; args: unknown[] }[] = [];
  const created: { source: string; o: unknown }[] = [];
  const presented: { slotId: string; request: unknown }[] = [];
  const rebuilt: string[] = [];
  const back: string[] = [];
  let failRebuild = false;
  const handle = (id: string) => ({
    id,
    call: {
      "tendril.eval": async (input: unknown) => ({ ok: true, value: { echo: input }, console: [] }),
      "tendril.fn": async (input: unknown) => ({ called: input }),
    } as Record<string, (...args: unknown[]) => Promise<unknown>>,
    async rebuild() {
      if (failRebuild) throw Object.assign(new Error("boot"), { failure: { code: "boot_stalled" } });
      rebuilt.push(id);
    },
    async requestPresentation(request: unknown) {
      presented.push({ slotId: id, request });
      return { state: "presented" as const };
    },
    async archive() {},
  });
  const rt: TendrilAgentRuntime = {
    rpc: {
      async call(_target: string, method: { name: string }, args: unknown[]) {
        calls.push({ name: method.name, args });
        if (method.name === "describe")
          return {
            tendrilId: "t",
            source: "panels/trip",
            channelId: "chan",
            contextId: "ctx",
            name: "Trip",
            about: null,
            presentations,
            functions: [],
            rev: 0,
          };
        return undefined;
      },
    } as TendrilAgentRuntime["rpc"],
    panelTree: {
      listPresentationTargets: async () => [
        { deviceId: "phone", label: "Phone", platform: "mobile", online: true, clientSessionId: "c1" },
        { deviceId: "tablet", label: "Tablet", platform: "mobile", online: false, clientSessionId: null },
      ],
      navigateHistory: async (id) => void back.push(id),
    },
    async createPanelSlot(source, o) {
      created.push({ source, o });
      const slotId = `slot-${created.length}`;
      return handle(slotId);
    },
    getPanelHandle: handle,
  };
  return {
    rt,
    calls,
    created,
    presented,
    rebuilt,
    back,
    presentations,
    failNextRebuild() {
      failRebuild = true;
    },
  };
}

describe("@workspace/tendril/agent", () => {
  it("creates a tendril and presents it as a panel naming the tendril", async () => {
    const f = fakeRuntime();
    const t = await createTendril(
      { source: "panels/trip", channelId: "chan", contextId: "ctx", name: "Trip", tendrilId: "t" },
      f.rt,
    );
    expect(f.calls[0]).toEqual({
      name: "create",
      args: [{ source: "panels/trip", channelId: "chan", contextId: "ctx", name: "Trip" }],
    });
    const result = await t.present("phone", { alert: "inbox" });
    expect(result).toEqual({ state: "presented", slotId: "slot-1" });
    expect(f.created[0]).toEqual({
      source: "panels/trip",
      o: {
        contextId: "ctx",
        stateArgs: { tendril: { tendrilId: "t", channelId: "chan", contextId: "ctx" } },
        title: "Trip",
        parentId: null,
      },
    });
    expect(f.presented[0]!.request).toEqual({ deviceId: "phone", focus: true, alert: "inbox" });
  });

  it("reuses the presentation already on a device", async () => {
    const f = fakeRuntime();
    f.presentations.push({ slotId: "slot-9", deviceId: "phone", label: "Phone" });
    const t = await createTendril({ source: "s", channelId: "chan", contextId: "ctx", name: "n" }, f.rt);
    expect((await t.present("phone")).slotId).toBe("slot-9");
    expect(f.created).toHaveLength(0);
  });

  it("updates live presentations, defers away devices, and reports failed builds", async () => {
    const f = fakeRuntime();
    f.presentations.push(
      { slotId: "slot-a", deviceId: "phone", label: "Phone" },
      { slotId: "slot-b", deviceId: "tablet", label: "Tablet" },
    );
    const t = await createTendril({ source: "s", channelId: "chan", contextId: "ctx", name: "n" }, f.rt);
    expect(await t.update()).toEqual([
      { slotId: "slot-a", outcome: "proven" },
      { slotId: "slot-b", outcome: "pending-device" },
    ]);
    f.failNextRebuild();
    expect((await t.update())[0]).toEqual({ slotId: "slot-a", outcome: { failed: { code: "boot_stalled" } } });
    await t.back();
    expect(f.back).toEqual(["slot-a"]);
  });

  it("reaches the page through its exposed functions", async () => {
    const f = fakeRuntime();
    f.presentations.push({ slotId: "slot-a", deviceId: "phone", label: "Phone" });
    const t = await createTendril({ source: "s", channelId: "chan", contextId: "ctx", name: "n" }, f.rt);
    expect(await t.eval("1 + 1")).toEqual({ echo: { code: "1 + 1" } });
    expect(await t.call("stop", { now: true })).toEqual({ called: { name: "stop", args: { now: true } } });
  });

  it("says when there is nowhere to reach the page", async () => {
    const f = fakeRuntime();
    const t = await createTendril({ source: "s", channelId: "chan", contextId: "ctx", name: "n" }, f.rt);
    await expect(t.eval("1")).rejects.toThrow("not presented anywhere yet");
  });
});
